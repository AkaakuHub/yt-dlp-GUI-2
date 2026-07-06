#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod channel_monitor;
mod command_handlers;
mod config;
mod download_command;
mod notification;
mod persistent_server_service;
mod process_manager;
mod reservation;
mod reservation_store;
mod system;
mod tools;
mod web_server;

use std::sync::Arc;

use command_handlers::{start_download, stop_download};
use process_manager::CommandManager;
use system::{
    get_current_version, get_os_type, get_sorted_directory_contents, open_directory, open_file,
    open_url_and_exit,
};
use tools::{check_tools_status, download_bundle_tools, ensure_bundle_tools};

use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Manager, WindowEvent};

#[cfg(any(windows, target_os = "macos"))]
use window_shadows_v2::set_shadows;

const TRAY_MENU_SHOW: &str = "show";
const TRAY_MENU_QUIT: &str = "quit";

fn main() {
    attach_parent_console();
    let _ = fix_path_env::fix();
    let app_state = config::AppState::new();
    let command_manager = Arc::new(tokio::sync::Mutex::new(CommandManager::new()));

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_main_window(app);
        }))
        .setup(|app| {
            #[cfg(any(windows, target_os = "macos"))]
            set_shadows(app, true);
            setup_tray(app)?;
            let app_handle = app.handle().clone();
            let app_state = app.state::<config::AppState>();
            let command_manager = app.state::<Arc<tokio::sync::Mutex<CommandManager>>>();
            let command_manager_inner = command_manager.inner().clone();
            web_server::start(app_handle, app_state, command_manager);
            let reservation_store = app.state::<config::AppState>().reservation_store.clone();
            command_handlers::resume_pending_reservations(
                command_manager_inner.clone(),
                reservation_store.clone(),
            );
            channel_monitor::resume_channel_monitor_rules(command_manager_inner, reservation_store);
            if std::env::args().any(|arg| arg == "--headless") {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.hide();
                }
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if matches!(event, WindowEvent::CloseRequested { .. }) {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    let settings = config::Settings::new();
                    if settings.keep_running_in_tray {
                        api.prevent_close();
                        let _ = window.hide();
                    }
                }
            }
        })
        .on_tray_icon_event(|app, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        })
        .on_menu_event(|app, event| match event.id().as_ref() {
            TRAY_MENU_SHOW => show_main_window(app),
            TRAY_MENU_QUIT => app.exit(0),
            _ => {}
        })
        .manage(app_state)
        .manage(command_manager)
        .invoke_handler(tauri::generate_handler![
            start_download,
            command_handlers::start_download_queue,
            stop_download,
            command_handlers::schedule_download,
            command_handlers::schedule_youtube_live_from_start,
            command_handlers::get_reservations,
            channel_monitor::create_channel_monitor_rule,
            channel_monitor::get_channel_monitor_rules,
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
            config::commands::set_server_auth_token,
            config::commands::set_keep_running_in_tray,
            persistent_server_service::register_persistent_server,
            persistent_server_service::unregister_persistent_server,
            persistent_server_service::get_persistent_server_status,
            persistent_server_service::generate_server_auth_token,
            web_server::get_web_server_status,
            notification::send_download_complete_notification
        ])
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_drag::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app_handle, _event| {});
}

fn setup_tray(app: &mut tauri::App) -> tauri::Result<()> {
    let Some(icon) = app.default_window_icon().cloned() else {
        return Ok(());
    };
    let show = MenuItem::with_id(app, TRAY_MENU_SHOW, "表示", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, TRAY_MENU_QUIT, "終了", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &quit])?;
    TrayIconBuilder::with_id("main")
        .icon(icon)
        .tooltip("yt-dlp-GUI")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .build(app)?;
    Ok(())
}

fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

#[cfg(windows)]
fn attach_parent_console() {
    unsafe {
        windows_sys::Win32::System::Console::AttachConsole(
            windows_sys::Win32::System::Console::ATTACH_PARENT_PROCESS,
        );
    }
}

#[cfg(not(windows))]
fn attach_parent_console() {}
