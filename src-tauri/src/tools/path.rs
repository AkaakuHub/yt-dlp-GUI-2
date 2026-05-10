use crate::config::{AppState, ToolCacheEntry, VerifyCache};
use serde::Serialize;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::UNIX_EPOCH;
use tauri::State;
use tokio::sync::Mutex;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolStatus {
    ok: bool,
    yt_dlp_path: String,
    ffmpeg_path: String,
    deno_path: String,
    yt_dlp_found: bool,
    ffmpeg_found: bool,
    deno_found: bool,
    yt_dlp_error: Option<String>,
    ffmpeg_error: Option<String>,
    deno_error: Option<String>,
}

#[derive(Serialize, Clone)]
pub(crate) struct DownloadProgress {
    pub(crate) tool_name: String,
    pub(crate) progress: f64,
    pub(crate) status: String,
}

#[cfg(target_os = "windows")]
fn get_tools_root() -> Result<PathBuf, String> {
    let appdata = std::env::var("APPDATA")
        .map_err(|_| "APPDATA environment variable is not set".to_string())?;
    Ok(PathBuf::from(appdata).join("yt-dlp-GUI"))
}

#[cfg(any(target_os = "linux", target_os = "macos"))]
fn get_tools_root() -> Result<PathBuf, String> {
    let home =
        std::env::var("HOME").map_err(|_| "HOME environment variable is not set".to_string())?;
    Ok(PathBuf::from(home).join(".yt-dlp-GUI"))
}

pub(crate) fn get_tools_dir() -> Result<PathBuf, String> {
    Ok(get_tools_root()?.join("binaries"))
}

pub(crate) fn find_ffmpeg_recursive(dir: &Path) -> Result<String, String> {
    if !dir.exists() {
        return Ok("".to_string());
    }

    let entries = std::fs::read_dir(dir).map_err(|e| format!("Failed to read directory: {}", e))?;

    let mut dirs: Vec<PathBuf> = Vec::new();

    for entry in entries.flatten() {
        let path = entry.path();
        let file_name = path.file_name().unwrap_or_default();
        let file_name_str = file_name.to_string_lossy();

        if path.is_dir() {
            dirs.push(path);
            continue;
        }

        if file_name_str.starts_with("ffmpeg")
            && (file_name_str.ends_with(".exe") || !file_name_str.contains('.'))
        {
            return Ok(path.to_string_lossy().to_string());
        }
    }

    for d in dirs {
        if let Ok(found) = find_ffmpeg_recursive(&d) {
            if !found.is_empty() {
                return Ok(found);
            }
        }
    }

    Ok("".to_string())
}

#[cfg(not(target_os = "windows"))]
fn command_name_candidates(command_name: &str) -> Vec<String> {
    vec![command_name.to_string()]
}

#[cfg(target_os = "windows")]
fn command_name_candidates(command_name: &str) -> Vec<String> {
    let mut candidates = vec![command_name.to_string()];
    let exts = std::env::var_os("PATHEXT").unwrap_or_else(|| ".COM;.EXE;.BAT;.CMD".into());
    for ext in exts.to_string_lossy().split(';') {
        let ext = ext.trim();
        if ext.is_empty() {
            continue;
        }
        let candidate = format!("{}{}", command_name, ext);
        if !candidates
            .iter()
            .any(|value| value.eq_ignore_ascii_case(&candidate))
        {
            candidates.push(candidate);
        }
    }
    candidates
}

fn find_command_in_path(command_name: &str) -> Result<PathBuf, String> {
    let path_var = std::env::var_os("PATH")
        .ok_or_else(|| "PATH environment variable is not set".to_string())?;

    for dir in std::env::split_paths(&path_var) {
        for candidate in command_name_candidates(command_name) {
            let candidate_path = dir.join(candidate);
            if candidate_path.is_file() {
                return Ok(candidate_path);
            }
        }
    }

    Err(format!("{} is not found in PATH", command_name))
}

fn resolve_command_path(program_name: &str, command_path: &str) -> Result<String, String> {
    let trimmed_path = command_path.trim();
    if trimmed_path.is_empty() {
        return find_command_in_path(program_name).map(|path| path.to_string_lossy().to_string());
    }

    let provided_path = Path::new(trimmed_path);
    if provided_path.is_absolute() || trimmed_path.contains('/') || trimmed_path.contains('\\') {
        if !provided_path.exists() {
            return Err(format!(
                "{} is not found at path: {}",
                program_name, trimmed_path
            ));
        }
        return Ok(trimmed_path.to_string());
    }

    find_command_in_path(trimmed_path)
        .map(|path| path.to_string_lossy().to_string())
        .map_err(|_| format!("{} is not found in PATH: {}", program_name, trimmed_path))
}

