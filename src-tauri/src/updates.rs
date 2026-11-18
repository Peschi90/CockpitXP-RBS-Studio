use reqwest::{Client, Url};
use semver::Version;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{io::Write, sync::Mutex, time::Duration};
use tauri::{ipc::Channel, AppHandle, State};

const REPOSITORY: &str = "Peschi90/CockpitXP-RBS-Studio";
const MAX_INSTALLER: u64 = 512 * 1024 * 1024;

#[derive(Clone, Deserialize)]
struct Asset {
    name: String,
    size: u64,
    browser_download_url: String,
    digest: Option<String>,
    state: String,
}

#[derive(Deserialize)]
struct Release {
    tag_name: String,
    draft: bool,
    prerelease: bool,
    assets: Vec<Asset>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateOffer {
    version: String,
    current_version: String,
    size: u64,
}

struct Candidate {
    offer: UpdateOffer,
    asset: Asset,
}

#[derive(Default)]
pub struct UpdateState(Mutex<Option<Candidate>>);

#[derive(Clone, Serialize)]
pub struct Progress {
    downloaded: u64,
    total: u64,
}

fn version(tag: &str) -> Option<Version> {
    Version::parse(tag.strip_prefix('v').unwrap_or(tag)).ok()
}

fn installer_arch() -> &'static str {
    match std::env::consts::ARCH {
        "x86_64" => "x64",
        "aarch64" => "arm64",
        "x86" => "x86",
        _ => "unsupported",
    }
}

fn candidate(release: Release, installed: &str, arch: &str) -> Option<Candidate> {
    let next = version(&release.tag_name)?;
    let current = version(installed)?;
    if release.draft
        || release.prerelease
        || !next.pre.is_empty()
        || !next.cmp_precedence(&current).is_gt()
    {
        return None;
    }
    let prefix = format!("/{REPOSITORY}/releases/download/{}/", release.tag_name);
    let names = [
        format!("RBS.Studio_{next}_{arch}-setup.exe"),
        format!("RBS Studio_{next}_{arch}-setup.exe"),
    ];
    let asset = release.assets.into_iter().find(|a| {
        let Ok(url) = Url::parse(&a.browser_download_url) else {
            return false;
        };
        names.contains(&a.name)
            && a.state == "uploaded"
            && a.size > 0
            && a.size <= MAX_INSTALLER
            && url.scheme() == "https"
            && url.host_str() == Some("github.com")
            && url.path().starts_with(&prefix)
            && url.username().is_empty()
            && url.password().is_none()
            && url.port().is_none()
            && url.query().is_none()
            && url.fragment().is_none()
    })?;
    Some(Candidate {
        offer: UpdateOffer {
            version: next.to_string(),
            current_version: installed.into(),
            size: asset.size,
        },
        asset,
    })
}

fn client(timeout: Duration) -> Result<Client, String> {
    Client::builder()
        .user_agent(concat!("RBS-Studio/", env!("CARGO_PKG_VERSION")))
        .https_only(true)
        .connect_timeout(Duration::from_secs(4))
        .timeout(timeout)
        .build()
        .map_err(|e| e.to_string())
}

async fn latest() -> Result<Release, String> {
    client(Duration::from_secs(6))?
        .get(format!(
            "https://api.github.com/repos/{REPOSITORY}/releases/latest"
        ))
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())
}

// A failed startup check is intentionally indistinguishable from no update.
#[tauri::command]
pub async fn check_for_update(
    state: State<'_, UpdateState>,
) -> Result<Option<UpdateOffer>, String> {
    let Ok(release) = latest().await else {
        return Ok(None);
    };
    let Some(update) = candidate(release, env!("CARGO_PKG_VERSION"), installer_arch()) else {
        return Ok(None);
    };
    let offer = update.offer.clone();
    *state.0.lock().map_err(|e| e.to_string())? = Some(update);
    Ok(Some(offer))
}

fn verify_download(asset: &Asset, size: u64, digest: &str) -> Result<(), String> {
    if size != asset.size {
        return Err("Der Download ist unvollständig. Bitte erneut versuchen.".into());
    }
    if let Some(expected) = &asset.digest {
        if expected != &format!("sha256:{digest}") {
            return Err(
                "Die Prüfsumme des Installers stimmt nicht. Bitte erneut versuchen.".into(),
            );
        }
    }
    Ok(())
}

