use crate::{
    client::remote::{start_remote_download, stop_remote_download},
    config::AppState,
    download_command::{build_yt_dlp_args, RunCommandParam},
    process_manager::CommandManager,
    tools::resolve_tool_paths,
};
use std::sync::Arc;
use tauri::State;
use tauri::Window;
use tokio::sync::Mutex;

const REMOTE_EXECUTION_TARGET: &str = "remote";

#[tauri::command]
pub async fn start_download(
    command_manager: State<'_, Arc<Mutex<CommandManager>>>,
    window: tauri::Window,
    param: RunCommandParam,
    app_state: State<'_, AppState>,
) -> Result<u32, String> {
    let settings = app_state.settings.lock().await.clone();
    if settings.execution_target == REMOTE_EXECUTION_TARGET {
        return start_remote_download(param, &settings, window).await;
    }

    let mut manager = command_manager.lock().await;
    let (yt_dlp_path, _ffmpeg_path, _deno_path) = resolve_tool_paths(
        settings.use_bundle_tools,
        &settings.yt_dlp_path,
        &settings.ffmpeg_path,
        &settings.deno_path,
    )
    .map_err(|e| format!("ツールパスの解決に失敗しました: {}", e))?;

    if yt_dlp_path.trim().is_empty() {
        return Err(
            "yt-dlpが見つかりません。ツールをダウンロードするかパスを設定してください。".into(),
        );
    }

    let args = build_yt_dlp_args(param, &settings)?;

    manager
        .start_command(command_manager.inner().clone(), args, window, &yt_dlp_path)
        .await
}

#[tauri::command]
pub async fn stop_download(
    command_manager: State<'_, Arc<Mutex<CommandManager>>>,
    window: Window,
    app_state: State<'_, AppState>,
) -> Result<(), String> {
    let settings = app_state.settings.lock().await.clone();
    if settings.execution_target == REMOTE_EXECUTION_TARGET {
        return stop_remote_download(&settings).await;
    }

    let mut manager = command_manager.lock().await;
    manager.stop_command(window).await
}
