use base64::{engine::general_purpose::STANDARD, Engine};
use serde::Serialize;
use std::{
    path::{Path, PathBuf},
    time::Duration,
};
#[tauri::command]
pub fn system_palette() -> Vec<String> {
    #[link(name = "user32")]
    extern "system" {
        fn GetSysColor(index: i32) -> u32;
    }
    (0..31)
        .map(|index| {
            let color = unsafe { GetSysColor(index) };
            format!(
                "#{:02x}{:02x}{:02x}",
                color & 255,
                (color >> 8) & 255,
                (color >> 16) & 255
            )
        })
        .collect()
}
#[derive(Serialize)]
pub struct Profile {
    id: i64,
    name: String,
    picture: String,
    nation: String,
}
#[derive(Serialize)]
pub struct Roster {
    drivers: Vec<Profile>,
    cars: Vec<Profile>,
}
#[tauri::command]
pub async fn load_roster(choose: bool) -> Result<Option<Roster>, String> {
    let path = if choose {
        let Some(file) = rfd::AsyncFileDialog::new()
            .set_directory(r"C:\ProgramData\Cockpit-V2\Database.sqlite")
            .pick_file()
            .await
        else {
            return Ok(None);
        };
        file.path().to_owned()
    } else {
        PathBuf::from(r"C:\ProgramData\Cockpit-V2\Database.sqlite\cpv2stamm")
    };
    read_roster(&path).map(Some)
}
fn read_roster(path: &Path) -> Result<Roster, String> {
    let root = path
        .parent()
        .and_then(Path::parent)
        .ok_or("Datenverzeichnis fehlt")?;
    let db =
        rusqlite::Connection::open_with_flags(&path, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)
            .map_err(|e| e.to_string())?;
    db.busy_timeout(Duration::from_secs(2))
        .map_err(|e| e.to_string())?;
    let read = |query: &str| -> Result<Vec<Profile>, String> {
        let mut statement = db.prepare(query).map_err(|e| e.to_string())?;
        let rows = statement
            .query_map([], |r| {
                let pic = r.get::<_, Option<String>>(2)?.unwrap_or_default();
                let picture = if pic.is_empty() {
                    String::new()
                } else {
                    root.join("Bilder").join(pic).to_string_lossy().into_owned()
                };
                Ok(Profile {
                    id: r.get(0)?,
                    name: r.get::<_, Option<String>>(1)?.unwrap_or_default(),
                    picture,
                    nation: {
                        let name = r.get::<_, Option<String>>(3)?.unwrap_or_default();
                        let mut p = root.join("Flaggen").join(&name);
                        if p.extension().is_none() {
                            p.set_extension("bmp");
                        }
                        if !name.is_empty() && p.is_file() {
                            p.to_string_lossy().into_owned()
                        } else {
                            String::new()
                        }
                    },
                })
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())
    };
    Ok(Roster {
        drivers: read(
            "SELECT ID,Driver,Picture,Nation FROM DriverItems ORDER BY Driver LIMIT 2000",
        )?,
        cars: read("SELECT ID,Car,Picture,'' FROM CarItems ORDER BY Car LIMIT 5000")?,
    })
}
#[tauri::command]
pub async fn profile_image(path: String) -> Result<String, String> {
    let p = Path::new(&path);
    let ext = p
        .extension()
        .unwrap_or_default()
        .to_string_lossy()
        .to_ascii_lowercase();
    let mime = match ext.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "bmp" => "image/bmp",
        "gif" => "image/gif",
        _ => return Err("Nicht unterstütztes Bildformat".into()),
    };
    if std::fs::metadata(p).map_err(|e| e.to_string())?.len() > 25_000_000 {
        return Err("Bild größer als 25 MB".into());
    }
    Ok(format!(
        "data:{mime};base64,{}",
        STANDARD.encode(std::fs::read(p).map_err(|e| e.to_string())?)
    ))
}
#[tauri::command]
pub async fn cockpit_snapshot(base: String) -> Result<serde_json::Value, String> {
    let base = reqwest::Url::parse(&base).map_err(|e| e.to_string())?;
    if !["http", "https"].contains(&base.scheme())
        || !base.username().is_empty()
        || base.password().is_some()
    {
        return Err("Bitte eine HTTP(S)-Adresse ohne Zugangsdaten angeben".into());
    }
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(3))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|e| e.to_string())?;
    let mut result = serde_json::Map::new();
    for (key, endpoint) in [
        ("status", "rennstatus"),
        ("drivers", "renndaten"),
        ("profiles", "sFahrer"),
        ("settings", "sAllgemeinedaten"),
    ] {
        let url = base
            .join(&format!("/api/rbs/{endpoint}"))
            .map_err(|e| e.to_string())?;
        let response = client
            .get(url)
            .send()
            .await
            .map_err(|e| e.to_string())?
            .error_for_status()
            .map_err(|e| e.to_string())?;
        if response.content_length().unwrap_or(0) > 2_000_000 {
            return Err("API-Antwort zu groß".into());
        }
        let bytes = response.bytes().await.map_err(|e| e.to_string())?;
        if bytes.len() > 2_000_000 {
            return Err("API-Antwort zu groß".into());
        }
        result.insert(
            key.into(),
            serde_json::from_slice(&bytes).map_err(|e| e.to_string())?,
        );
    }
    Ok(serde_json::Value::Object(result))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    #[test]
    fn roster_is_read_only_and_resolves_images() {
        let temp = tempfile::tempdir().unwrap();
        let folder = temp.path().join("Database.sqlite");
        std::fs::create_dir(&folder).unwrap();
        std::fs::create_dir(temp.path().join("Flaggen")).unwrap();
        std::fs::write(temp.path().join("Flaggen/Deutschland.bmp"), b"image").unwrap();
        let path = folder.join("cpv2stamm");
        let db = rusqlite::Connection::open(&path).unwrap();
        db.execute_batch("CREATE TABLE DriverItems (ID INTEGER, Driver TEXT, Picture TEXT, Nation TEXT); CREATE TABLE CarItems (ID INTEGER, Car TEXT, Picture TEXT); INSERT INTO DriverItems VALUES (1,'Test','driver.png','Deutschland'); INSERT INTO CarItems VALUES (2,'GT3',NULL);").unwrap();
        drop(db);
        let before = std::fs::read(&path).unwrap();
        let roster = read_roster(&path).unwrap();
        assert_eq!(roster.drivers[0].name, "Test");
        assert!(roster.drivers[0].picture.ends_with("driver.png"));
        assert!(roster.drivers[0].nation.ends_with("Deutschland.bmp"));
        assert_eq!(roster.cars[0].picture, "");
        assert_eq!(std::fs::read(&path).unwrap(), before);
        assert!(read_roster(&folder.join("missing")).is_err());
        assert!(!folder.join("missing").exists());
    }
    #[test]
    fn cockpit_client_uses_only_documented_get_endpoints() {
        let server = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let address = server.local_addr().unwrap();
        let worker = std::thread::spawn(move || {
            for endpoint in ["rennstatus", "renndaten", "sFahrer", "sAllgemeinedaten"] {
                let (mut stream, _) = server.accept().unwrap();
                stream
                    .set_read_timeout(Some(Duration::from_secs(3)))
                    .unwrap();
                let mut buffer = [0u8; 4096];
                let size = stream.read(&mut buffer).unwrap();
                assert!(String::from_utf8_lossy(&buffer[..size])
                    .starts_with(&format!("GET /api/rbs/{endpoint} HTTP/1.1")));
                let body = if endpoint == "rennstatus" {
                    r#"{"rennzeit":1234,"rennstatus":1}"#
                } else if endpoint == "sAllgemeinedaten" {
                    "{}"
                } else {
                    "[]"
                };
                write!(stream, "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}", body.len(),body).unwrap();
            }
        });
        let snapshot =
            tauri::async_runtime::block_on(cockpit_snapshot(format!("http://{address}"))).unwrap();
        assert_eq!(snapshot["status"]["rennzeit"], 1234);
        assert!(snapshot["drivers"].is_array());
        worker.join().unwrap();
        assert!(
            tauri::async_runtime::block_on(cockpit_snapshot("file:///C:/test".into())).is_err()
        );
    }
}

