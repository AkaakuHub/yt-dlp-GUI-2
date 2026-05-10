use crate::tools::manifest::{
    artifact_filename, find_tool_artifact, load_tools_manifest_from_release, sha256_file,
};
use crate::tools::path::DownloadProgress;
use crate::tools::path::{
    find_ffmpeg_recursive, get_tools_dir, resolve_tool_paths, run_tool_version,
};
use tauri::{Emitter, Window};
use tokio::fs as TokioFs;
use tokio::io::AsyncWriteExt;
use tokio::process::Command as TokioCommand;

#[tauri::command]
pub async fn download_bundle_tools(window: tauri::Window) -> Result<String, String> {
    let os_type = std::env::consts::OS;
    let arch = std::env::consts::ARCH;

    let binaries_dir = get_tools_dir()?;

    if !binaries_dir.exists() {
        TokioFs::create_dir_all(&binaries_dir)
            .await
            .map_err(|e| format!("Failed to create binaries directory: {}", e))?;
    }

    let app_version = env!("CARGO_PKG_VERSION");
    let manifest = load_tools_manifest_from_release(app_version).await?;

    window
        .emit(
            "download-progress",
            DownloadProgress {
                tool_name: "yt-dlp".to_string(),
                progress: 0.0,
                status: "Getting latest version...".to_string(),
            },
        )
        .unwrap();

    let yt_dlp_artifact = find_tool_artifact(&manifest, "yt-dlp", os_type, arch)?;
    let yt_dlp_path = binaries_dir.join(if cfg!(target_os = "windows") {
        "yt-dlp.exe"
    } else {
        "yt-dlp"
    });

    download_file_with_progress(
        &yt_dlp_artifact.url,
        &yt_dlp_path,
        &window,
        "yt-dlp",
        Some(&yt_dlp_artifact.sha256),
    )
    .await?;

    window
        .emit(
            "download-progress",
            DownloadProgress {
                tool_name: "ffmpeg".to_string(),
                progress: 0.0,
                status: "Getting latest version...".to_string(),
            },
        )
        .unwrap();

    let ffmpeg_artifact = find_tool_artifact(&manifest, "ffmpeg", os_type, arch)?;
    let ffmpeg_filename = artifact_filename(ffmpeg_artifact)?;
    let ffmpeg_archive_path = binaries_dir.join(ffmpeg_filename);
    download_file_with_progress(
        &ffmpeg_artifact.url,
        &ffmpeg_archive_path,
        &window,
        "ffmpeg",
        Some(&ffmpeg_artifact.sha256),
    )
    .await?;

    if cfg!(target_os = "windows") {
        extract_zip(&ffmpeg_archive_path, &binaries_dir)?;
    } else if cfg!(target_os = "macos") {
        extract_zip(&ffmpeg_archive_path, &binaries_dir)?;

        #[cfg(any(target_os = "linux", target_os = "macos"))]
        {
            use std::os::unix::fs::PermissionsExt;
            if let Ok(found) = find_ffmpeg_recursive(&binaries_dir) {
                if !found.is_empty() {
                    if let Ok(meta) = std::fs::metadata(&found) {
                        let mut perms = meta.permissions();
                        perms.set_mode(0o755);
                        let _ = std::fs::set_permissions(&found, perms);
                    }
                }
            }
        }
    } else {
        extract_tar_xz(&ffmpeg_archive_path, &binaries_dir).await?;
    }

    TokioFs::remove_file(ffmpeg_archive_path).await.ok();

    window
        .emit(
            "download-progress",
            DownloadProgress {
                tool_name: "deno".to_string(),
                progress: 0.0,
                status: "Getting latest version...".to_string(),
            },
        )
        .unwrap();

    let deno_artifact = find_tool_artifact(&manifest, "deno", os_type, arch)?;
    let deno_filename = artifact_filename(&deno_artifact)?;
    let deno_archive_path = binaries_dir.join(deno_filename);
    download_file_with_progress(
        &deno_artifact.url,
        &deno_archive_path,
        &window,
        "deno",
        Some(&deno_artifact.sha256),
    )
    .await?;

    extract_zip(&deno_archive_path, &binaries_dir)?;
    TokioFs::remove_file(deno_archive_path).await.ok();

    #[cfg(any(target_os = "linux", target_os = "macos"))]
    {
        use std::os::unix::fs::PermissionsExt;
        let deno_path = binaries_dir.join("deno");
        if deno_path.exists() {
            let mut perms = std::fs::metadata(&deno_path).unwrap().permissions();
            perms.set_mode(0o755);
            std::fs::set_permissions(&deno_path, perms).unwrap();
        }
    }

    Ok("All tools downloaded successfully".to_string())
}

