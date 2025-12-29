use dirs::video_dir;
use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf};
use std::{io::Write, mem};
use tokio::sync::Mutex;

const SETTINGS_FILENAME: &str = "settings.json";

#[cfg(target_os = "windows")]
fn get_config_root() -> PathBuf {
    let appdata = PathBuf::from(std::env::var("APPDATA").unwrap());
    appdata.join("yt-dlp-GUI")
}

#[cfg(any(target_os = "linux", target_os = "macos"))]
fn get_config_root() -> PathBuf {
    let home = PathBuf::from(std::env::var("HOME").unwrap());
    home.join(".yt-dlp-GUI")
}

fn get_default_save_dir() -> String {
    video_dir()
        .unwrap_or_else(|| PathBuf::from("default_videos"))
        .to_string_lossy()
        .to_string()
}


trait Config {
    fn write_file(&self) {}
    fn read_file(&mut self) {}
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Settings {
    pub save_dir: String,
    pub browser: String,
    pub server_port: u16,
    pub is_send_notification: bool,
    pub index: u32,
    pub is_server_enabled: bool,
    pub theme_mode: String,
    pub use_bundle_tools: bool, // true: バンドル版使用, false: パス版使用
    pub yt_dlp_path: String,    // バンドル版またはカスタムパスのyt-dlp
    pub ffmpeg_path: String,    // バンドル版またはカスタムパスのffmpeg
    pub deno_path: String,      // バンドル版またはカスタムパスのdeno
    // custom_commands_list: Vec<String>,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            save_dir: get_default_save_dir(),
            browser: "firefox".to_string(),
            server_port: 50000,
            is_send_notification: true,
            index: 3,
            is_server_enabled: false,
            theme_mode: "system".to_string(),
            use_bundle_tools: true, // デフォルトはバンドル版（初心者向け）
            yt_dlp_path: "".to_string(), // 初回起動時は空文字列にしてセットアップを強制
            ffmpeg_path: "".to_string(), // 初回起動時は空文字列にしてセットアップを強制
            deno_path: "".to_string(), // 初回起動時は空文字列にしてセットアップを強制
            // custom_commands_list: vec![],
        }
    }
}

impl Config for Settings {
    fn write_file(&self) {
        let config_file = get_config_root().join(SETTINGS_FILENAME);
        if !config_file.parent().unwrap().exists() {
            fs::create_dir_all(config_file.parent().unwrap()).unwrap();
        }
        let serialized = serde_json::to_string(self).unwrap();
        let mut file = fs::File::create(config_file).unwrap();
        file.write_all(&serialized.as_bytes()).unwrap();
    }

    fn read_file(&mut self) {
        let config_file = get_config_root().join(SETTINGS_FILENAME);
        let input = fs::read_to_string(config_file).unwrap();
        // もし、jsonに必要なフィールドがない場合、デフォルト値を使う
        let deserialized: Self = serde_json::from_str(&input).unwrap_or_default();
        let _ = mem::replace(self, deserialized);
    }
}

impl Settings {
    pub fn new() -> Self {
        let config_file = get_config_root().join(SETTINGS_FILENAME);
        if !config_file.exists() {
            Self::default()
        } else {
            let mut settings = Self::default();
            settings.read_file();
            settings
        }
    }

    
    pub fn set_save_dir(&mut self, new_save_dir: String) {
        self.save_dir = new_save_dir;
        self.write_file();
    }

    pub fn set_browser(&mut self, new_browser: String) {
        self.browser = new_browser;
        self.write_file();
    }

    pub fn set_server_port(&mut self, new_server_port: u16) {
        self.server_port = new_server_port;
        self.write_file();
    }

    pub fn set_is_send_notification(&mut self, new_is_send_notification: bool) {
        self.is_send_notification = new_is_send_notification;
        self.write_file();
    }

    pub fn set_index(&mut self, new_index: u32) {
        self.index = new_index;
        self.write_file();
    }

    pub fn set_is_server_enabled(&mut self, new_is_server_enabled: bool) {
        self.is_server_enabled = new_is_server_enabled;
        self.write_file();
    }

    pub fn set_theme_mode(&mut self, new_theme_mode: String) {
        self.theme_mode = new_theme_mode;
        self.write_file();
    }

