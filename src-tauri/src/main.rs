use serde::Deserialize;
use std::env::current_dir;
use std::process::Command;
use std::process::Stdio;
use std::sync::Arc;
use tauri::Manager;
use tauri::State;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child as TokioChild, Command as TokioCommand};
use tokio::sync::Mutex;
use window_shadows::set_shadow;

mod config;
use config::AppState;

#[derive(Default)]
struct ProcessManager {
    process: Option<TokioChild>,
}

#[derive(Deserialize)]
struct RunCommandParam {
    url: Option<String>,
    kind: i32,
    codec_id: Option<String>,
    subtitle_lang: Option<String>,
}

#[tauri::command]
async fn run_command(
    process_manager: State<'_, Arc<Mutex<ProcessManager>>>,
    window: tauri::Window,
    param: RunCommandParam,
) -> Result<u32, String> {
    let app_state = AppState::new();
    let settings = app_state.settings.lock().await;

    let mut manager = process_manager.lock().await;

    if manager.process.is_some() {
        return Err("プロセスは既に実行中です".into());
    }

    let url = param.url.unwrap_or("".to_string());
    let codec_id = param.codec_id.unwrap_or("best".to_string());
    let subtitle_lang = param.subtitle_lang.unwrap_or("ja".to_string());

    let browser = format!("{}", settings.browser);
    let save_directory = format!("{}/%(title)s.%(ext)s", settings.save_dir);

    let mut args: Vec<&str> = Vec::new();

    match param.kind {
        1 => {
            args.push(&url);
            args.push("-o");
            args.push(&save_directory);
            args.push("-f");
            args.push("bestvideo[ext=mp4]+bestaudio[ext=m4a]");
            args.push("--no-mtime");
        }
        2 => {
            args.push(&url);
            args.push("-o");
            args.push(&save_directory);
            args.push("-f");
            args.push("bestaudio[ext=m4a]");
            args.push("--no-mtime");
        }
        3 => {
            args.push(&url);
            args.push("-o");
            args.push(&save_directory);
            args.push("-f");
            args.push("bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best");
            args.push("--no-mtime");
        }
        4 => {
            args.push(&url);
            args.push("-o");
            args.push(&save_directory);
            args.push("--write-thumbnail");
            args.push("--skip-download");
            args.push("--no-mtime");
        }
        5 => {
            args.push(&url);
            args.push("-o");
            args.push(&save_directory);
            args.push("--no-mtime");
        }
        6 => {
            args.push(&url);
            args.push("-o");
            args.push(&save_directory);
            args.push("--write-auto-sub");
            args.push("--sub-lang");
            args.push(&subtitle_lang);
            args.push("--skip-download");
        }
        7 => {
            args.push(&url);
            args.push("--list-formats");
            args.push("--skip-download");
        }
        8 => {
            args.push(&url);
            args.push("-o");
            args.push(&save_directory);
            args.push("-f");
            args.push(&codec_id);
            args.push("--no-mtime");
        }
        9 => {
            args.push(&url);
            args.push("--list-formats");
            args.push("--skip-download");
            args.push("--cookies-from-browser");
            args.push(&browser);
        }
        10 => {
            args.push(&url);
            args.push("-o");
            args.push(&save_directory);
            args.push("-f");
            args.push(&codec_id);
            args.push("--no-mtime");
            args.push("--cookies-from-browser");
            args.push(&browser);
        }
        11 => {
            args.push(&url);
            args.push("-o");
            args.push(&save_directory);
            args.push("-f");
            args.push("141/bestaudio[ext=m4a]");
            args.push("--no-mtime");
            args.push("--cookies-from-browser");
            args.push(&browser);
        }
        12 => {
            args.push(&url);
            args.push("-o");
            args.push(&save_directory);
            args.push("--live-from-start");
        }
        _ => {
            return Err("不正な種類です".into());
        }
    }

    let mut child = TokioCommand::new("yt-dlp")
        .args(&args)
        .stdout(Stdio::piped())
        .spawn()
        .map_err(|e| format!("コマンドの実行に失敗しました: {}", e))?;

    window
        .emit(
            "ffmpeg-output",
            format!(
                "{}>yt-dlp {}\n",
                current_dir().unwrap().to_string_lossy(),
                args.join(" ")
            ),
        )
        .unwrap();

    let pid = child.id().ok_or("プロセスIDの取得に失敗しました")?;
    let stdout = child.stdout.take().ok_or("標準出力の取得に失敗しました")?;

    manager.process = Some(child);

    let process_manager_clone: Arc<Mutex<ProcessManager>> = Arc::clone(&process_manager);
    tauri::async_runtime::spawn(async move {
        let mut reader = BufReader::new(stdout).lines();

        while let Some(line) = reader.next_line().await.unwrap() {
            window.emit("ffmpeg-output", line).unwrap();
        }

        let mut manager = process_manager_clone.lock().await;
        if let Some(ref mut child) = manager.process {
            let result = child.wait().await;
            match result {
                Ok(status) => {
                    window
                        .emit(
                            "process-exit",
                            format!("プロセス終了: PID={}, ステータス={}", pid, status),
                        )
                        .unwrap();
                }
                Err(e) => {
                    window
                        .emit("process-exit", format!("プロセス終了エラー: {}", e))
                        .unwrap();
                }
            }
        }

        manager.process = None;
    });

    Ok(pid)
}

#[cfg(target_os = "windows")]
#[tauri::command]
fn open_directory(path: String) {
    Command::new("explorer").arg(path).spawn().unwrap();
}

#[cfg(any(target_os = "linux", target_os = "macos"))]
#[tauri::command]
fn open_directory(path: String) {
    Command::new("open").arg(path).spawn().unwrap();
}

fn main() {
    let app_state = config::AppState::new();
    let process_manager = Arc::new(Mutex::new(ProcessManager::default()));

    tauri::Builder::default()
        .setup(|app| {
            let main_window = app.get_window("main").unwrap();
            #[cfg(any(windows, target_os = "macos"))]
            set_shadow(main_window, true).unwrap();
            Ok(())
        })
        .manage(app_state)
        .manage(process_manager) // ProcessManagerを管理対象に追加
        .invoke_handler(tauri::generate_handler![
            run_command,
            open_directory,
            config::commands::set_save_dir,
            config::commands::set_browser,
            config::commands::set_index,
            config::commands::get_settings
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