#[tauri::command]
pub async fn open_addon() -> Result<Option<serde_json::Value>, String> {
    let Some(file) = rfd::AsyncFileDialog::new()
        .add_filter("Cockpit AddOn-Quelltext", &["xml"])
        .set_directory(r"C:\ProgramData\Cockpit-V2\AddOn")
        .pick_file()
        .await
    else {
        return Ok(None);
    };
    read_addon(file.path()).map(Some)
}
#[tauri::command]
pub async fn load_installed_addon(path: String) -> Result<serde_json::Value, String> {
    read_addon(Path::new(&path))
}
#[tauri::command]
pub fn list_installed_addons() -> Result<Vec<serde_json::Value>, String> {
    scan_addons(Path::new(r"C:\ProgramData\Cockpit-V2\AddOn"))
}
fn scan_addons(root: &Path) -> Result<Vec<serde_json::Value>, String> {
    fn walk(
        root: &Path,
        dir: &Path,
        depth: usize,
        result: &mut Vec<serde_json::Value>,
    ) -> Result<(), String> {
        if depth > 3 || result.len() >= 500 {
            return Ok(());
        }
        for item in std::fs::read_dir(dir).map_err(|e| e.to_string())? {
            let item = item.map_err(|e| e.to_string())?;
            let kind = item.file_type().map_err(|e| e.to_string())?;
            let name = item.file_name().to_string_lossy().to_string();
            let lower = name.to_lowercase();
            if kind.is_symlink() {
                continue;
            }
            if kind.is_dir()
                && !lower.contains("backup")
                && !["rbs-studio", "node_modules", ".git"].contains(&lower.as_str())
            {
                walk(root, &item.path(), depth + 1, result)?;
            } else if kind.is_file() && lower == "addon.cps.xml" {
                let path = item.path();
                result.push(serde_json::json!({"name":dir.strip_prefix(root).unwrap_or(dir).to_string_lossy(),"path":path.to_string_lossy()}));
            }
            if result.len() >= 500 {
                break;
            }
        }
        Ok(())
    }
    let mut result = Vec::new();
    walk(root, root, 0, &mut result)?;
    result.sort_by_key(|v| v["name"].as_str().unwrap_or_default().to_lowercase());
    Ok(result)
}
fn read_addon(path: &Path) -> Result<serde_json::Value, String> {
    let root = path.parent().ok_or("AddOn-Ordner fehlt")?;
    let read = |p: &Path| -> Result<String, String> {
        let b = crate::read_bytes(p)?;
        if b.len() > 2_000_000 {
            return Err("AddOn-Datei größer als 2 MB".into());
        }
        crate::decode(&b).map(|(s, _)| s)
    };
    let source = read(path)?;
    if !source.contains("<AddOnClasses") && !source.contains("<AddOn ") {
        return Err(
            "Bitte AddOn.cps.xml auswählen; kompilierte ILC-Dateien sind nicht unterstützt".into(),
        );
    }
    let cfg = root.join("ConfigPackage.xml");
    let config = if cfg.is_file() {
        read(&cfg)?
    } else {
        String::new()
    };
    let mut screens = serde_json::Map::new();
    let mut files = serde_json::Map::new();
    let mut warnings = Vec::<String>::new();
    for item in std::fs::read_dir(root).map_err(|e| e.to_string())? {
        let item = item.map_err(|e| e.to_string())?;
        let p = item.path();
        if !item.file_type().map_err(|e| e.to_string())?.is_file() {
            continue;
        }
        if p.extension()
            .map(|x| x.eq_ignore_ascii_case("txt"))
            .unwrap_or(false)
            && files.len() < 64
        {
            match read(&p) {
                Ok(text) => {
                    files.insert(
                        item.file_name().to_string_lossy().into_owned(),
                        serde_json::Value::String(text),
                    );
                }
                Err(e) => warnings.push(format!(
                    "Virtuelle Datei {}: {e}",
                    item.file_name().to_string_lossy()
                )),
            }
        }
        if p == path
            || p == cfg
            || !p
                .extension()
                .map(|x| x.eq_ignore_ascii_case("xml"))
                .unwrap_or(false)
        {
            continue;
        }
        if screens.len() >= 32 {
            warnings.push("Maximal 32 Overlay-Dateien werden geladen".into());
            break;
        }
        match read(&p) {
            Ok(s) if s.contains("<RennScreen") => match crate::open_file(&p) {
                Ok(opened) => {
                    warnings.extend(opened.warnings);
                    screens.insert(
                        item.file_name().to_string_lossy().into_owned(),
                        serde_json::json!({"source":opened.source,"assets":opened.assets}),
                    );
                }
                Err(e) => warnings.push(format!(
                    "Overlay {}: {e}",
                    item.file_name().to_string_lossy()
                )),
            },
            Err(e) => warnings.push(format!("{}: {e}", item.file_name().to_string_lossy())),
            _ => {}
        }
    }
    Ok(
        serde_json::json!({"name":root.strip_prefix(r"C:\ProgramData\Cockpit-V2\AddOn").unwrap_or(root).to_string_lossy(),"source":source,"config":config,"screens":screens,"files":files,"warnings":warnings,
        "virtualPath":format!("virtual:\\addons\\{}",root.strip_prefix(r"C:\ProgramData\Cockpit-V2\AddOn").unwrap_or_else(|_|Path::new(root.file_name().unwrap_or_default())).to_string_lossy())}),
    )
}

