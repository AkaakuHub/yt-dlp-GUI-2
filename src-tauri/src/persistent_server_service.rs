use crate::config::Settings;
use auto_launch::{AutoLaunchBuilder, MacOSLaunchMode};
use rand::distr::{Alphanumeric, SampleString};
use serde::Serialize;

const APP_NAME: &str = "yt-dlp-GUI";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PersistentServerStatus {
    registered: bool,
    running: bool,
    path_exists: bool,
    path: String,
}

#[tauri::command]
pub async fn register_persistent_server() -> Result<(), String> {
    persistent_server_auto_launch()?
        .enable()
        .map_err(service_error)
}

#[tauri::command]
pub async fn unregister_persistent_server() -> Result<(), String> {
    persistent_server_auto_launch()?
        .disable()
        .map_err(service_error)
}

#[tauri::command]
pub async fn get_persistent_server_status() -> Result<PersistentServerStatus, String> {
    let path = current_app_path()?;
    let registered = persistent_server_auto_launch()
        .and_then(|auto_launch| auto_launch.is_enabled().map_err(service_error))
        .unwrap_or(false);
    let running = is_local_server_healthy().await?;
    Ok(PersistentServerStatus {
        registered,
        running,
        path_exists: path.exists(),
        path: path.to_string_lossy().to_string(),
    })
}

#[tauri::command]
pub fn generate_remote_auth_token() -> String {
    Alphanumeric.sample_string(&mut rand::rng(), 48)
}

pub async fn prepare_persistent_server_for_update() -> Result<(), String> {
    Ok(())
}

pub fn prepare_persistent_server_before_exit() {}

fn persistent_server_auto_launch() -> Result<auto_launch::AutoLaunch, String> {
    let app_path = current_app_path()?;
    AutoLaunchBuilder::new()
        .set_app_name(APP_NAME)
        .set_app_path(&app_path.to_string_lossy())
        .set_macos_launch_mode(MacOSLaunchMode::LaunchAgent)
        .set_args(&["--headless"])
        .build()
        .map_err(service_error)
}

fn service_error(error: auto_launch::Error) -> String {
    format!("常駐設定に失敗しました: {}", error)
}

async fn is_local_server_healthy() -> Result<bool, String> {
    let settings = Settings::new();
    if settings.server_auth_token.trim().is_empty() {
        return Ok(false);
    }
    let response = reqwest::Client::new()
        .get(format!(
            "http://127.0.0.1:{}/api/health",
            settings.server_port
        ))
        .bearer_auth(settings.server_auth_token.trim())
        .send()
        .await;
    let Ok(response) = response else {
        return Ok(false);
    };
    Ok(response.status().is_success())
}

fn current_app_path() -> Result<std::path::PathBuf, String> {
    std::env::current_exe().map_err(|e| format!("実行ファイルの場所を取得できません: {}", e))
}
