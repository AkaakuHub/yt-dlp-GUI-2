// config.rs
use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf, sync::Mutex};
use std::{fs::File, io::Write, mem};

const SETTINGS_FILENAME: &str = "settings.json";

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Settings {
    pub save_dir: String,
    pub browser: String,
    pub drop_down_index: String,
    // pub custom_commands_list: Vec<String>,
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            save_dir: "".to_string(),
            browser: "firefox".to_string(),
            drop_down_index: "3".to_string(),
            // custom_commands_list: vec![],
        }
    }
}

pub trait Config {
    fn write_file(&self);
    fn read_file(&mut self);
}

impl Config for Settings {
    fn write_file(&self) {
        let config_file = get_config_root().join(SETTINGS_FILENAME);
        if let Some(parent) = config_file.parent() {
            if !parent.exists() {
                fs::create_dir_all(parent).unwrap();
            }
        }
        let serialized = serde_json::to_string(self).unwrap();
        let mut file = File::create(config_file).unwrap();
        file.write_all(serialized.as_bytes()).unwrap();
    }

    fn read_file(&mut self) {
        let config_file = get_config_root().join(SETTINGS_FILENAME);
        if let Ok(input) = fs::read_to_string(config_file) {
            let deserialized: Self = serde_json::from_str(&input).unwrap();
            let _ = mem::replace(self, deserialized);
        }
    }
}

#[cfg(target_os = "windows")]
fn get_config_root() -> PathBuf {
    PathBuf::from(std::env::var("APPDATA").unwrap()).join("myapp")
}

#[cfg(target_os = "linux")]
fn get_config_root() -> PathBuf {
    PathBuf::from(std::env::var("HOME").unwrap()).join(".myapp")
}

pub struct AppState {
    pub settings: Mutex<Settings>,
}

impl AppState {
    pub fn new() -> Self {
        let mut settings = Settings::default();
        settings.read_file(); // ファイルから設定を読み込む
        AppState {
            settings: Mutex::new(settings),
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
        let mut settings = state.settings.lock().unwrap();
        settings.save_dir = new_save_dir;
        settings.write_file();
        Ok(())
    }

    #[tauri::command]
    pub async fn set_browser(
        state: State<'_, AppState>,
        new_browser: String,
    ) -> Result<(), String> {
        let mut settings = state.settings.lock().unwrap();
        settings.browser = new_browser;
        settings.write_file();
        Ok(())
    }

    #[tauri::command]
    pub async fn set_drop_down_index(
        state: State<'_, AppState>,
        new_drop_down_index: String,
    ) -> Result<(), String> {
        let mut settings = state.settings.lock().unwrap();
        settings.drop_down_index = new_drop_down_index;
        settings.write_file();
        Ok(())
    }
}
