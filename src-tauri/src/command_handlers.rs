use crate::{
    client::remote::{schedule_remote_download, start_remote_download, stop_remote_download},
    config::AppState,
    download_command::{build_yt_dlp_args, RunCommandParam},
    process_manager::CommandManager,
    tools::resolve_tool_paths,
};
use std::sync::Arc;
use tauri::Window;
use tauri::{Emitter, State};
use tokio::sync::Mutex;
use tokio::time::{sleep_until, Duration, Instant};

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

    start_local_download(
        command_manager.inner().clone(),
        Some(window),
        param,
        &settings,
    )
    .await
}

#[tauri::command]
pub async fn schedule_download(
    command_manager: State<'_, Arc<Mutex<CommandManager>>>,
    window: tauri::Window,
    param: RunCommandParam,
    run_at_ms: u64,
    app_state: State<'_, AppState>,
) -> Result<String, String> {
    let settings = app_state.settings.lock().await.clone();
    let now_ms = current_time_ms()?;
    if run_at_ms <= now_ms {
        return Err("予約時刻は現在より後にしてください".to_string());
    }
    if settings.execution_target == REMOTE_EXECUTION_TARGET {
        return schedule_remote_download(param, run_at_ms, &settings, window).await;
    }
    let delay = Duration::from_millis(run_at_ms - now_ms);
    let schedule_id = format!("schedule-{}", run_at_ms);
    let command_manager = command_manager.inner().clone();
    tokio::spawn(async move {
        sleep_until(Instant::now() + delay).await;
        if let Err(err) =
            start_local_download(command_manager, Some(window.clone()), param, &settings).await
        {
            let _ = window.emit("process-exit", format!("予約実行に失敗しました: {}", err));
        }
    });
    Ok(schedule_id)
}

async fn start_local_download(
    command_manager: Arc<Mutex<CommandManager>>,
    window: Option<tauri::Window>,
    param: RunCommandParam,
    settings: &crate::config::Settings,
) -> Result<u32, String> {
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
        .start_command(command_manager.clone(), args, window, &yt_dlp_path)
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
    manager.stop_command(Some(window)).await
}

fn current_time_ms() -> Result<u64, String> {
    let duration = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| format!("現在時刻の取得に失敗しました: {}", e))?;
    u64::try_from(duration.as_millis()).map_err(|_| "現在時刻が大きすぎます".to_string())
}
