use crate::{
    client::remote::{
        schedule_remote_download, schedule_remote_youtube_live_from_start,
        start_remote_download_queue, stop_remote_download,
    },
    config::AppState,
    download_command::{build_yt_dlp_args, RunCommandParam},
    process_manager::{CommandManager, QueueStartResponse, ScheduledReservation},
    reservation::{
        current_time_ms, resolve_youtube_live_reservation, ReservationResponse,
        YoutubeLiveReservationRequest,
    },
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
    let response = start_download_queue(command_manager, window, vec![param], 1, app_state).await?;
    response
        .running_pids
        .first()
        .copied()
        .ok_or_else(|| "プロセスIDの取得に失敗しました".to_string())
}

#[tauri::command]
pub async fn start_download_queue(
    command_manager: State<'_, Arc<Mutex<CommandManager>>>,
    window: tauri::Window,
    params: Vec<RunCommandParam>,
    max_parallel: usize,
    app_state: State<'_, AppState>,
) -> Result<QueueStartResponse, String> {
    let settings = app_state.settings.lock().await.clone();
    if settings.execution_target == REMOTE_EXECUTION_TARGET {
        let response = start_remote_download_queue(params, max_parallel, &settings, window).await?;
        return Ok(QueueStartResponse {
            queue_id: response.queue_id,
            total: response.total,
            started: response.started,
            running_pids: response.running_pids,
        });
    }
    start_local_download_queue(
        command_manager.inner().clone(),
        Some(window),
        params,
        max_parallel,
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
    if settings.execution_target == REMOTE_EXECUTION_TARGET {
        return schedule_remote_download(param, run_at_ms, &settings, window).await;
    }
    schedule_local_download(
        command_manager.inner().clone(),
        Some(window),
        param,
        run_at_ms,
        settings,
        "日時指定予約".to_string(),
        "日時指定".to_string(),
    )
    .await
}

#[tauri::command]
pub async fn schedule_youtube_live_from_start(
    command_manager: State<'_, Arc<Mutex<CommandManager>>>,
    window: tauri::Window,
    request: YoutubeLiveReservationRequest,
    app_state: State<'_, AppState>,
) -> Result<ReservationResponse, String> {
    let settings = app_state.settings.lock().await.clone();
    if settings.execution_target == REMOTE_EXECUTION_TARGET {
        return schedule_remote_youtube_live_from_start(request, &settings, window).await;
    }
    let (param, run_at_ms, title) = resolve_youtube_live_reservation(request, &settings).await?;
    let schedule_id = schedule_local_download(
        command_manager.inner().clone(),
        Some(window),
        param,
        run_at_ms,
        settings,
        title.clone(),
        "YouTubeライブ".to_string(),
    )
    .await?;
    Ok(ReservationResponse {
        schedule_id,
        run_at_ms,
        title,
    })
}

pub async fn schedule_local_download(
    command_manager: Arc<Mutex<CommandManager>>,
    window: Option<tauri::Window>,
    param: RunCommandParam,
    run_at_ms: u64,
    settings: crate::config::Settings,
    title: String,
    kind: String,
) -> Result<String, String> {
    let now_ms = current_time_ms()?;
    if run_at_ms <= now_ms {
        return Err("予約時刻は現在より後にしてください".to_string());
    }
    let delay = Duration::from_millis(run_at_ms - now_ms);
    let url = param.url.clone().unwrap_or_default();
    let reservation_id = command_manager
        .lock()
        .await
        .add_reservation(title, url, run_at_ms, kind);
    let schedule_id = format!("schedule-{}", reservation_id);
    tokio::spawn(async move {
        sleep_until(Instant::now() + delay).await;
        command_manager
            .lock()
            .await
            .update_reservation_status(reservation_id, "実行中");
        if let Err(err) = start_local_download_queue(
            command_manager.clone(),
            window.clone(),
            vec![param],
            1,
            &settings,
        )
        .await
        {
            command_manager
                .lock()
                .await
                .update_reservation_status(reservation_id, "失敗");
            if let Some(window) = window {
                let _ = window.emit("process-exit", format!("予約実行に失敗しました: {}", err));
            } else {
                eprintln!("予約実行に失敗しました: {}", err);
            }
        } else {
            command_manager
                .lock()
                .await
                .update_reservation_status(reservation_id, "実行済み");
        }
    });
    Ok(schedule_id)
}

#[tauri::command]
pub async fn get_reservations(
    command_manager: State<'_, Arc<Mutex<CommandManager>>>,
) -> Result<Vec<ScheduledReservation>, String> {
    Ok(command_manager.lock().await.reservations())
}

async fn start_local_download_queue(
    command_manager: Arc<Mutex<CommandManager>>,
    window: Option<tauri::Window>,
    params: Vec<RunCommandParam>,
    max_parallel: usize,
    settings: &crate::config::Settings,
) -> Result<QueueStartResponse, String> {
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

    let commands = params
        .into_iter()
        .map(|param| {
            let args = build_yt_dlp_args(param, settings)?;
            Ok((args, yt_dlp_path.clone()))
        })
        .collect::<Result<Vec<_>, String>>()?;

    CommandManager::enqueue_commands(command_manager, commands, window, max_parallel).await
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
    manager.stop_all_commands(Some(window)).await
}
