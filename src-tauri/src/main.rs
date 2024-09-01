use serde::Deserialize;
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

#[derive(Default)]
struct ProcessManager {
    process: Option<TokioChild>,
}

#[derive(Deserialize)]
struct RunCommandParam {
    kind: i32,
    url: Option<String>,
    codec_id: Option<String>,
    options: Option<String>,
}

#[tauri::command]
async fn run_command(
    process_manager: State<'_, Arc<Mutex<ProcessManager>>>,
    window: tauri::Window,
    param: RunCommandParam,
) -> Result<u32, String> {
    let mut manager = process_manager.lock().await;

    if manager.process.is_some() {
        return Err("プロセスは既に実行中です".into());
    }

    let url = param.url.unwrap_or("".to_string());
    let mut args = vec!["--list-formats", "--skip-download"];
    args.push(&url);

    let mut child = TokioCommand::new("10sec_debug.exe")
        .args(&args)
        .stdout(Stdio::piped())
        .spawn()
        .map_err(|e| format!("コマンドの実行に失敗しました: {}", e))?;

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
