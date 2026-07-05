use serde::{Deserialize, Serialize};
use serde_json::Value;
use tokio::process::Command as TokioCommand;

use crate::{
    config::Settings,
    download_command::{DownloadMode, RunCommandParam},
    tools::resolve_tool_paths,
};

const YOUTUBE_WAIT_FOR_VIDEO_SECONDS: u32 = 30;

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct YoutubeLiveReservationRequest {
    pub param: RunCommandParam,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReservationResponse {
    pub schedule_id: String,
    pub run_at_ms: u64,
    pub title: String,
}

pub async fn resolve_youtube_live_reservation(
    request: YoutubeLiveReservationRequest,
    settings: &Settings,
) -> Result<(RunCommandParam, u64, String), String> {
    let mut param = request.param;
    let url = param
        .url
        .clone()
        .ok_or_else(|| "URLが指定されていません".to_string())?;
    let metadata = fetch_youtube_metadata(&url, settings).await?;
    let run_at_ms = scheduled_start_ms(&metadata)?;
    if run_at_ms <= current_time_ms()? {
        return Err("未来のライブ配信ではありません".to_string());
    }

    param.kind = DownloadMode::LiveFromStart;
    param.wait_for_video_seconds = Some(YOUTUBE_WAIT_FOR_VIDEO_SECONDS);
    let title = metadata
        .get("title")
        .and_then(Value::as_str)
        .unwrap_or("YouTubeライブ")
        .to_string();
    Ok((param, run_at_ms, title))
}

async fn fetch_youtube_metadata(url: &str, settings: &Settings) -> Result<Value, String> {
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

    let mut command = TokioCommand::new(yt_dlp_path);
    command
        .arg(url)
        .arg("--dump-single-json")
        .arg("--skip-download")
        .arg("--no-warnings");
    if settings.use_cookie {
        command.arg("--cookies-from-browser").arg(&settings.browser);
    }

    let output = command
        .output()
        .await
        .map_err(|e| format!("YouTubeライブの解析に失敗しました: {}", e))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            "YouTubeライブの解析に失敗しました".to_string()
        } else {
            stderr
        });
    }

    serde_json::from_slice::<Value>(&output.stdout)
        .map_err(|e| format!("YouTubeライブの解析結果を読めません: {}", e))
}

fn scheduled_start_ms(metadata: &Value) -> Result<u64, String> {
    for field_name in ["release_timestamp", "timestamp", "scheduled_timestamp"] {
        if let Some(timestamp) = metadata.get(field_name).and_then(Value::as_u64) {
            return timestamp
                .checked_mul(1000)
                .ok_or_else(|| "予約時刻が大きすぎます".to_string());
        }
    }
    Err("YouTubeライブの予定時刻を取得できません".to_string())
}

pub fn current_time_ms() -> Result<u64, String> {
    let duration = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| format!("現在時刻の取得に失敗しました: {}", e))?;
    u64::try_from(duration.as_millis()).map_err(|_| "現在時刻が大きすぎます".to_string())
}
