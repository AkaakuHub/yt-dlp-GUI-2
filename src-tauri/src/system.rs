use serde::{Deserialize, Serialize};
use tauri::api::shell::open;
use tauri::Manager;
use tauri::Window;

use open as open_path;

#[derive(Serialize, Deserialize)]
pub struct FileInfo {
    name: String,
    is_dir: bool,
    last_modified: u64,
    file_size: u64,
}

#[tauri::command]
pub fn get_sorted_directory_contents(path: &str) -> Result<Vec<FileInfo>, String> {
    let path = std::path::Path::new(path);
    let mut entries = Vec::new();

    if let Ok(dir_entries) = std::fs::read_dir(path) {
        for entry in dir_entries {
            if let Ok(entry) = entry {
                let file_name = entry.file_name().to_string_lossy().into_owned();
                let is_dir = entry.file_type().map(|ft| ft.is_dir()).unwrap_or(false);
                let last_modified = entry
                    .metadata()
                    .and_then(|m| m.modified())
                    .map(|t| t.duration_since(std::time::UNIX_EPOCH).unwrap().as_secs())
                    .unwrap_or(0);
                let file_size = entry.metadata().map(|m| m.len()).unwrap_or(0);

                entries.push(FileInfo {
                    name: file_name,
                    is_dir,
                    last_modified,
                    file_size,
                });
            }
        }
    }

    entries.sort_by(|a, b| b.last_modified.cmp(&a.last_modified));
    Ok(entries)
}

#[tauri::command]
pub fn open_file(path: String) -> Result<(), String> {
    open_path::that(path).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_current_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[tauri::command]
pub fn get_os_type() -> String {
    std::env::consts::OS.to_string()
}

#[tauri::command]
pub async fn open_url_and_exit(window: Window, url: String) {
    if open(&window.shell_scope(), url, None).is_ok() {
        std::process::exit(0x0);
    }
}

#[cfg(target_os = "windows")]
#[tauri::command]
pub fn open_directory(path: String) {
    std::process::Command::new("explorer")
        .arg(path)
        .spawn()
        .unwrap();
}

#[cfg(any(target_os = "linux", target_os = "macos"))]
#[tauri::command]
pub fn open_directory(path: String) {
    std::process::Command::new("open")
        .arg(path)
        .spawn()
        .unwrap();
}