#[cfg(test)]
mod addon_tests {
    use super::*;
    #[test]
    fn addon_import_reads_source_configuration_and_valid_overlays_only() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("AddOn.cps.xml");
        let source = r#"<?xml version="1.0" encoding="utf-8"?><AddOnClasses><StartRealTime>begin end.</StartRealTime></AddOnClasses>"#;
        std::fs::write(&path, source).unwrap();
        std::fs::write(dir.path().join("ConfigPackage.xml"), "<ConfigPackage/>").unwrap();
        std::fs::write(dir.path().join("Overlay.xml"),r#"<RennScreen><base><dim xmax="400" ymax="100"/></base><grafik/><texte/><variablen/></RennScreen>"#).unwrap();
        std::fs::write(dir.path().join("Other.xml"), "<Other/>").unwrap();
        std::fs::write(dir.path().join("State.txt"), "original").unwrap();
        let loaded = read_addon(&path).unwrap();
        assert_eq!(loaded["source"], source);
        assert!(loaded["screens"]["Overlay.xml"].is_object());
        assert_eq!(loaded["screens"].as_object().unwrap().len(), 1);
        assert_eq!(loaded["files"]["State.txt"], "original");
        assert_eq!(std::fs::read_to_string(&path).unwrap(), source);
        assert!(read_addon(&dir.path().join("Other.xml")).is_err());
        assert_eq!(scan_addons(dir.path()).unwrap().len(), 1);
    }
}
