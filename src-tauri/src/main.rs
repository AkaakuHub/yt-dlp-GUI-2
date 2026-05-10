#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod client;
mod command_handlers;
mod config;
mod download_command;
mod process_manager;
#[path = "server_cli/service.rs"]
mod server_cli_service;
mod system;
mod tools;

use std::sync::Arc;

use command_handlers::{start_download, stop_download};
use process_manager::CommandManager;
use system::{
    get_current_version, get_os_type, get_sorted_directory_contents, open_directory, open_file,
    open_url_and_exit,
};
use tools::{check_tools_status, download_bundle_tools, ensure_bundle_tools};

#[cfg(any(windows, target_os = "macos"))]
use window_shadows_v2::set_shadows;

fn main() {
    let _ = fix_path_env::fix();
    let app_state = config::AppState::new();
    let command_manager = Arc::new(tokio::sync::Mutex::new(CommandManager::new()));

    tauri::Builder::default()
        .setup(|app| {
            #[cfg(any(windows, target_os = "macos"))]
            set_shadows(app, true);
            Ok(())
        })
        .manage(app_state)
        .manage(command_manager)
        .invoke_handler(tauri::generate_handler![
            start_download,
            stop_download,
            open_directory,
            open_url_and_exit,
            get_sorted_directory_contents,
            open_file,
            get_current_version,
            get_os_type,
            download_bundle_tools,
            ensure_bundle_tools,
            check_tools_status,
            config::commands::set_save_dir,
            config::commands::set_browser,
            config::commands::set_server_port,
            config::commands::set_is_send_notification,
            config::commands::set_use_cookie,
            config::commands::set_index,
            config::commands::set_theme_mode,
            config::commands::get_settings,
            config::commands::set_use_bundle_tools,
            config::commands::set_yt_dlp_path,
            config::commands::set_ffmpeg_path,
            config::commands::set_deno_path,
            config::commands::set_execution_target,
            config::commands::set_remote_server_url,
            config::commands::set_remote_auth_token,
            config::commands::set_server_auth_token,
            client::remote::test_remote_server,
            server_cli_service::register_server_cli,
            server_cli_service::unregister_server_cli,
            server_cli_service::start_server_cli,
            server_cli_service::stop_server_cli,
            server_cli_service::get_server_cli_status,
            server_cli_service::generate_remote_auth_token
        ])
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_drag::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