#[tauri::command]
pub async fn ensure_bundle_tools(
    window: tauri::Window,
    app_state: tauri::State<'_, crate::config::AppState>,
) -> Result<String, String> {
    let use_bundle = {
        let s = app_state.settings.lock().await;
        s.use_bundle_tools
    };

    if !use_bundle {
        return Ok("skipped".to_string());
    }

    let app_version = env!("CARGO_PKG_VERSION");
    let manifest = load_tools_manifest_from_release(app_version).await?;

    let os_type = std::env::consts::OS;
    let arch = std::env::consts::ARCH;
    let binaries_dir = get_tools_dir()?;
    if !binaries_dir.exists() {
        TokioFs::create_dir_all(&binaries_dir)
            .await
            .map_err(|e| format!("Failed to create binaries directory: {}", e))?;
    }

    let (yt_path, ff_path, deno_path) = resolve_tool_paths(true, "", "", "")?;

    let mut updated_any = false;

    if let Some(tool) = manifest.tools.get("yt-dlp") {
        let expected = tool.version.as_deref().unwrap_or("").trim();
        let current = run_tool_version(&yt_path, "--version")
            .and_then(|s| s.lines().next().map(|l| l.trim().to_string()))
            .unwrap_or_default();
        if current != expected {
            updated_any = true;
            window
                .emit(
                    "download-progress",
                    DownloadProgress {
                        tool_name: "yt-dlp".to_string(),
                        progress: 0.0,
                        status: "Updating...".to_string(),
                    },
                )
                .ok();
            let art = find_tool_artifact(&manifest, "yt-dlp", os_type, arch)?;
            let dst = binaries_dir.join(if cfg!(target_os = "windows") {
                "yt-dlp.exe"
            } else {
                "yt-dlp"
            });
            download_file_with_progress(&art.url, &dst, &window, "yt-dlp", Some(&art.sha256))
                .await?;
        }
    }

    if let Some(tool) = manifest.tools.get("deno") {
        let expected = tool
            .version
            .as_deref()
            .unwrap_or("")
            .trim()
            .trim_start_matches('v');
        let current = run_tool_version(&deno_path, "--version")
            .and_then(|s| s.lines().next().map(|l| l.trim().to_string()))
            .and_then(|l| l.split_whitespace().nth(1).map(|v| v.to_string()))
            .unwrap_or_default();
        if current != expected {
            updated_any = true;
            window
                .emit(
                    "download-progress",
                    DownloadProgress {
                        tool_name: "deno".to_string(),
                        progress: 0.0,
                        status: "Updating...".to_string(),
                    },
                )
                .ok();
            let art = find_tool_artifact(&manifest, "deno", os_type, arch)?;
            let filename = artifact_filename(&art)?;
            let archive_path = binaries_dir.join(filename);
            download_file_with_progress(
                &art.url,
                &archive_path,
                &window,
                "deno",
                Some(&art.sha256),
            )
            .await?;
            extract_zip(&archive_path, &binaries_dir)?;
            TokioFs::remove_file(archive_path).await.ok();
        }
    }

    if let Some(tool) = manifest.tools.get("ffmpeg") {
        let expected = tool.version.as_deref().unwrap_or("").trim();
        let current_ok = run_tool_version(&ff_path, "-version")
            .map(|s| s.contains(expected))
            .unwrap_or(false);
        if !current_ok {
            updated_any = true;
            window
                .emit(
                    "download-progress",
                    DownloadProgress {
                        tool_name: "ffmpeg".to_string(),
                        progress: 0.0,
                        status: "Updating...".to_string(),
                    },
                )
                .ok();
            let art = find_tool_artifact(&manifest, "ffmpeg", os_type, arch)?;
            let filename = artifact_filename(&art)?;
            let archive_path = binaries_dir.join(&filename);
            download_file_with_progress(
                &art.url,
                &archive_path,
                &window,
                "ffmpeg",
                Some(&art.sha256),
            )
            .await?;

            if cfg!(target_os = "windows") {
                extract_zip(&archive_path, &binaries_dir)?;
            } else if cfg!(target_os = "macos") {
                extract_zip(&archive_path, &binaries_dir)?;
            } else {
                extract_tar_xz(&archive_path, &binaries_dir).await?;
            }
            TokioFs::remove_file(&archive_path).await.ok();

            let found = find_ffmpeg_recursive(&binaries_dir)?;
            if !found.trim().is_empty() {
                let stable = binaries_dir.join(if cfg!(target_os = "windows") {
                    "ffmpeg.exe"
                } else {
                    "ffmpeg"
                });
                let _ = std::fs::copy(&found, &stable);
                #[cfg(any(target_os = "linux", target_os = "macos"))]
                {
                    use std::os::unix::fs::PermissionsExt;
                    if let Ok(meta) = std::fs::metadata(&stable) {
                        let mut perms = meta.permissions();
                        perms.set_mode(0o755);
                        let _ = std::fs::set_permissions(&stable, perms);
                    }
                }
            }
        }
    }

    if updated_any {
        return Ok("downloaded".to_string());
    }
    Ok("ok".to_string())
}

