use tauri::AppHandle;
use tauri_plugin_updater::UpdaterExt;

use crate::server_cli_service;

#[tauri::command]
pub async fn install_available_update(app: AppHandle) -> Result<(), String> {
    let updater = app
        .updater_builder()
        .on_before_exit(server_cli_service::stop_server_cli_before_exit)
        .build()
        .map_err(|e| format!("アップデートの準備に失敗しました: {}", e))?;
    let update = updater
        .check()
        .await
        .map_err(|e| format!("アップデートの確認に失敗しました: {}", e))?
        .ok_or_else(|| "利用可能なアップデートがありません".to_string())?;

    server_cli_service::stop_server_cli_for_update().await?;
    update
        .download_and_install(|_, _| {}, || {})
        .await
        .map_err(|e| format!("アップデートのインストールに失敗しました: {}", e))?;

    Ok(())
}
