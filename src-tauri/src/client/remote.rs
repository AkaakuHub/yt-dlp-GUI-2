use crate::{config::Settings, download_command::RunCommandParam};
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use tauri::{Emitter, Window};

#[derive(Serialize)]
struct RemoteRunRequest {
    param: RunCommandParam,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RemoteScheduleRequest {
    param: RunCommandParam,
    run_at_ms: u64,
}

#[derive(Deserialize)]
struct RemoteRunResponse {
    pid: u32,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RemoteScheduleResponse {
    schedule_id: String,
}

pub(crate) async fn start_remote_download(
    param: RunCommandParam,
    settings: &Settings,
    window: Window,
) -> Result<u32, String> {
    let server_url = normalize_server_url(&settings.remote_server_url)?;
    let token = settings.remote_auth_token.trim();
    if token.is_empty() {
        return Err("リモートサーバーのトークンが設定されていません".into());
    }

    let response = reqwest::Client::new()
        .post(format!("{}/api/downloads", server_url))
        .bearer_auth(token)
        .json(&RemoteRunRequest { param })
        .send()
        .await
        .map_err(|e| format!("リモートサーバーへの接続に失敗しました: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!(
            "リモートサーバーがエラーを返しました: {} {}",
            status, body
        ));
    }

    let body = response
        .json::<RemoteRunResponse>()
        .await
        .map_err(|e| format!("リモートサーバーの応答を解析できません: {}", e))?;
    start_remote_output_stream(server_url, token.to_string(), window);
    Ok(body.pid)
}

pub(crate) async fn stop_remote_download(settings: &Settings) -> Result<(), String> {
    let server_url = normalize_server_url(&settings.remote_server_url)?;
    let token = settings.remote_auth_token.trim();
    if token.is_empty() {
        return Err("リモートサーバーのトークンが設定されていません".into());
    }

    let response = reqwest::Client::new()
        .post(format!("{}/api/downloads/stop", server_url))
        .bearer_auth(token)
        .send()
        .await
        .map_err(|e| format!("リモートサーバーへの接続に失敗しました: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!(
            "リモートサーバーがエラーを返しました: {} {}",
            status, body
        ));
    }

    Ok(())
}

pub(crate) async fn schedule_remote_download(
    param: RunCommandParam,
    run_at_ms: u64,
    settings: &Settings,
    window: Window,
) -> Result<String, String> {
    let server_url = normalize_server_url(&settings.remote_server_url)?;
    let token = settings.remote_auth_token.trim();
    if token.is_empty() {
        return Err("リモートサーバーのトークンが設定されていません".into());
    }

    let response = reqwest::Client::new()
        .post(format!("{}/api/schedules", server_url))
        .bearer_auth(token)
        .json(&RemoteScheduleRequest { param, run_at_ms })
        .send()
        .await
        .map_err(|e| format!("リモートサーバーへの接続に失敗しました: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!(
            "リモートサーバーがエラーを返しました: {} {}",
            status, body
        ));
    }

    let body = response
        .json::<RemoteScheduleResponse>()
        .await
        .map_err(|e| format!("リモートサーバーの応答を解析できません: {}", e))?;
    start_remote_output_stream(server_url, token.to_string(), window);
    Ok(body.schedule_id)
}

fn start_remote_output_stream(server_url: String, token: String, window: Window) {
    tokio::spawn(async move {
        let response = reqwest::Client::new()
            .get(format!("{}/api/events", server_url))
            .bearer_auth(&token)
            .send()
            .await;
        let Ok(response) = response else {
            let _ = window.emit("process-exit", "リモートサーバーとの接続が切断されました");
            return;
        };
        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            let _ = window.emit(
                "process-exit",
                format!("リモートサーバーがエラーを返しました: {} {}", status, body),
            );
            return;
        }

        let mut stream = response.bytes_stream();
        let mut buffer = String::new();
        while let Some(chunk) = stream.next().await {
            let Ok(chunk) = chunk else {
                let _ = window.emit("process-exit", "リモートサーバーとの接続が切断されました");
                return;
            };
            let Ok(text) = std::str::from_utf8(&chunk) else {
                let _ = window.emit("process-exit", "リモートサーバーの応答を解析できません");
                return;
            };
            buffer.push_str(text);
            while let Some((raw_event, rest)) = buffer.split_once("\n\n") {
                let raw_event = raw_event.to_string();
                buffer = rest.to_string();
                if handle_remote_sse_event(&raw_event, &window) {
                    return;
                }
            }
        }
        let _ = window.emit("process-exit", "リモートサーバーとの接続が切断されました");
    });
}

fn handle_remote_sse_event(raw_event: &str, window: &Window) -> bool {
    let mut event_name = "";
    let mut data = "";
    for line in raw_event.lines() {
        if let Some(value) = line.strip_prefix("event: ") {
            event_name = value;
        } else if let Some(value) = line.strip_prefix("data: ") {
            data = value;
        }
    }

    let payload = serde_json::from_str::<String>(data).unwrap_or_default();
    match event_name {
        "process-output" => {
            if !payload.is_empty() {
                let _ = window.emit("process-output", payload);
            }
            false
        }
        "process-exit" => {
            let _ = window.emit("process-output", "\n");
            let _ = window.emit("process-exit", payload);
            true
        }
        _ => false,
    }
}

#[tauri::command]
pub async fn test_remote_server(server_url: String, auth_token: String) -> Result<(), String> {
    let server_url = normalize_server_url(&server_url)?;
    let token = auth_token.trim();
    if token.is_empty() {
        return Err("トークンが入力されていません".into());
    }

    let response = reqwest::Client::new()
        .get(format!("{}/api/health", server_url))
        .bearer_auth(token)
        .send()
        .await
        .map_err(|e| format!("リモートサーバーへの接続に失敗しました: {}", e))?;

    if response.status().is_success() {
        return Ok(());
    }

    let status = response.status();
    let body = response.text().await.unwrap_or_default();
    Err(format!(
        "リモートサーバーがエラーを返しました: {} {}",
        status, body
    ))
}

fn normalize_server_url(server_url: &str) -> Result<String, String> {
    let trimmed = server_url.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        return Err("リモートサーバーURLが設定されていません".into());
    }
    Ok(trimmed.to_string())
}