fn check_program_available(program_name: &str, command_path: &str) -> Result<String, String> {
    let command_path = resolve_command_path(program_name, command_path)?;

    let command_arg = match program_name {
        "yt-dlp" => "--version",
        "ffmpeg" => "-version",
        "deno" => "--version",
        _ => return Err(format!("Program {} is not supported", program_name)),
    };

    #[cfg(target_os = "windows")]
    let output = Command::new(&command_path)
        .arg(command_arg)
        .creation_flags(0x08000000)
        .output();

    #[cfg(any(target_os = "linux", target_os = "macos"))]
    let output = Command::new(&command_path)
        .arg(command_arg)
        .env("LC_ALL", "en_US.UTF-8")
        .env("LANG", "en_US.UTF-8")
        .output();

    match output {
        Ok(output) => {
            if output.status.success() {
                Ok(format!("{} found at: {}", program_name, command_path))
            } else {
                Err(format!(
                    "{} is not working at path: {} (exit code: {})",
                    program_name,
                    command_path,
                    output.status.code().unwrap_or(-1)
                ))
            }
        }
        Err(err) => Err(format!(
            "Failed to run {} at path {}: {}",
            program_name, command_path, err
        )),
    }
}

fn file_mtime(path: &str) -> Result<u64, String> {
    let meta = std::fs::metadata(path)
        .map_err(|e| format!("{} not found at path: {} ({})", "file", path, e))?;
    let mtime = meta
        .modified()
        .map_err(|e| format!("Failed to get modified time for {}: {}", path, e))?;
    let duration = mtime
        .duration_since(UNIX_EPOCH)
        .map_err(|e| format!("Invalid modified time for {}: {}", path, e))?;
    Ok(duration.as_secs())
}

pub(crate) async fn check_program_cached(
    program_name: &str,
    command_path: &str,
    cache: &Mutex<HashMap<String, ToolCacheEntry>>,
    settings: &Mutex<crate::config::Settings>,
) -> Result<String, String> {
    let mtime = match file_mtime(command_path) {
        Ok(m) => m,
        Err(e) => return Err(e),
    };

    let key = format!("{}:{}", program_name, command_path);

    if let Some(entry) = cache.lock().await.get(&key).cloned() {
        if entry.mtime == mtime {
            return if entry.ok {
                Ok(entry.msg)
            } else {
                Err(entry.msg)
            };
        }
    }

    if let Some(entry) = settings.lock().await.get_verify_cache(program_name) {
        if entry.path == command_path && entry.mtime == mtime {
            let msg = if entry.ok {
                format!("{} cached ok at: {}", program_name, command_path)
            } else {
                format!("{} cached ng at: {}", program_name, command_path)
            };

            {
                let mut cache_map = cache.lock().await;
                cache_map.insert(
                    key.clone(),
                    ToolCacheEntry {
                        mtime,
                        ok: entry.ok,
                        msg: msg.clone(),
                    },
                );
            }
            return if entry.ok { Ok(msg) } else { Err(msg) };
        }
    }

    let result = check_program_available(program_name, command_path);

    {
        let mut cache_map = cache.lock().await;
        cache_map.insert(
            key,
            ToolCacheEntry {
                mtime,
                ok: result.is_ok(),
                msg: result.clone().unwrap_or_else(|e| e),
            },
        );
    }

    {
        let mut s = settings.lock().await;
        s.set_verify_cache(
            program_name,
            VerifyCache {
                path: command_path.to_string(),
                mtime,
                ok: result.is_ok(),
            },
        );
    }

    result
}

pub(crate) fn run_tool_version(path: &str, arg: &str) -> Option<String> {
    if path.trim().is_empty() {
        return None;
    }
    if !Path::new(path).exists() {
        return None;
    }
    let out = Command::new(path).arg(arg).output().ok()?;
    let mut s = String::new();
    s.push_str(&String::from_utf8_lossy(&out.stdout));
    s.push_str(&String::from_utf8_lossy(&out.stderr));
    Some(s)
}

