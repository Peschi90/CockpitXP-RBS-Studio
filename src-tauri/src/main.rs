#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod integrations;
mod text_metrics;
use base64::{engine::general_purpose::STANDARD, Engine};
use quick_xml::{events::Event, Reader};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeMap,
    fs,
    io::Write,
    path::{Component, Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};
const DEFAULT_LIBRARY: &str = r"C:\ProgramData\Cockpit-V2\RennBildschirm";
const MAX_XML: u64 = 12_000_000;

fn hash(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
fn error(e: impl std::fmt::Display) -> String {
    e.to_string()
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Opened {
    path: String,
    source: String,
    encoding: String,
    hash: String,
    assets: BTreeMap<String, String>,
    warnings: Vec<String>,
}
#[derive(Serialize)]
struct LibraryEntry {
    path: String,
    name: String,
    category: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveRequest {
    path: String,
    source: String,
    encoding: String,
    expected_hash: Option<String>,
    source_path: Option<String>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Saved {
    path: String,
    hash: String,
    backup: Option<String>,
    encoding: String,
}
fn read_bytes(path: &Path) -> Result<Vec<u8>, String> {
    if fs::metadata(path).map_err(error)?.len() > MAX_XML {
        return Err("XML-Datei ist größer als 12 MB.".into());
    }
    fs::read(path).map_err(error)
}
fn decode(bytes: &[u8]) -> Result<(String, String), String> {
    if bytes.starts_with(&[0xff, 0xfe]) || bytes.starts_with(&[0xfe, 0xff]) {
        return Err("UTF-16 wird derzeit nicht unterstützt. Bitte eine UTF-8- oder ISO-8859-1-Kopie verwenden.".into());
    }
    let head = String::from_utf8_lossy(&bytes[..bytes.len().min(200)]).to_lowercase();
    if head.contains("iso-8859-1") || head.contains("latin1") {
        return Ok((bytes.iter().map(|b| *b as char).collect(), "latin1".into()));
    }
    if head.contains("windows-1252") {
        let (s, _, failed) = encoding_rs::WINDOWS_1252.decode(bytes);
        if failed {
            return Err("Zeichencodierung ist ungültig.".into());
        }
        return Ok((s.into_owned(), "windows-1252".into()));
    }
    let bom = bytes.starts_with(&[0xef, 0xbb, 0xbf]);
    String::from_utf8(if bom {
        bytes[3..].to_vec()
    } else {
        bytes.to_vec()
    })
    .map(|s| (s, if bom { "utf-8-bom" } else { "utf-8" }.into()))
    .map_err(|_| {
        "Unbekannte Zeichencodierung. Erwartet UTF-8, ISO-8859-1 oder Windows-1252.".into()
    })
}
fn encode(source: &str, encoding: &str) -> Result<Vec<u8>, String> {
    match encoding {
        "latin1" => Ok(source
            .chars()
            .flat_map(|c| {
                if (c as u32) <= 255 {
                    vec![c as u8]
                } else {
                    format!("&#{};", c as u32).into_bytes()
                }
            })
            .collect()),
        "windows-1252" => {
            let (bytes, _, _) = encoding_rs::WINDOWS_1252.encode(source);
            Ok(bytes.into_owned())
        }
        "utf-8" => Ok(source.as_bytes().to_vec()),
        "utf-8-bom" => {
            let mut bytes = vec![0xef, 0xbb, 0xbf];
            bytes.extend_from_slice(source.as_bytes());
            Ok(bytes)
        }
        _ => Err("Nicht unterstützte Zeichencodierung.".into()),
    }
}
fn output_encoding(source: &str, previous: &str) -> Result<String, String> {
    let mut reader = Reader::from_str(source);
    let declared = match reader.read_event().map_err(error)? {
        Event::Decl(decl) => decl
            .encoding()
            .transpose()
            .map_err(error)?
            .map(|value| String::from_utf8_lossy(&value).to_lowercase()),
        _ => None,
    };
    match declared.as_deref().unwrap_or("utf-8") {
        "iso-8859-1" | "latin1" => Ok("latin1".into()),
        "windows-1252" => Ok("windows-1252".into()),
        "utf-8" | "utf8" => Ok(if previous == "utf-8-bom" {
            "utf-8-bom"
        } else {
            "utf-8"
        }
        .into()),
        value => Err(format!("Nicht unterstützte XML-Codierung: {value}")),
    }
}
fn validate(source: &str) -> Result<Vec<String>, String> {
    let mut reader = Reader::from_str(source);
    let mut root = false;
    let mut depth = 0usize;
    let mut refs = Vec::new();
    loop {
        let event = reader.read_event().map_err(error)?;
        let empty = matches!(&event, Event::Empty(_));
        match event {
            Event::DocType(_) => return Err("DTD ist in RBS Studio nicht erlaubt.".into()),
            Event::Start(e) | Event::Empty(e) => {
                if depth == 0 {
                    if root || e.name().as_ref() != b"RennScreen" {
                        return Err("Genau ein RennScreen-Wurzelelement ist erforderlich.".into());
                    }
                    root = true;
                }
                if !empty {
                    depth += 1;
                }
                for a in e.attributes() {
                    let a = a.map_err(error)?;
                    if [b"bimage".as_slice(), b"file", b"symbolname"].contains(&a.key.as_ref()) {
                        let value = a.unescape_value().map_err(error)?.into_owned();
                        if !value.is_empty() && !refs.contains(&value) {
                            refs.push(value);
                        }
                    }
                }
            }
            Event::End(_) => {
                depth = depth.checked_sub(1).ok_or("Unerwartetes XML-Endelement.")?;
            }
            Event::Text(t) => {
                let text = t.unescape().map_err(error)?;
                if depth == 0 && !text.trim().is_empty() {
                    return Err("Text außerhalb des XML-Wurzelelements.".into());
                }
            }
            Event::Eof => break,
            _ => {}
        }
    }
    if !root || depth != 0 {
        return Err("Leere oder unvollständige XML-Datei.".into());
    }
    Ok(refs)
}
fn image_path(parent: &Path, name: &str) -> Option<PathBuf> {
    let rel = Path::new(name);
    if rel.is_absolute() {
        return if rel.is_file() {
            Some(rel.to_owned())
        } else {
            None
        };
    }
    let direct = parent.join(rel);
    if direct.is_file() {
        return Some(direct);
    }
    for ancestor in parent.ancestors() {
        let images = ancestor.join("Bilder").join(rel);
        if images.is_file() {
            return Some(images);
        }
    }
    None
}
fn assets_for(path: &Path, source: &str) -> (BTreeMap<String, String>, Vec<String>) {
    let mut assets = BTreeMap::new();
    let mut warnings = Vec::new();
    let mut total = 0;
    for name in validate(source).unwrap_or_default() {
        if let Some(p) = image_path(path.parent().unwrap_or(Path::new(".")), &name) {
            let ext = p
                .extension()
                .unwrap_or_default()
                .to_string_lossy()
                .to_lowercase();
            let mime = match ext.as_str() {
                "png" => "image/png",
                "jpg" | "jpeg" => "image/jpeg",
                "bmp" => "image/bmp",
                "gif" => "image/gif",
                "webp" => "image/webp",
                _ => {
                    warnings.push(format!("Bildformat nicht unterstützt: {name}"));
                    continue;
                }
            };
            let size = fs::metadata(&p).map(|m| m.len()).unwrap_or(u64::MAX);
            if size > 25_000_000 || total + size > 150_000_000 {
                warnings.push(format!("Bild zu groß für Vorschau: {name}"));
                continue;
            }
            if let Ok(bytes) = fs::read(&p) {
                total += size;
                assets.insert(
                    name,
                    format!("data:{mime};base64,{}", STANDARD.encode(bytes)),
                );
            }
        } else {
            warnings.push(format!("Bild nicht gefunden: {name}"));
        }
    }
    (assets, warnings)
}
fn open_file(path: &Path) -> Result<Opened, String> {
    let bytes = read_bytes(path)?;
    let (source, encoding) = decode(&bytes)?;
    validate(&source)?;
    let (assets, warnings) = assets_for(path, &source);
    Ok(Opened {
        path: path.to_string_lossy().into(),
        source,
        encoding,
        hash: hash(&bytes),
        assets,
        warnings,
    })
}
#[tauri::command]
async fn open_document(path: Option<String>) -> Result<Option<Opened>, String> {
    let path = if let Some(p) = path {
        PathBuf::from(p)
    } else {
        match rfd::AsyncFileDialog::new()
            .add_filter("Cockpit-XP Rennbildschirm", &["xml"])
            .set_directory(DEFAULT_LIBRARY)
            .pick_file()
            .await
        {
            Some(p) => p.path().to_owned(),
            None => return Ok(None),
        }
    };
    open_file(&path).map(Some)
}
#[tauri::command]
async fn choose_save_path(suggested: String) -> Option<String> {
    let p = Path::new(&suggested);
    let mut dialog = rfd::AsyncFileDialog::new()
        .add_filter("Cockpit-XP Rennbildschirm", &["xml"])
        .set_file_name(p.file_name().unwrap_or_default().to_string_lossy());
    if let Some(parent) = p.parent().filter(|p| p.is_dir()) {
        dialog = dialog.set_directory(parent);
    }
    dialog
        .save_file()
        .await
        .map(|f| f.path().to_string_lossy().into())
}
#[tauri::command]
async fn choose_library() -> Option<String> {
    rfd::AsyncFileDialog::new()
        .set_directory(DEFAULT_LIBRARY)
        .pick_folder()
        .await
        .map(|p| p.path().to_string_lossy().into())
}
#[tauri::command]
async fn list_library(root: Option<String>) -> Result<Vec<LibraryEntry>, String> {
    let root = PathBuf::from(root.unwrap_or_else(|| DEFAULT_LIBRARY.into()));
    scan_library(&root)
}
fn scan_library(root: &Path) -> Result<Vec<LibraryEntry>, String> {
    if !root.is_dir() {
        return Err("RBS-Verzeichnis nicht gefunden. Bitte einen Ordner wählen.".into());
    }
    let mut files = Vec::new();
    for entry in walkdir::WalkDir::new(&root)
        .max_depth(8)
        .follow_links(false)
        .into_iter()
        // Cockpit's generated resolution cache is not an editable source library.
        // An explicitly selected ConvertRBS root remains browsable.
        .filter_entry(|entry| {
            entry.depth() == 0
                || !entry.file_type().is_dir()
                || !entry.file_name().eq_ignore_ascii_case("ConvertRBS")
        })
        .filter_map(Result::ok)
    {
        let p = entry.path();
        if !entry.file_type().is_file()
            || !p.extension().is_some_and(|x| x.eq_ignore_ascii_case("xml"))
        {
            continue;
        }
        if let Ok(bytes) = read_bytes(p) {
            if let Ok((source, _)) = decode(&bytes) {
                if source.contains("<RennScreen>") || source.contains("<RennScreen ") {
                    let parent = p.parent().unwrap_or(&root);
                    files.push(LibraryEntry {
                        path: p.to_string_lossy().into(),
                        name: format!(
                            "{} · {}",
                            parent.file_name().unwrap_or_default().to_string_lossy(),
                            p.file_stem().unwrap_or_default().to_string_lossy()
                        ),
                        category: parent
                            .strip_prefix(&root)
                            .unwrap_or(parent)
                            .to_string_lossy()
                            .into(),
                    });
                }
            }
        }
        if files.len() >= 2000 {
            break;
        }
    }
    files.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(files)
}
fn save_file(req: SaveRequest) -> Result<Saved, String> {
    let refs = validate(&req.source)?;
    let encoding = output_encoding(&req.source, &req.encoding)?;
    let path = PathBuf::from(&req.path);
    if !path
        .extension()
        .is_some_and(|e| e.eq_ignore_ascii_case("xml"))
    {
        return Err("Bitte mit der Dateiendung .xml speichern.".into());
    }
    let parent = path.parent().ok_or("Zielverzeichnis fehlt.")?;
    if !parent.is_dir() {
        return Err("Zielverzeichnis existiert nicht.".into());
    }
    let existing = if path.exists() {
        Some(read_bytes(&path)?)
    } else {
        None
    };
    if let Some(expected) = &req.expected_hash {
        if existing.as_ref().map(|b| hash(b)).as_ref() != Some(expected) {
            return Err("Die Datei wurde außerhalb von RBS Studio geändert oder gelöscht. Bitte neu öffnen oder unter einem anderen Namen speichern.".into());
        }
    }
    let bytes = encode(&req.source, &encoding)?;
    // All asset conflicts are checked before writing any destination files.
    let mut copies = Vec::new();
    if let Some(source_path) = &req.source_path {
        let source_parent = Path::new(source_path)
            .parent()
            .ok_or("Quellverzeichnis fehlt.")?;
        if source_parent != parent {
            for name in refs {
                let rel = Path::new(&name);
                if rel.is_absolute()
                    || rel.components().any(|c| {
                        matches!(
                            c,
                            Component::ParentDir | Component::RootDir | Component::Prefix(_)
                        )
                    })
                {
                    return Err(format!("Bildpfad '{name}' ist nicht portabel. Bitte zuerst einen relativen Bildnamen innerhalb des RBS-Ordners verwenden."));
                }
                let src = image_path(source_parent, &name)
                    .ok_or_else(|| format!("Bild fehlt: {name}. Kopie wurde nicht gespeichert."))?;
                let dest = parent.join(&rel);
                let content = fs::read(&src).map_err(error)?;
                if dest.exists() {
                    if fs::read(&dest).map_err(error)? != content {
                        return Err(format!("Im Ziel existiert ein anderes Bild '{name}'. Bitte einen eigenen, leeren RBS-Ordner wählen."));
                    }
                } else {
                    copies.push((dest, content));
                }
            }
        }
    }
    let mut temp = tempfile::NamedTempFile::new_in(parent).map_err(error)?;
    temp.write_all(&bytes).map_err(error)?;
    temp.as_file().sync_all().map_err(error)?;
    // Recheck immediately before committing, after preparation and asset validation.
    if existing.as_ref().map(|b| hash(b))
        != if path.exists() {
            Some(hash(&read_bytes(&path)?))
        } else {
            None
        }
    {
        return Err(
            "Die Zieldatei wurde während des Speicherns geändert. Bitte erneut öffnen.".into(),
        );
    }
    let backup = if let Some(old) = &existing {
        if old == &bytes && copies.is_empty() {
            return Ok(Saved {
                path: req.path,
                hash: hash(&bytes),
                backup: None,
                encoding,
            });
        }
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(error)?
            .as_nanos();
        let backup = path.with_file_name(format!(
            "{}.rbs-studio-{stamp}.bak",
            path.file_name().unwrap().to_string_lossy()
        ));
        let mut file = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&backup)
            .map_err(error)?;
        file.write_all(old).map_err(error)?;
        file.sync_all().map_err(error)?;
        Some(backup.to_string_lossy().into())
    } else {
        None
    };
    let mut created = Vec::new();
    let result = (|| -> Result<(), String> {
        for (dest, content) in copies {
            if let Some(p) = dest.parent() {
                fs::create_dir_all(p).map_err(error)?;
            }
            let mut f = fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&dest)
                .map_err(error)?;
            created.push(dest);
            f.write_all(&content).map_err(error)?;
            f.sync_all().map_err(error)?;
        }
        temp.persist(&path).map_err(error)?;
        Ok(())
    })();
    if let Err(err) = result {
        for p in created {
            let _ = fs::remove_file(p);
        }
        return Err(err);
    }
    Ok(Saved {
        path: req.path,
        hash: hash(&bytes),
        backup,
        encoding,
    })
}
#[tauri::command]
async fn save_document(request: SaveRequest) -> Result<Saved, String> {
    save_file(request)
}
#[tauri::command]
async fn import_image(document_path: Option<String>) -> Result<Option<String>, String> {
    let document_path=document_path.ok_or("Bitte den RBS zuerst speichern, damit Bilder im zugehörigen Ordner abgelegt werden können.")?;
    let parent = Path::new(&document_path)
        .parent()
        .ok_or("RBS-Verzeichnis fehlt.")?
        .to_owned();
    let Some(file) = rfd::AsyncFileDialog::new()
        .add_filter("Bilder", &["png", "jpg", "jpeg", "bmp", "gif", "webp"])
        .pick_file()
        .await
    else {
        return Ok(None);
    };
    let name = file
        .path()
        .file_name()
        .ok_or("Dateiname fehlt.")?
        .to_string_lossy()
        .into_owned();
    let dest = parent.join(&name);
    let data = fs::read(file.path()).map_err(error)?;
    if dest.exists() {
        if fs::read(&dest).map_err(error)? != data {
            return Err("Ein anderes Bild mit diesem Namen ist bereits vorhanden. Bitte das neue Bild vorher umbenennen.".into());
        }
    } else {
        let mut f = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(dest)
            .map_err(error)?;
        f.write_all(&data).map_err(error)?;
    }
    Ok(Some(name))
}
#[tauri::command]
async fn load_assets(path: String, source: String) -> (BTreeMap<String, String>, Vec<String>) {
    assets_for(Path::new(&path), &source)
}
#[tauri::command]
async fn confirm_discard() -> bool {
    rfd::AsyncMessageDialog::new()
        .set_title("Ungespeicherte Änderungen")
        .set_description("Änderungen verwerfen? Zum Behalten bitte abbrechen und zuerst speichern.")
        .set_buttons(rfd::MessageButtons::YesNo)
        .set_level(rfd::MessageLevel::Warning)
        .show()
        .await
        == rfd::MessageDialogResult::Yes
}
fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            integrations::open_addon,
            integrations::list_installed_addons,
            integrations::load_installed_addon,
            integrations::load_roster,
            integrations::system_palette,
            integrations::profile_image,
            integrations::cockpit_snapshot,
            text_metrics::measure_rbs_text,
            open_document,
            choose_save_path,
            choose_library,
            list_library,
            save_document,
            import_image,
            load_assets,
            confirm_discard
        ])
        .run(tauri::generate_context!())
        .expect("RBS Studio konnte nicht gestartet werden");
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn library_excludes_conversion_cache_but_keeps_real_variants() {
        let dir = tempfile::tempdir().unwrap();
        for name in [
            "mp/Control/Rennen.xml",
            "mp/Cards/Rennen.xml",
            "mp/Cards/Variant/Rennen.xml",
            "ConvertRBS/0/mp/Control/Rennen.xml",
            "convertRBS/1/mp/Cards/Rennen.xml",
        ] {
            let path = dir.path().join(name);
            fs::create_dir_all(path.parent().unwrap()).unwrap();
            fs::write(path, XML).unwrap();
        }
        assert_eq!(scan_library(dir.path()).unwrap().len(), 3);
        assert_eq!(
            scan_library(&dir.path().join("ConvertRBS")).unwrap().len(),
            2
        );
    }
    const XML:&str="<?xml version=\"1.0\" encoding=\"iso-8859-1\"?><RennScreen><base><dim xmax=\"1920\" ymax=\"1080\"/></base><texte><text text=\"Grüße\"/></texte></RennScreen>";
    fn request(path: &Path, source: &str, expected: Option<String>) -> SaveRequest {
        SaveRequest {
            path: path.to_string_lossy().into(),
            source: source.into(),
            encoding: "latin1".into(),
            expected_hash: expected,
            source_path: None,
        }
    }
    #[test]
    fn latin1_roundtrip_and_unicode() {
        let bytes = encode(XML, "latin1").unwrap();
        assert_eq!(decode(&bytes).unwrap().0, XML);
        assert_eq!(encode("🏁", "latin1").unwrap(), b"&#127937;");
    }
    #[test]
    fn malformed_xml_is_rejected_before_writing() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("Rennen.xml");
        for bad in [
            "<RennScreen>",
            "<RennScreen/><RennScreen/>",
            "<!DOCTYPE RennScreen><RennScreen/>",
            "<RennScreen><x></RennScreen>",
        ] {
            assert!(save_file(request(&path, bad, None)).is_err());
            assert!(!path.exists());
        }
    }
    #[test]
    fn encoding_follows_explicit_xml_declaration() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("Rennen.xml");
        let source = XML
            .replace("iso-8859-1", "utf-8")
            .replace("Grüße", "Grüße 🏁");
        let result = save_file(request(&path, &source, None)).unwrap();
        assert_eq!(result.encoding, "utf-8");
        assert_eq!(String::from_utf8(fs::read(path).unwrap()).unwrap(), source);
    }
    #[test]
    fn installed_library_encodes_byte_identically() {
        let root = std::env::var("RBS_TEST_ROOT").unwrap_or_else(|_| DEFAULT_LIBRARY.into());
        if !Path::new(&root).is_dir() {
            return;
        }
        let mut count = 0;
        for entry in walkdir::WalkDir::new(root)
            .into_iter()
            .filter_map(Result::ok)
        {
            let p = entry.path();
            if !p.is_file() || !p.extension().is_some_and(|x| x.eq_ignore_ascii_case("xml")) {
                continue;
            }
            let bytes = read_bytes(p).unwrap();
            let Ok((source, encoding)) = decode(&bytes) else {
                continue;
            };
            if !source.contains("<RennScreen") {
                continue;
            }
            validate(&source).unwrap_or_else(|e| panic!("{}: {e}", p.display()));
            assert_eq!(
                encode(&source, &output_encoding(&source, &encoding).unwrap()).unwrap(),
                bytes,
                "{}",
                p.display()
            );
            count += 1;
        }
        println!("{count} installed RBS files verified without modification");
        assert!(count > 0);
    }
    #[test]
    fn unchanged_file_is_byte_identical() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("Rennen.xml");
        let b = encode(XML, "latin1").unwrap();
        fs::write(&p, &b).unwrap();
        let opened = open_file(&p).unwrap();
        let s = save_file(request(&p, &opened.source, Some(opened.hash))).unwrap();
        assert!(s.backup.is_none());
        assert_eq!(fs::read(p).unwrap(), b);
    }
    #[test]
    fn backup_and_conflict_protection() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("Rennen.xml");
        let b = encode(XML, "latin1").unwrap();
        fs::write(&p, &b).unwrap();
        let s = save_file(request(&p, &XML.replace("Grüße", "Neu"), Some(hash(&b)))).unwrap();
        assert_eq!(fs::read(s.backup.unwrap()).unwrap(), b);
        let current = fs::read(&p).unwrap();
        assert!(save_file(request(&p, XML, Some(hash(&b)))).is_err());
        assert_eq!(fs::read(p).unwrap(), current);
    }
    #[test]
    fn copy_includes_images_and_refuses_collisions() {
        let source = tempfile::tempdir().unwrap();
        let dest = tempfile::tempdir().unwrap();
        fs::write(source.path().join("bg.png"), b"image").unwrap();
        let xml = XML.replace("xmax=", "bimage=\"bg.png\" xmax=");
        let mut r = request(&dest.path().join("Rennen.xml"), &xml, None);
        r.source_path = Some(source.path().join("Rennen.xml").to_string_lossy().into());
        save_file(r).unwrap();
        assert_eq!(fs::read(dest.path().join("bg.png")).unwrap(), b"image");
        fs::write(dest.path().join("bg.png"), b"different").unwrap();
        let mut r = request(&dest.path().join("Copy.xml"), &xml, None);
        r.source_path = Some(source.path().join("Rennen.xml").to_string_lossy().into());
        assert!(save_file(r).is_err());
        assert!(!dest.path().join("Copy.xml").exists());
    }
}
