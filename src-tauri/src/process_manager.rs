use std::process::Stdio;
use std::sync::Arc;

use tauri::{Emitter, Window};
use tokio::io::AsyncReadExt;
use tokio::io::BufReader as TokioBufReader;
use tokio::process::Command as TokioCommand;
use tokio::select;
use tokio::sync::broadcast;
use tokio::sync::Mutex;
use tokio::task::{self, JoinHandle};

pub struct CommandManager {
    command_task: Option<JoinHandle<()>>,
    stop_signal: Option<broadcast::Sender<()>>,
}

impl CommandManager {
    pub fn new() -> Self {
        Self {
            command_task: None,
            stop_signal: None,
        }
    }

    pub async fn start_command(
        &mut self,
        command_manager: Arc<Mutex<CommandManager>>,
        args: Vec<String>,
        window: tauri::Window,
        yt_dlp_path: &str,
    ) -> Result<u32, String> {
        if self.command_task.is_some() {
            return Err("プロセスは既に実行中です".into());
        }

        let (tx, _) = broadcast::channel(1);
        self.stop_signal = Some(tx.clone());

        #[cfg(target_os = "windows")]
        let mut child = TokioCommand::new(yt_dlp_path)
            .args(&args)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .creation_flags(0x08000000)
            .spawn()
            .map_err(|e| format!("コマンドの実行に失敗しました: {}", e))?;

        #[cfg(any(target_os = "linux", target_os = "macos"))]
        let mut child = TokioCommand::new(yt_dlp_path)
            .args(&args)
            .env("LC_ALL", "en_US.UTF-8")
            .env("LANG", "en_US.UTF-8")
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("コマンドの実行に失敗しました: {}", e))?;

        let pid = child.id().ok_or("プロセスIDの取得に失敗しました")?;

        window
            .emit(
                "process-output",
                format!(
                    "{}>yt-dlp {}\n",
                    std::env::current_dir().unwrap().to_string_lossy(),
                    args.join(" ")
                ),
            )
            .unwrap();

        let stdout = child.stdout.take().ok_or("標準出力の取得に失敗しました")?;
        let stderr = child
            .stderr
            .take()
            .ok_or("標準エラーの取得に失敗しました")?;

        let window_clone = window.clone();
        let window_clone2 = window.clone();
        let tx_clone = tx.clone();
        let command_manager_clone = Arc::clone(&command_manager);

        let task_handle = task::spawn(async move {
            let stdout_reader = TokioBufReader::new(stdout);
            let stderr_reader = TokioBufReader::new(stderr);

            let stop_rx1 = tx.subscribe();
            let stop_rx2 = tx.subscribe();

            let window_clone_stdout = window_clone.clone();
            let window_clone_stderr = window_clone2.clone();

            let stdout_task = tokio::spawn(async move {
                process_lines(stdout_reader, window_clone_stdout, stop_rx1).await;
            });

            let stderr_task = tokio::spawn(async move {
                process_lines(stderr_reader, window_clone_stderr, stop_rx2).await;
            });

            let mut rx = tx_clone.subscribe();

            tokio::select! {
                _ = rx.recv() => {
                    if let Err(e) = child.kill().await {
                        eprintln!("Failed to kill process: {}", e);
                    }
                    let _ = child.wait().await;
                    window_clone2.emit("process-exit", "プロセス終了").unwrap();

                    return;
                }
                status = child.wait() => {
                    match status {
                        Ok(_) => {
                            window_clone.emit("process-output", "\n").unwrap();
                            window_clone2.emit("process-exit", "プロセス終了").unwrap();
                        }
                        Err(e) => {
                            window_clone
                                .emit("process-exit", format!("プロセス終了エラー: {}", e))
                                .unwrap();
                        }
                    }
                }
            }

            let _ = stdout_task.await;
            let _ = stderr_task.await;

            let mut manager = command_manager_clone.lock().await;
            manager.command_task = None;
        });

        self.command_task = Some(task_handle);

        Ok(pid)
    }

    pub async fn stop_command(&mut self, window: tauri::Window) -> Result<(), String> {
        if let Some(stop_signal) = self.stop_signal.take() {
            if let Err(err) = stop_signal.send(()) {
                return Err(format!("Failed to send stop signal: {}", err));
            }
        } else {
            return Err("Command is not running.".to_string());
        }

        if let Some(handle) = self.command_task.take() {
            if let Err(err) = handle.await {
                return Err(format!("Failed to stop command task: {}", err));
            }
        }

        window
            .emit("process-output", "プロセスを停止しました\n")
            .unwrap();
        Ok(())
    }
}

fn decode_buffer(buffer: &[u8]) -> String {
    #[cfg(any(target_os = "linux", target_os = "macos"))]
    {
        match std::str::from_utf8(buffer) {
            Ok(s) => return s.to_string(),
            Err(_) => {
                let (decoded, _, has_errors) = encoding_rs::SHIFT_JIS.decode(buffer);
                if !has_errors {
                    return decoded.to_string();
                }
                return String::from_utf8_lossy(buffer).to_string();
            }
        }
    }

    #[cfg(target_os = "windows")]
    {
        let (decoded, _, has_errors) = encoding_rs::SHIFT_JIS.decode(buffer);
        if !has_errors {
            return decoded.to_string();
        }

        match std::str::from_utf8(buffer) {
            Ok(s) => return s.to_string(),
            Err(_) => return String::from_utf8_lossy(buffer).to_string(),
        }
    }
}

async fn process_lines<R>(mut reader: R, window: Window, mut stop_rx: broadcast::Receiver<()>) -> ()
where
    R: AsyncReadExt + Unpin,
{
    let mut buffer = Vec::new();
    let mut temp_buffer = [0u8; 1024];
    const MAX_LINE_LENGTH: usize = 8192;

    loop {
        select! {
            result = reader.read(&mut temp_buffer) => {
                match result {
                    Ok(0) => break,
                    Ok(n) => {
                        for &byte in &temp_buffer[..n] {
                            if byte == b'\r' || byte == b'\n' {
                                let line = decode_buffer(&buffer);
                                window.emit("process-output", line).unwrap();
                                buffer.clear();
                            } else {
                                buffer.push(byte);
                                if buffer.len() > MAX_LINE_LENGTH {
                                    let line = decode_buffer(&buffer);
                                    window.emit("process-output", line).unwrap();
                                    buffer.clear();
                                }
                            }
                        }
                    }
                    Err(e) => {
                        eprintln!("読み取りエラー: {}", e);
                        break;
                    }
                }
            }
            _ = stop_rx.recv() => {
                break;
            }
        }
    }

    if !buffer.is_empty() {
        let line = decode_buffer(&buffer);
        window.emit("process-output", line).unwrap();
    }
}
