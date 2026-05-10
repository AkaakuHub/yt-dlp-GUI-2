use crate::config::Settings;
use auto_launch::{AutoLaunchBuilder, MacOSLaunchMode};
use rand::distr::{Alphanumeric, SampleString};
use serde::Serialize;
use std::sync::OnceLock;
use tokio::{process::Child, sync::Mutex};

const APP_NAME: &str = "yt-dlp-GUI-server-cli";
static SERVER_CLI_PROCESS: OnceLock<Mutex<Option<Child>>> = OnceLock::new();

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerCliStatus {
    registered: bool,
    running: bool,
    path_exists: bool,
    path: String,
}

#[tauri::command]
pub async fn register_server_cli() -> Result<(), String> {
    server_cli_auto_launch()?.enable().map_err(service_error)
}

#[tauri::command]
pub async fn unregister_server_cli() -> Result<(), String> {
    server_cli_auto_launch()?.disable().map_err(service_error)
}

#[tauri::command]
pub async fn start_server_cli() -> Result<(), String> {
    let mut process = server_cli_process().lock().await;
    if let Some(child) = process.as_mut() {
        if child
            .try_wait()
            .map_err(|e| format!("サーバーCLIの状態確認に失敗しました: {}", e))?
            .is_none()
        {
            return Ok(());
        }
        *process = None;
    }

    let server_cli_path = server_cli_path()?;
    let child = tokio::process::Command::new(server_cli_path)
        .args(["--host", "0.0.0.0"])
        .spawn()
        .map_err(|e| format!("サーバーCLIの起動に失敗しました: {}", e))?;
    *process = Some(child);
    Ok(())
}

#[tauri::command]
pub async fn stop_server_cli() -> Result<(), String> {
    if shutdown_local_server_cli().await? {
        let mut process = server_cli_process().lock().await;
        *process = None;
        return Ok(());
    }

    let mut process = server_cli_process().lock().await;
    if let Some(child) = process.as_mut() {
        child
            .kill()
            .await
            .map_err(|e| format!("サーバーCLIの停止に失敗しました: {}", e))?;
        *process = None;
    }
    Ok(())
}

#[tauri::command]
pub async fn get_server_cli_status() -> Result<ServerCliStatus, String> {
    let path = server_cli_path_or_default()?;
    let registered = server_cli_auto_launch()
        .and_then(|auto_launch| auto_launch.is_enabled().map_err(service_error))
        .unwrap_or(false);
    let running = is_server_cli_running().await?;
    Ok(ServerCliStatus {
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

fn server_cli_auto_launch() -> Result<auto_launch::AutoLaunch, String> {
    let server_cli_path = server_cli_path()?;
    AutoLaunchBuilder::new()
        .set_app_name(APP_NAME)
        .set_app_path(&server_cli_path.to_string_lossy())
        .set_macos_launch_mode(MacOSLaunchMode::LaunchAgent)
        .set_args(&["--host", "0.0.0.0"])
        .build()
        .map_err(service_error)
}

fn server_cli_path() -> Result<std::path::PathBuf, String> {
    let server_cli_path = server_cli_path_or_default()?;
    if server_cli_path.exists() {
        return Ok(server_cli_path);
    }
    Err(format!(
        "サーバーCLIが見つかりません: {}",
        server_cli_path.display()
    ))
}

fn server_cli_path_or_default() -> Result<std::path::PathBuf, String> {
    let current_exe = std::env::current_exe()
        .map_err(|e| format!("実行ファイルの場所を取得できません: {}", e))?;
    let executable_name = if cfg!(target_os = "windows") {
        "server_cli.exe"
    } else {
        "server_cli"
    };
    let target = option_env!("TAURI_ENV_TARGET_TRIPLE")
        .or(option_env!("TARGET"))
        .unwrap_or("");
    let sidecar_name = if cfg!(target_os = "windows") {
        format!("server_cli-{}.exe", target)
    } else {
        format!("server_cli-{}", target)
    };
    let mut candidates = vec![current_exe.with_file_name(executable_name)];
    if !target.is_empty() {
        candidates.push(current_exe.with_file_name(sidecar_name));
    }

    if let Some(manifest_dir) = option_env!("CARGO_MANIFEST_DIR") {
        candidates.push(
            std::path::Path::new(manifest_dir)
                .join("target")
                .join("release")
                .join(executable_name),
        );
    }

    Ok(candidates
        .iter()
        .find(|path| path.exists())
        .cloned()
        .unwrap_or_else(|| candidates[0].clone()))
}

fn service_error(error: auto_launch::Error) -> String {
    format!("サーバーCLIの常駐設定に失敗しました: {}", error)
}

fn server_cli_process() -> &'static Mutex<Option<Child>> {
    SERVER_CLI_PROCESS.get_or_init(|| Mutex::new(None))
}

async fn is_server_cli_running() -> Result<bool, String> {
    let mut process = server_cli_process().lock().await;
    if let Some(child) = process.as_mut() {
        if child
            .try_wait()
            .map_err(|e| format!("サーバーCLIの状態確認に失敗しました: {}", e))?
            .is_none()
        {
            return Ok(true);
        }
        *process = None;
    }
    is_local_server_healthy().await
}

async fn is_local_server_healthy() -> Result<bool, String> {
    let settings = Settings::new();
    if settings.server_auth_token.trim().is_empty() {
        return Ok(false);
    }
    let response = reqwest::Client::new()
        .get(format!("http://127.0.0.1:{}/health", settings.server_port))
        .bearer_auth(settings.server_auth_token.trim())
        .send()
        .await;
    let Ok(response) = response else {
        return Ok(false);
    };
    if response.status().is_success() {
        return Ok(true);
    }
    Ok(false)
}

async fn shutdown_local_server_cli() -> Result<bool, String> {
    let settings = Settings::new();
    if settings.server_auth_token.trim().is_empty() {
        return Ok(false);
    }
    let response = reqwest::Client::new()
        .post(format!(
            "http://127.0.0.1:{}/shutdown",
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
