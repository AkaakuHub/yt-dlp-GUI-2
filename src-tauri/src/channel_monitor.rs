use std::sync::Arc;

use serde::Deserialize;
use serde_json::Value;
use tauri::State;
use tokio::{
    process::Command as TokioCommand,
    sync::Mutex,
    time::{sleep_until, Duration, Instant},
};

use crate::{
    command_handlers::start_local_download_queue_for_monitor,
    config::{AppState, Settings},
    process_manager::CommandManager,
    reservation::current_time_ms,
    reservation_store::{
        ChannelMonitorRule, ChannelMonitorRuleRequest, PendingChannelMonitorRule, ReservationStore,
    },
    tools::resolve_tool_paths,
};

#[derive(Deserialize)]
pub struct ChannelMonitorRuleCreateRequest {
    pub rule: ChannelMonitorRuleRequest,
}

#[derive(Deserialize)]
struct FlatPlaylistEntry {
    id: Option<String>,
    title: Option<String>,
    url: Option<String>,
    webpage_url: Option<String>,
}

pub fn resume_channel_monitor_rules(
    command_manager: Arc<Mutex<CommandManager>>,
    reservation_store: ReservationStore,
) {
    let rules = match reservation_store.pending_channel_monitor_rules() {
        Ok(rules) => rules,
        Err(err) => {
            eprintln!("チャンネル監視の復元に失敗しました: {}", err);
            return;
        }
    };
    for rule in rules {
        spawn_channel_monitor_rule(command_manager.clone(), reservation_store.clone(), rule);
    }
}

#[tauri::command]
pub async fn create_channel_monitor_rule(
    command_manager: State<'_, Arc<Mutex<CommandManager>>>,
    app_state: State<'_, AppState>,
    request: ChannelMonitorRuleCreateRequest,
) -> Result<i64, String> {
    let id = app_state
        .reservation_store
        .add_channel_monitor_rule(request.rule)?;
    let rule = app_state
        .reservation_store
        .pending_channel_monitor_rules()?
        .into_iter()
        .find(|rule| rule.id == id)
        .ok_or_else(|| "作成したチャンネル監視が見つかりません".to_string())?;
    spawn_channel_monitor_rule(
        command_manager.inner().clone(),
        app_state.reservation_store.clone(),
        rule,
    );
    Ok(id)
}

#[tauri::command]
pub async fn get_channel_monitor_rules(
    app_state: State<'_, AppState>,
) -> Result<Vec<ChannelMonitorRule>, String> {
    app_state.reservation_store.channel_monitor_rules()
}

pub async fn create_channel_monitor_rule_from_web(
    command_manager: Arc<Mutex<CommandManager>>,
    reservation_store: ReservationStore,
    request: ChannelMonitorRuleRequest,
) -> Result<i64, String> {
    let id = reservation_store.add_channel_monitor_rule(request)?;
    let rule = reservation_store
        .pending_channel_monitor_rules()?
        .into_iter()
        .find(|rule| rule.id == id)
        .ok_or_else(|| "作成したチャンネル監視が見つかりません".to_string())?;
    spawn_channel_monitor_rule(command_manager, reservation_store, rule);
    Ok(id)
}

fn spawn_channel_monitor_rule(
    command_manager: Arc<Mutex<CommandManager>>,
    reservation_store: ReservationStore,
    rule: PendingChannelMonitorRule,
) {
    tokio::spawn(async move {
        let delay_ms = match current_time_ms() {
            Ok(now_ms) => rule.next_check_at_ms.saturating_sub(now_ms),
            Err(err) => {
                eprintln!("チャンネル監視時刻の取得に失敗しました: {}", err);
                0
            }
        };
        sleep_until(Instant::now() + Duration::from_millis(delay_ms)).await;
        let status = match run_channel_monitor_rule(&command_manager, &reservation_store, &rule).await
        {
            Ok(Some(title)) => format!("追加: {}", title),
            Ok(None) => "一致なし".to_string(),
            Err(err) => format!("失敗: {}", err),
        };
        match reservation_store.mark_channel_monitor_checked(rule.id, &status) {
            Ok(next_check_at_ms) => {
                let mut next_rule = rule;
                next_rule.next_check_at_ms = next_check_at_ms;
                spawn_channel_monitor_rule(command_manager, reservation_store, next_rule);
            }
            Err(err) => eprintln!("チャンネル監視状態の更新に失敗しました: {}", err),
        }
    });
}

async fn run_channel_monitor_rule(
    command_manager: &Arc<Mutex<CommandManager>>,
    reservation_store: &ReservationStore,
    rule: &PendingChannelMonitorRule,
) -> Result<Option<String>, String> {
    let settings = Settings::new();
    let entries = fetch_channel_entries(&rule.channel_url, &settings).await?;
    for entry in entries {
        let title = entry.title.clone().unwrap_or_default();
        if !title_matches(&title, &rule.include_words, &rule.exclude_words) {
            continue;
        }
        let Some(url) = entry_url(&entry) else {
            continue;
        };
        let content_key = entry.id.clone().unwrap_or_else(|| url.clone());
        if reservation_store.has_channel_monitor_hit(rule.id, &content_key)? {
            continue;
        }
        let mut param = rule.param.clone();
        param.url = Some(url.clone());
        start_local_download_queue_for_monitor(command_manager.clone(), vec![param], &settings)
            .await?;
        reservation_store.add_channel_monitor_hit(rule.id, &content_key, &url, &title)?;
        return Ok(Some(title));
    }
    Ok(None)
}

async fn fetch_channel_entries(
    channel_url: &str,
    settings: &Settings,
) -> Result<Vec<FlatPlaylistEntry>, String> {
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

    let output = TokioCommand::new(yt_dlp_path)
        .arg(channel_url)
        .arg("--dump-single-json")
        .arg("--flat-playlist")
        .arg("--playlist-end")
        .arg("30")
        .arg("--skip-download")
        .arg("--no-warnings")
        .output()
        .await
        .map_err(|e| format!("チャンネル監視に失敗しました: {}", e))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            "チャンネル監視に失敗しました".to_string()
        } else {
            stderr
        });
    }

    let value = serde_json::from_slice::<Value>(&output.stdout)
        .map_err(|e| format!("チャンネル監視結果を読めません: {}", e))?;
    let Some(entries) = value.get("entries").and_then(Value::as_array) else {
        return Ok(Vec::new());
    };
    entries
        .iter()
        .cloned()
        .map(|entry| {
            serde_json::from_value::<FlatPlaylistEntry>(entry)
                .map_err(|e| format!("チャンネル監視結果を読めません: {}", e))
        })
        .collect()
}

fn title_matches(title: &str, include_words: &[String], exclude_words: &[String]) -> bool {
    let normalized_title = title.to_lowercase();
    include_words
        .iter()
        .all(|word| normalized_title.contains(&word.to_lowercase()))
        && exclude_words
            .iter()
            .all(|word| !normalized_title.contains(&word.to_lowercase()))
}

fn entry_url(entry: &FlatPlaylistEntry) -> Option<String> {
    if let Some(webpage_url) = &entry.webpage_url {
        if webpage_url.starts_with("http://") || webpage_url.starts_with("https://") {
            return Some(webpage_url.clone());
        }
    }
    if let Some(url) = &entry.url {
        if url.starts_with("http://") || url.starts_with("https://") {
            return Some(url.clone());
        }
        return Some(format!("https://www.youtube.com/watch?v={}", url));
    }
    entry
        .id
        .as_ref()
        .map(|id| format!("https://www.youtube.com/watch?v={}", id))
}