    pub fn set_use_bundle_tools(&mut self, use_bundle_tools: bool) {
        self.use_bundle_tools = use_bundle_tools;
        // バンドルモードに変更した場合は空文字列を設定（セットアップを強制するため）
        if use_bundle_tools {
            self.yt_dlp_path = "".to_string();
            self.ffmpeg_path = "".to_string();
            self.deno_path = "".to_string();
        }
        self.write_file();
    }

    pub fn set_yt_dlp_path(&mut self, yt_dlp_path: String) {
        self.yt_dlp_path = yt_dlp_path;
        self.write_file();
    }

    pub fn set_ffmpeg_path(&mut self, ffmpeg_path: String, deno_path: Option<String>) {
        self.ffmpeg_path = ffmpeg_path;
        if let Some(deno_path) = deno_path {
            self.deno_path = deno_path;
        }
        self.write_file();
    }
}

pub struct AppState {
    pub settings: Mutex<Settings>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            settings: Mutex::from(Settings::new()),
        }
    }
}

pub mod commands {
    use super::*;
    use tauri::State;

    #[tauri::command]
    pub async fn set_save_dir(
        state: State<'_, AppState>,
        new_save_dir: String,
    ) -> Result<(), String> {
        let mut settings = state.settings.lock().await;
        settings.set_save_dir(new_save_dir);
        Ok(())
    }

    #[tauri::command]
    pub async fn set_browser(
        state: State<'_, AppState>,
        new_browser: String,
    ) -> Result<(), String> {
        let mut settings = state.settings.lock().await;
        settings.set_browser(new_browser);
        Ok(())
    }

    #[tauri::command]
    pub async fn set_index(state: State<'_, AppState>, new_index: u32) -> Result<(), String> {
        let mut settings = state.settings.lock().await;
        settings.set_index(new_index);
        Ok(())
    }

    #[tauri::command]
    pub async fn set_server_port(
        state: State<'_, AppState>,
        new_server_port: u16,
    ) -> Result<(), String> {
        let mut settings = state.settings.lock().await;
        settings.set_server_port(new_server_port);
        Ok(())
    }

    #[tauri::command]
    pub async fn set_is_send_notification(
        state: State<'_, AppState>,
        new_is_send_notification: bool,
    ) -> Result<(), String> {
        let mut settings = state.settings.lock().await;
        settings.set_is_send_notification(new_is_send_notification);
        Ok(())
    }

    #[tauri::command]
    pub async fn set_is_server_enabled(
        state: State<'_, AppState>,
        new_is_server_enabled: bool,
    ) -> Result<(), String> {
        let mut settings = state.settings.lock().await;
        settings.set_is_server_enabled(new_is_server_enabled);
        Ok(())
    }

    #[tauri::command]
    pub async fn set_theme_mode(
        state: State<'_, AppState>,
        new_theme_mode: String,
    ) -> Result<(), String> {
        let mut settings = state.settings.lock().await;
        settings.set_theme_mode(new_theme_mode);
        Ok(())
    }

    #[tauri::command]
    pub async fn get_settings(state: State<'_, AppState>) -> Result<Settings, String> {
        let settings = state.settings.lock().await.clone();
        Ok(settings)
    }

    #[tauri::command]
    pub async fn set_use_bundle_tools(
        state: State<'_, AppState>,
        use_bundle_tools: bool,
    ) -> Result<(), String> {
        let mut settings = state.settings.lock().await;
        settings.set_use_bundle_tools(use_bundle_tools);
        Ok(())
    }

    #[tauri::command]
    pub async fn set_yt_dlp_path(
        state: State<'_, AppState>,
        yt_dlp_path: String,
    ) -> Result<(), String> {
        let mut settings = state.settings.lock().await;
        settings.set_yt_dlp_path(yt_dlp_path);
        Ok(())
    }

    #[tauri::command]
    pub async fn set_ffmpeg_path(
        state: State<'_, AppState>,
        ffmpeg_path: String,
        deno_path: Option<String>,
    ) -> Result<(), String> {
        let mut settings = state.settings.lock().await;
        settings.set_ffmpeg_path(ffmpeg_path, deno_path);
        Ok(())
    }
}
