#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod command_handlers;
mod config;
mod download_command;
mod process_manager;
mod server;
mod system;
mod tools;

use std::sync::Arc;

use command_handlers::{run_command, stop_command};
use process_manager::CommandManager;
use server::ServerManager;
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
    let server_manager = Arc::new(tokio::sync::Mutex::new(ServerManager::new()));

    tauri::Builder::default()
        .setup(|app| {
            #[cfg(any(windows, target_os = "macos"))]
            set_shadows(app, true);
            Ok(())
        })
        .manage(app_state)
        .manage(command_manager)
        .manage(server_manager)
        .invoke_handler(tauri::generate_handler![
            run_command,
            stop_command,
            open_directory,
            open_url_and_exit,
            server::toggle_server,
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
            config::commands::set_index,
            config::commands::set_is_server_enabled,
            config::commands::set_theme_mode,
            config::commands::get_settings,
            config::commands::set_use_bundle_tools,
            config::commands::set_yt_dlp_path,
            config::commands::set_ffmpeg_path,
            config::commands::set_deno_path
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
