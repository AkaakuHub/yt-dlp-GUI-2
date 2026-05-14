use crate::config::{AppState, VerifyCache};
use crate::tools::manifest::{
    artifact_filename, find_tool_artifact, load_tools_manifest_from_release, sha256_file,
};
use crate::tools::path::DownloadProgress;
use crate::tools::path::{
    find_ffmpeg_recursive, get_tools_dir, resolve_tool_paths, run_tool_version, tool_cache_mtime,
};
use tauri::State;
use tauri::{Emitter, Window};
use tokio::fs as TokioFs;
use tokio::io::AsyncWriteExt;
use tokio::process::Command as TokioCommand;

#[tauri::command]
pub async fn download_bundle_tools(
    window: tauri::Window,
    app_state: State<'_, AppState>,
) -> Result<String, String> {
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

    let yt_dlp_version = manifest
        .tools
        .get("yt-dlp")
        .and_then(|tool| tool.version.as_deref());
    let yt_dlp_artifact = find_tool_artifact(&manifest, "yt-dlp", os_type, arch)?;
    install_yt_dlp_artifact(yt_dlp_artifact, &binaries_dir, &window).await?;
    let (yt_path, _, _) = resolve_tool_paths(true, "", "", "")?;
    write_tool_installed_version(&app_state, "yt-dlp", &yt_path, yt_dlp_version).await?;
    emit_download_progress(&window, "yt-dlp", 100.0, "完了");

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

    let ffmpeg_version = manifest
        .tools
        .get("ffmpeg")
        .and_then(|tool| tool.version.as_deref());
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
    let (_, ff_path, _) = resolve_tool_paths(true, "", "", "")?;
    write_tool_installed_version(&app_state, "ffmpeg", &ff_path, ffmpeg_version).await?;
    emit_download_progress(&window, "ffmpeg", 100.0, "完了");

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

    let deno_version = manifest
        .tools
        .get("deno")
        .and_then(|tool| tool.version.as_deref())
        .map(|version| version.trim().trim_start_matches('v'));
    let deno_artifact = find_tool_artifact(&manifest, "deno", os_type, arch)?;
    let deno_filename = artifact_filename(deno_artifact)?;
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
    let (_, _, deno_path) = resolve_tool_paths(true, "", "", "")?;
    write_tool_installed_version(&app_state, "deno", &deno_path, deno_version).await?;
    emit_download_progress(&window, "deno", 100.0, "完了");

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
        let current_output = run_tool_version(&yt_path, "--version").unwrap_or_default();
        let current = current_output
            .lines()
            .next()
            .map(|line| line.trim().to_string())
            .unwrap_or_default();
        let current_runs = !current_output.trim().is_empty();
        let version_matches_output = !expected.is_empty() && current == expected;
        let installed_version_matches =
            cached_tool_installed_version(&app_state, "yt-dlp", &yt_path)
                .await
                .as_deref()
                == Some(expected);
        let needs_macos_onedir_migration =
            cfg!(target_os = "macos") && !binaries_dir.join("yt-dlp_macos").exists();
        if !current_runs
            || needs_macos_onedir_migration
            || (!version_matches_output && !installed_version_matches)
        {
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
            install_yt_dlp_artifact(art, &binaries_dir, &window).await?;
            let (yt_path, _, _) = resolve_tool_paths(true, "", "", "")?;
            write_tool_installed_version(&app_state, "yt-dlp", &yt_path, tool.version.as_deref())
                .await?;
            emit_download_progress(&window, "yt-dlp", 100.0, "完了");
        } else if version_matches_output && !installed_version_matches {
            write_tool_installed_version(&app_state, "yt-dlp", &yt_path, tool.version.as_deref())
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
        let current_output = run_tool_version(&deno_path, "--version").unwrap_or_default();
        let current = current_output
            .lines()
            .next()
            .map(|line| line.trim().to_string())
            .and_then(|l| l.split_whitespace().nth(1).map(|v| v.to_string()))
            .unwrap_or_default();
        let current_runs = !current_output.trim().is_empty();
        let version_matches_output = !expected.is_empty() && current == expected;
        let installed_version_matches =
            cached_tool_installed_version(&app_state, "deno", &deno_path)
                .await
                .as_deref()
                == Some(expected);
        if !current_runs || (!version_matches_output && !installed_version_matches) {
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
            let filename = artifact_filename(art)?;
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
            write_tool_installed_version(&app_state, "deno", &deno_path, Some(expected)).await?;
            emit_download_progress(&window, "deno", 100.0, "完了");
        } else if version_matches_output && !installed_version_matches {
            write_tool_installed_version(&app_state, "deno", &deno_path, Some(expected)).await?;
        }
    }

    if let Some(tool) = manifest.tools.get("ffmpeg") {
        let expected = tool.version.as_deref().unwrap_or("").trim();
        let current_output = run_tool_version(&ff_path, "-version").unwrap_or_default();
        let current_runs = !current_output.trim().is_empty();
        let version_matches_output = !expected.is_empty() && current_output.contains(expected);
        let installed_version_matches =
            cached_tool_installed_version(&app_state, "ffmpeg", &ff_path)
                .await
                .as_deref()
                == Some(expected);
        if !current_runs || (!version_matches_output && !installed_version_matches) {
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
            let filename = artifact_filename(art)?;
            let archive_path = binaries_dir.join(&filename);
            download_file_with_progress(
                &art.url,
                &archive_path,
                &window,
                "ffmpeg",
                Some(&art.sha256),
            )
            .await?;

            if cfg!(any(target_os = "windows", target_os = "macos")) {
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
                if std::path::Path::new(&found) != stable {
                    let _ = std::fs::copy(&found, &stable);
                }
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
            let (_, ff_path, _) = resolve_tool_paths(true, "", "", "")?;
            write_tool_installed_version(&app_state, "ffmpeg", &ff_path, tool.version.as_deref())
                .await?;
            emit_download_progress(&window, "ffmpeg", 100.0, "完了");
        } else if version_matches_output && !installed_version_matches {
            write_tool_installed_version(&app_state, "ffmpeg", &ff_path, tool.version.as_deref())
                .await?;
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
    let download_path = temporary_download_path(path);
    TokioFs::remove_file(&download_path).await.ok();

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

    let mut file = TokioFs::File::create(&download_path)
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

    file.flush()
        .await
        .map_err(|e| format!("Failed to flush {}: {}", tool_name, e))?;
    drop(file);

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

        let actual = sha256_file(&download_path)?;
        if actual.to_lowercase() != expected.to_lowercase() {
            let _ = std::fs::remove_file(&download_path);
            return Err(format!(
                "{}のSHA256が一致しません。expected={}, actual={}",
                tool_name, expected, actual
            ));
        }
    }

    TokioFs::remove_file(path).await.ok();
    TokioFs::rename(&download_path, path)
        .await
        .map_err(|e| format!("Failed to replace {}: {}", tool_name, e))?;

    #[cfg(any(target_os = "linux", target_os = "macos"))]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = std::fs::metadata(path)
            .map_err(|e| format!("Failed to read metadata for {}: {}", tool_name, e))?
            .permissions();
        perms.set_mode(0o755);
        std::fs::set_permissions(path, perms)
            .map_err(|e| format!("Failed to set permissions for {}: {}", tool_name, e))?;
    }

    Ok(())
}

async fn install_yt_dlp_artifact(
    artifact: &crate::tools::manifest::ToolArtifact,
    binaries_dir: &std::path::Path,
    window: &Window,
) -> Result<(), String> {
    let filename = artifact_filename(artifact)?;

    if cfg!(target_os = "macos") && filename.ends_with(".zip") {
        let archive_path = binaries_dir.join(&filename);
        let extract_dir = binaries_dir.join("yt-dlp_macos.extracting");
        let next_internal_dir = binaries_dir.join("_internal.new");
        let next_executable_path = binaries_dir.join("yt-dlp_macos.new");
        download_file_with_progress(
            &artifact.url,
            &archive_path,
            window,
            "yt-dlp",
            Some(&artifact.sha256),
        )
        .await?;
        TokioFs::remove_dir_all(&extract_dir).await.ok();
        TokioFs::create_dir_all(&extract_dir)
            .await
            .map_err(|e| format!("Failed to create yt-dlp extract directory: {}", e))?;
        extract_zip(&archive_path, &extract_dir)?;
        TokioFs::remove_file(&archive_path).await.ok();

        #[cfg(any(target_os = "linux", target_os = "macos"))]
        {
            use std::os::unix::fs::PermissionsExt;
            let executable_path = extract_dir.join("yt-dlp_macos");
            let mut perms = std::fs::metadata(&executable_path)
                .map_err(|e| format!("Failed to read metadata for yt-dlp: {}", e))?
                .permissions();
            perms.set_mode(0o755);
            std::fs::set_permissions(&executable_path, perms)
                .map_err(|e| format!("Failed to set permissions for yt-dlp: {}", e))?;
        }

        TokioFs::remove_dir_all(&next_internal_dir).await.ok();
        TokioFs::remove_file(&next_executable_path).await.ok();
        TokioFs::rename(extract_dir.join("_internal"), &next_internal_dir)
            .await
            .map_err(|e| format!("Failed to prepare yt-dlp internal files: {}", e))?;
        TokioFs::rename(extract_dir.join("yt-dlp_macos"), &next_executable_path)
            .await
            .map_err(|e| format!("Failed to prepare yt-dlp executable: {}", e))?;
        TokioFs::remove_dir_all(&extract_dir).await.ok();

        TokioFs::remove_dir_all(binaries_dir.join("_internal.old"))
            .await
            .ok();
        TokioFs::remove_file(binaries_dir.join("yt-dlp_macos.old"))
            .await
            .ok();
        if binaries_dir.join("_internal").exists() {
            TokioFs::rename(
                binaries_dir.join("_internal"),
                binaries_dir.join("_internal.old"),
            )
            .await
            .map_err(|e| format!("Failed to back up yt-dlp internal files: {}", e))?;
        }
        if binaries_dir.join("yt-dlp_macos").exists() {
            if let Err(e) = TokioFs::rename(
                binaries_dir.join("yt-dlp_macos"),
                binaries_dir.join("yt-dlp_macos.old"),
            )
            .await
            {
                restore_yt_dlp_macos_internal_backup(binaries_dir).await;
                return Err(format!("Failed to back up yt-dlp executable: {}", e));
            }
        }
        if let Err(e) = TokioFs::rename(&next_internal_dir, binaries_dir.join("_internal")).await {
            restore_yt_dlp_macos_backup(binaries_dir).await;
            return Err(format!("Failed to install yt-dlp internal files: {}", e));
        }
        if let Err(e) =
            TokioFs::rename(&next_executable_path, binaries_dir.join("yt-dlp_macos")).await
        {
            restore_yt_dlp_macos_backup(binaries_dir).await;
            return Err(format!("Failed to install yt-dlp executable: {}", e));
        }
        TokioFs::remove_dir_all(binaries_dir.join("_internal.old"))
            .await
            .ok();
        TokioFs::remove_file(binaries_dir.join("yt-dlp_macos.old"))
            .await
            .ok();
        TokioFs::remove_file(binaries_dir.join("yt-dlp")).await.ok();

        return Ok(());
    }

    let executable_path = binaries_dir.join(if cfg!(target_os = "windows") {
        "yt-dlp.exe"
    } else {
        "yt-dlp"
    });
    download_file_with_progress(
        &artifact.url,
        &executable_path,
        window,
        "yt-dlp",
        Some(&artifact.sha256),
    )
    .await
}

async fn restore_yt_dlp_macos_backup(binaries_dir: &std::path::Path) {
    TokioFs::remove_dir_all(binaries_dir.join("_internal"))
        .await
        .ok();
    TokioFs::remove_file(binaries_dir.join("yt-dlp_macos"))
        .await
        .ok();
    if binaries_dir.join("_internal.old").exists() {
        TokioFs::rename(
            binaries_dir.join("_internal.old"),
            binaries_dir.join("_internal"),
        )
        .await
        .ok();
    }
    if binaries_dir.join("yt-dlp_macos.old").exists() {
        TokioFs::rename(
            binaries_dir.join("yt-dlp_macos.old"),
            binaries_dir.join("yt-dlp_macos"),
        )
        .await
        .ok();
    }
}

async fn restore_yt_dlp_macos_internal_backup(binaries_dir: &std::path::Path) {
    TokioFs::remove_dir_all(binaries_dir.join("_internal"))
        .await
        .ok();
    if binaries_dir.join("_internal.old").exists() {
        TokioFs::rename(
            binaries_dir.join("_internal.old"),
            binaries_dir.join("_internal"),
        )
        .await
        .ok();
    }
}

fn temporary_download_path(path: &std::path::Path) -> std::path::PathBuf {
    let file_name = path.file_name().unwrap_or_default().to_string_lossy();
    path.with_file_name(format!("{}.download", file_name))
}

fn normalized_installed_version(version: Option<&str>) -> Option<String> {
    let version = version?.trim();
    if version.is_empty() {
        return None;
    }
    Some(version.to_string())
}

async fn cached_tool_installed_version(
    app_state: &State<'_, AppState>,
    tool_name: &str,
    tool_path: &str,
) -> Option<String> {
    let mtime = tool_cache_mtime(tool_name, tool_path).ok()?;
    let settings = app_state.settings.lock().await;
    settings
        .get_verify_cache(tool_name)
        .filter(|entry| entry.path == tool_path && entry.mtime == mtime && entry.ok)
        .and_then(|entry| entry.installed_version)
}

async fn write_tool_installed_version(
    app_state: &State<'_, AppState>,
    tool_name: &str,
    tool_path: &str,
    version: Option<&str>,
) -> Result<(), String> {
    let Some(installed_version) = normalized_installed_version(version) else {
        return Ok(());
    };
    let mtime = tool_cache_mtime(tool_name, tool_path)?;
    let mut settings = app_state.settings.lock().await;
    settings.set_verify_cache(
        tool_name,
        VerifyCache {
            path: tool_path.to_string(),
            mtime,
            ok: true,
            installed_version: Some(installed_version),
        },
    );
    Ok(())
}

fn emit_download_progress(window: &Window, tool_name: &str, progress: f64, status: &str) {
    window
        .emit(
            "download-progress",
            DownloadProgress {
                tool_name: tool_name.to_string(),
                progress,
                status: status.to_string(),
            },
        )
        .ok();
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

        let outpath = safe_zip_output_path(extract_dir, file.name())?;

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

fn safe_zip_output_path(
    extract_dir: &std::path::Path,
    file_name: &str,
) -> Result<std::path::PathBuf, String> {
    let path = std::path::Path::new(file_name);
    if path.is_absolute()
        || path.components().any(|component| {
            matches!(
                component,
                std::path::Component::ParentDir | std::path::Component::Prefix(_)
            )
        })
    {
        return Err(format!("Unsafe zip entry path: {}", file_name));
    }
    Ok(extract_dir.join(path))
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