async fn download_file_with_progress(
    url: &str,
    path: &std::path::Path,
    window: &Window,
    tool_name: &str,
    expected_sha256: Option<&str>,
) -> Result<(), String> {
    let response = reqwest::get(url)
        .await
        .map_err(|e| format!("Failed to download {}: {}", tool_name, e))?;

    if !response.status().is_success() {
        return Err(format!(
            "Failed to download {}: HTTP {}",
            tool_name,
            response.status()
        ));
    }

    let total_size = response.content_length().unwrap_or(0);
    let mut downloaded = 0u64;
    let mut stream = response.bytes_stream();

    let mut file = TokioFs::File::create(path)
        .await
        .map_err(|e| format!("Failed to create file: {}", e))?;

    use futures_util::StreamExt;

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Failed to read chunk: {}", e))?;
        file.write_all(&chunk)
            .await
            .map_err(|e| format!("Failed to write chunk: {}", e))?;

        downloaded += chunk.len() as u64;
        let progress = if total_size > 0 {
            (downloaded as f64 / total_size as f64) * 100.0
        } else {
            0.0
        };

        window
            .emit(
                "download-progress",
                DownloadProgress {
                    tool_name: tool_name.to_string(),
                    progress,
                    status: "Downloading...".to_string(),
                },
            )
            .unwrap();
    }

    #[cfg(any(target_os = "linux", target_os = "macos"))]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = std::fs::metadata(path).unwrap().permissions();
        perms.set_mode(0o755);
        std::fs::set_permissions(path, perms).unwrap();
    }

    if let Some(expected) = expected_sha256 {
        window
            .emit(
                "download-progress",
                DownloadProgress {
                    tool_name: tool_name.to_string(),
                    progress: 100.0,
                    status: "Verifying...".to_string(),
                },
            )
            .unwrap();

        let actual = sha256_file(path)?;
        if actual.to_lowercase() != expected.to_lowercase() {
            let _ = std::fs::remove_file(path);
            return Err(format!(
                "{}のSHA256が一致しません。expected={}, actual={}",
                tool_name, expected, actual
            ));
        }
    }

    Ok(())
}

fn extract_zip(
    archive_path: &std::path::Path,
    extract_dir: &std::path::Path,
) -> Result<(), String> {
    use zip::ZipArchive;

    let file =
        std::fs::File::open(archive_path).map_err(|e| format!("Failed to open zip file: {}", e))?;

    let mut archive =
        ZipArchive::new(file).map_err(|e| format!("Failed to read zip archive: {}", e))?;

    for i in 0..archive.len() {
        let mut file = archive
            .by_index(i)
            .map_err(|e| format!("Failed to get file from zip: {}", e))?;

        let outpath = extract_dir.join(file.name());

        if file.name().ends_with('/') {
            std::fs::create_dir_all(&outpath)
                .map_err(|e| format!("Failed to create directory: {}", e))?;
        } else {
            if let Some(parent) = outpath.parent() {
                std::fs::create_dir_all(parent)
                    .map_err(|e| format!("Failed to create parent directory: {}", e))?;
            }

            let mut outfile = std::fs::File::create(&outpath)
                .map_err(|e| format!("Failed to create output file: {}", e))?;

            std::io::copy(&mut file, &mut outfile)
                .map_err(|e| format!("Failed to extract file: {}", e))?;
        }
    }

    Ok(())
}

async fn extract_tar_xz(
    archive_path: &std::path::Path,
    extract_dir: &std::path::Path,
) -> Result<(), String> {
    let output = TokioCommand::new("tar")
        .arg("-xf")
        .arg(archive_path)
        .arg("-C")
        .arg(extract_dir)
        .output()
        .await
        .map_err(|e| format!("Failed to extract tar.xz: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "tar extraction failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    Ok(())
}
