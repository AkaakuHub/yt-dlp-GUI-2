// config.rs
use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf, sync::Mutex};
use std::{fs::File, io::Write, mem};

const SETTINGS_FILENAME: &str = "settings.json";

#[cfg(target_os = "windows")]
fn get_config_root() -> PathBuf {
    let appdata = PathBuf::from(std::env::var("APPDATA").unwrap());
    appdata.join("yt-dlp-GUI")
}

#[cfg(target_os = "linux, macos")]
fn get_config_root() -> PathBuf {
    let home = PathBuf::from(std::env::var("Home").unwrap());
    home.join(".yt-dlp-GUI")
}

trait Config {
    fn write_file(&self) {}
    fn read_file(&mut self) {}
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Settings {
    save_dir: String,
    browser: String,
    drop_down_index: String,
    // custom_commands_list: Vec<String>,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            save_dir: "".to_string(),
            browser: "firefox".to_string(),
            drop_down_index: "3".to_string(),
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
        let deserialized: Self = serde_json::from_str(&input).unwrap();
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
        println!("save_dir: {}", self.save_dir);
    }

    pub fn set_browser(&mut self, new_browser: String) {
        self.browser = new_browser;
        self.write_file();
        println!("browser: {}", self.browser);
    }

    pub fn set_drop_down_index(&mut self, new_drop_down_index: String) {
        self.drop_down_index = new_drop_down_index;
        self.write_file();
    }
}

pub struct AppState {
    settings: Mutex<Settings>,
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
        let mut settings = state.settings.lock().unwrap();
        settings.set_save_dir(new_save_dir);
        Ok(())
    }

    #[tauri::command]
    pub async fn set_browser(
        state: State<'_, AppState>,
        new_browser: String,
    ) -> Result<(), String> {
        let mut settings = state.settings.lock().unwrap();
        settings.set_browser(new_browser);
        Ok(())
    }

    #[tauri::command]
    pub async fn set_drop_down_index(
        state: State<'_, AppState>,
        new_drop_down_index: String,
    ) -> Result<(), String> {
        let mut settings = state.settings.lock().unwrap();
        settings.set_drop_down_index(new_drop_down_index);
        Ok(())
    }

    #[tauri::command]
    pub async fn get_settings(state: State<'_, AppState>) -> Result<Settings, String> {
        let settings = state.settings.lock().unwrap().clone();
        Ok(settings)
    }
}