pub(crate) fn resolve_tool_paths(
    use_bundle_tools: bool,
    yt_dlp_path: &str,
    ffmpeg_path: &str,
    deno_path: &str,
) -> Result<(String, String, String), String> {
    if use_bundle_tools {
        let binaries_dir = get_tools_dir()?;

        if !binaries_dir.exists() {
            return Ok(("".to_string(), "".to_string(), "".to_string()));
        }

        let yt_stable = binaries_dir.join(if cfg!(target_os = "windows") {
            "yt-dlp.exe"
        } else {
            "yt-dlp"
        });
        let deno_stable = binaries_dir.join(if cfg!(target_os = "windows") {
            "deno.exe"
        } else {
            "deno"
        });
        let ff_stable = binaries_dir.join(if cfg!(target_os = "windows") {
            "ffmpeg.exe"
        } else {
            "ffmpeg"
        });

        let yt = if yt_stable.exists() {
            yt_stable.to_string_lossy().to_string()
        } else {
            std::fs::read_dir(&binaries_dir)
                .map_err(|e| format!("Failed to read binaries directory: {}", e))?
                .filter_map(|entry| entry.ok())
                .find(|entry| {
                    let file_name = entry.file_name();
                    let file_name_str = file_name.to_string_lossy();
                    file_name_str.starts_with("yt-dlp")
                        && (file_name_str.ends_with(".exe") || !file_name_str.contains('.'))
                })
                .map(|entry| entry.path().to_string_lossy().to_string())
                .unwrap_or_default()
        };

        let ff = if ff_stable.exists() {
            ff_stable.to_string_lossy().to_string()
        } else {
            find_ffmpeg_recursive(&binaries_dir)?
        };
        let deno = if deno_stable.exists() {
            deno_stable.to_string_lossy().to_string()
        } else {
            std::fs::read_dir(&binaries_dir)
                .map_err(|e| format!("Failed to read binaries directory: {}", e))?
                .filter_map(|entry| entry.ok())
                .find(|entry| {
                    let file_name = entry.file_name();
                    let file_name_str = file_name.to_string_lossy();
                    file_name_str.starts_with("deno")
                        && (file_name_str.ends_with(".exe") || !file_name_str.contains('.'))
                })
                .map(|entry| entry.path().to_string_lossy().to_string())
                .unwrap_or_default()
        };

        return Ok((yt, ff, deno));
    }

    Ok((
        resolve_command_path("yt-dlp", yt_dlp_path)?,
        resolve_command_path("ffmpeg", ffmpeg_path)?,
        resolve_command_path("deno", deno_path)?,
    ))
}

#[tauri::command]
pub async fn check_tools_status(
    app_state: State<'_, AppState>,
    use_bundle_tools: Option<bool>,
    yt_dlp_path: Option<String>,
    ffmpeg_path: Option<String>,
    deno_path: Option<String>,
) -> Result<ToolStatus, String> {
    let settings = app_state.settings.lock().await;
    let use_bundle = use_bundle_tools.unwrap_or(settings.use_bundle_tools);
    let yt_path = yt_dlp_path.unwrap_or_else(|| settings.yt_dlp_path.clone());
    let ff_path = ffmpeg_path.unwrap_or_else(|| settings.ffmpeg_path.clone());
    let deno_path = deno_path.unwrap_or_else(|| settings.deno_path.clone());
    drop(settings);

    let (resolved_yt, resolved_ff, resolved_deno) =
        resolve_tool_paths(use_bundle, &yt_path, &ff_path, &deno_path)?;

    let cache = &app_state.tool_cache;
    let settings = &app_state.settings;
    let (yt_check, ff_check, deno_check) = tokio::join!(
        check_program_cached("yt-dlp", &resolved_yt, cache, settings),
        check_program_cached("ffmpeg", &resolved_ff, cache, settings),
        check_program_cached("deno", &resolved_deno, cache, settings)
    );

    let yt_found = yt_check.is_ok();
    let ff_found = ff_check.is_ok();
    let deno_found = deno_check.is_ok();
    Ok(ToolStatus {
        ok: yt_found && ff_found && deno_found,
        yt_dlp_path: resolved_yt,
        ffmpeg_path: resolved_ff,
        deno_path: resolved_deno,
        yt_dlp_found: yt_found,
        ffmpeg_found: ff_found,
        deno_found,
        yt_dlp_error: yt_check.err(),
        ffmpeg_error: ff_check.err(),
        deno_error: deno_check.err(),
    })
}