async fn download(
    asset: &Asset,
    progress: &Channel<Progress>,
) -> Result<tempfile::TempDir, String> {
    let directory = tempfile::Builder::new()
        .prefix("rbs-studio-update-")
        .tempdir()
        .map_err(|e| e.to_string())?;
    let mut file =
        std::fs::File::create(directory.path().join("setup.exe")).map_err(|e| e.to_string())?;
    let mut response = client(Duration::from_secs(600))?
        .get(&asset.browser_download_url)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?;
    let mut downloaded = 0;
    let mut digest = Sha256::new();
    let mut last_percent = 0;
    while let Some(chunk) = response.chunk().await.map_err(|e| e.to_string())? {
        downloaded += chunk.len() as u64;
        if downloaded > asset.size {
            return Err("Der Installer hat eine unerwartete Dateigröße.".into());
        }
        file.write_all(&chunk).map_err(|e| e.to_string())?;
        digest.update(&chunk);
        let percent = downloaded * 100 / asset.size;
        if percent != last_percent {
            let _ = progress.send(Progress {
                downloaded,
                total: asset.size,
            });
            last_percent = percent;
        }
    }
    verify_download(asset, downloaded, &format!("{:x}", digest.finalize()))?;
    file.sync_all().map_err(|e| e.to_string())?;
    Ok(directory)
}

#[tauri::command]
pub async fn install_update(
    app: AppHandle,
    state: State<'_, UpdateState>,
    progress: Channel<Progress>,
) -> Result<(), String> {
    // Consume the checked release to prevent concurrent downloads or arbitrary URLs from IPC.
    let update = state
        .0
        .lock()
        .map_err(|e| e.to_string())?
        .take()
        .ok_or("Kein geprüftes Update verfügbar.")?;
    let result = async {
        let directory = download(&update.asset, &progress).await?;
        std::process::Command::new(directory.path().join("setup.exe"))
            .spawn()
            .map_err(|e| format!("Der Installer konnte nicht gestartet werden. {e}"))?;
        // NSIS must retain access to the file after this process exits.
        let _ = directory.keep();
        app.exit(0);
        Ok(())
    }
    .await;
    if result.is_err() {
        *state.0.lock().map_err(|e| e.to_string())? = Some(update);
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    fn release(tag: &str) -> Release {
        Release {
            tag_name: tag.into(),
            draft: false,
            prerelease: false,
            assets: vec![Asset {
                name: format!("RBS.Studio_{}_x64-setup.exe", tag.trim_start_matches('v')),
                size: 3,
                state: "uploaded".into(),
                digest: None,
                browser_download_url: format!(
                    "https://github.com/{REPOSITORY}/releases/download/{tag}/setup.exe"
                ),
            }],
        }
    }
    #[test]
    fn selects_only_newer_stable_matching_installers() {
        assert!(candidate(release("v0.10.0"), "0.9.0", "x64").is_some());
        assert!(candidate(release("v0.7.2"), "0.7.2", "x64").is_none());
        assert!(candidate(release("v0.6.0"), "0.7.2", "x64").is_none());
        assert!(candidate(release("v1.0.0-beta.1"), "0.7.2", "x64").is_none());
        assert!(candidate(release("v1.0.0"), "0.7.2", "arm64").is_none());
        let mut r = release("v1.0.0");
        r.prerelease = true;
        assert!(candidate(r, "0.7.2", "x64").is_none());
        let mut r = release("v1.0.0");
        r.assets[0].browser_download_url = "https://example.com/setup.exe".into();
        assert!(candidate(r, "0.7.2", "x64").is_none());
        let mut r = release("v1.0.0");
        r.assets[0].name = "RBS.Studio.exe".into();
        assert!(candidate(r, "0.7.2", "x64").is_none());
    }
    #[test]
    fn rejects_truncated_and_corrupt_downloads() {
        let mut a = release("v1.0.0").assets.remove(0);
        let digest = format!("{:x}", Sha256::digest(b"abc"));
        a.digest = Some(format!("sha256:{digest}"));
        assert!(verify_download(&a, 3, &digest).is_ok());
        assert!(verify_download(&a, 2, &digest).is_err());
        assert!(verify_download(&a, 3, "bad").is_err());
        a.digest = None;
        assert!(verify_download(&a, 3, &digest).is_ok());
    }

    #[test]
    #[ignore = "Downloads the public GitHub installer without executing it"]
    fn github_installer_download() {
        tauri::async_runtime::block_on(async {
            let release = latest().await.unwrap();
            let update = candidate(release, "0.0.0", installer_arch()).unwrap();
            let directory = download(&update.asset, &Channel::new(|_| Ok(())))
                .await
                .unwrap();
            let bytes = std::fs::read(directory.path().join("setup.exe")).unwrap();
            assert!(bytes.starts_with(b"MZ"));
            assert_eq!(bytes.len() as u64, update.asset.size);
        });
    }
}
