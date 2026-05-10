use crate::{config::Settings, download_command::RunCommandParam};
use serde::{Deserialize, Serialize};

#[derive(Serialize)]
struct RemoteRunRequest {
    param: RunCommandParam,
}

#[derive(Deserialize)]
struct RemoteRunResponse {
    pid: u32,
}

pub(crate) async fn start_remote_download(
    param: RunCommandParam,
    settings: &Settings,
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
