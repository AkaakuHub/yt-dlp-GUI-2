use crate::{config::Settings, download_command::RunCommandParam};
use serde::{Deserialize, Serialize};
use tauri::{Emitter, Window};
use tokio::time::{sleep, Duration};

#[derive(Serialize)]
struct RemoteRunRequest {
    param: RunCommandParam,
}

#[derive(Deserialize)]
struct RemoteRunResponse {
    pid: u32,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RemoteOutputResponse {
    running: bool,
    outputs: Vec<RemoteOutputLine>,
}

#[derive(Deserialize)]
struct RemoteOutputLine {
    id: u64,
    line: String,
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
        .post(format!("{}/run", server_url))
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
    start_remote_output_polling(server_url, token.to_string(), window);
    Ok(body.pid)
}

pub(crate) async fn stop_remote_download(settings: &Settings) -> Result<(), String> {
    let server_url = normalize_server_url(&settings.remote_server_url)?;
    let token = settings.remote_auth_token.trim();
    if token.is_empty() {
        return Err("リモートサーバーのトークンが設定されていません".into());
    }

    let response = reqwest::Client::new()
        .post(format!("{}/stop", server_url))
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

fn start_remote_output_polling(server_url: String, token: String, window: Window) {
    tokio::spawn(async move {
        let client = reqwest::Client::new();
        let mut since = 0_u64;

        loop {
            let response = client
                .get(format!("{}/output?since={}", server_url, since))
                .bearer_auth(&token)
                .send()
                .await;
            let Ok(response) = response else {
                let _ = window.emit("process-exit", "リモートサーバーとの接続が切断されました");
                break;
            };
            if !response.status().is_success() {
                let status = response.status();
                let body = response.text().await.unwrap_or_default();
                let _ = window.emit(
                    "process-exit",
                    format!("リモートサーバーがエラーを返しました: {} {}", status, body),
                );
                break;
            }
            let output_response = response.json::<RemoteOutputResponse>().await;
            let Ok(output_response) = output_response else {
                let _ = window.emit("process-exit", "リモートサーバーの応答を解析できません");
                break;
            };

            for output in output_response.outputs {
                since = output.id + 1;
                if !output.line.is_empty() {
                    let _ = window.emit("process-output", output.line);
                }
            }

            if !output_response.running {
                let _ = window.emit("process-output", "\n");
                let _ = window.emit("process-exit", "プロセス終了");
                break;
            }

            sleep(Duration::from_millis(500)).await;
        }
    });
}

#[tauri::command]
pub async fn test_remote_server(server_url: String, auth_token: String) -> Result<(), String> {
    let server_url = normalize_server_url(&server_url)?;
    let token = auth_token.trim();
    if token.is_empty() {
        return Err("トークンが入力されていません".into());
    }

    let response = reqwest::Client::new()
        .get(format!("{}/health", server_url))
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
