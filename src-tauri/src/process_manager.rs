use std::process::Stdio;
use std::sync::Arc;

use serde::Serialize;
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
    outputs: Vec<ProcessOutput>,
    next_output_id: u64,
    running: bool,
    pid: Option<u32>,
    reservations: Vec<ScheduledReservation>,
    next_reservation_id: u64,
}

#[derive(Clone)]
pub struct ProcessOutput {
    pub id: u64,
    pub line: String,
}

pub struct ProcessSnapshot {
    pub running: bool,
    pub outputs: Vec<ProcessOutput>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScheduledReservation {
    pub id: u64,
    pub title: String,
    pub url: String,
    pub run_at_ms: u64,
    pub kind: String,
    pub status: String,
}

impl CommandManager {
    pub fn new() -> Self {
        Self {
            command_task: None,
            stop_signal: None,
            outputs: Vec::new(),
            next_output_id: 0,
            running: false,
            pid: None,
            reservations: Vec::new(),
            next_reservation_id: 1,
        }
    }

    pub async fn start_command(
        &mut self,
        command_manager: Arc<Mutex<CommandManager>>,
        args: Vec<String>,
        window: Option<tauri::Window>,
        yt_dlp_path: &str,
    ) -> Result<u32, String> {
        if self.command_task.is_some() {
            return Err("プロセスは既に実行中です".into());
        }

        self.outputs.clear();
        self.next_output_id = 0;
        self.running = true;

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
        self.pid = Some(pid);

        let command_line = format!(
            "{}>yt-dlp {}\n",
            std::env::current_dir().unwrap().to_string_lossy(),
            args.join(" ")
        );
        self.push_output(command_line.clone());
        if let Some(window) = &window {
            let _ = window.emit("process-output", command_line);
        }

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
            let command_manager_stdout = Arc::clone(&command_manager_clone);
            let command_manager_stderr = Arc::clone(&command_manager_clone);

            let stdout_task = tokio::spawn(async move {
                process_lines(
                    stdout_reader,
                    command_manager_stdout,
                    window_clone_stdout,
                    stop_rx1,
                )
                .await;
            });

            let stderr_task = tokio::spawn(async move {
                process_lines(
                    stderr_reader,
                    command_manager_stderr,
                    window_clone_stderr,
                    stop_rx2,
                )
                .await;
            });

            let mut rx = tx_clone.subscribe();

            tokio::select! {
                _ = rx.recv() => {
                    if let Err(e) = child.kill().await {
                        eprintln!("Failed to kill process: {}", e);
                    }
                    let _ = child.wait().await;
                    finish_process(&command_manager_clone, window_clone2, "プロセス終了").await;

                    return;
                }
                status = child.wait() => {
                    match status {
                        Ok(_) => {
                            push_process_output(&command_manager_clone, window_clone.clone(), "\n".to_string()).await;
                            finish_process(&command_manager_clone, window_clone2, "プロセス終了").await;
                        }
                        Err(e) => {
                            finish_process(
                                &command_manager_clone,
                                window_clone,
                                &format!("プロセス終了エラー: {}", e),
                            ).await;
                        }
                    }
                }
            }

            let _ = stdout_task.await;
            let _ = stderr_task.await;

            let mut manager = command_manager_clone.lock().await;
            manager.command_task = None;
            manager.stop_signal = None;
            manager.running = false;
            manager.pid = None;
        });

        self.command_task = Some(task_handle);

        Ok(pid)
    }

    pub async fn stop_command(&mut self, window: Option<tauri::Window>) -> Result<(), String> {
        if let Some(stop_signal) = self.stop_signal.take() {
            if let Err(err) = stop_signal.send(()) {
                return Err(format!("Failed to send stop signal: {}", err));
            }
        } else {
            return Err("Command is not running.".to_string());
        }

        self.command_task.take();

        self.running = false;
        self.pid = None;
        self.push_output("プロセスを停止しました\n".to_string());
        if let Some(window) = window {
            let _ = window.emit("process-output", "プロセスを停止しました\n");
        }
        Ok(())
    }

    pub fn snapshot_since(&self, since: u64) -> ProcessSnapshot {
        ProcessSnapshot {
            running: self.running,
            outputs: self
                .outputs
                .iter()
                .filter(|output| output.id >= since)
                .cloned()
                .collect(),
        }
    }

    pub fn add_reservation(
        &mut self,
        title: String,
        url: String,
        run_at_ms: u64,
        kind: String,
    ) -> u64 {
        let id = self.next_reservation_id;
        self.next_reservation_id += 1;
        self.reservations.push(ScheduledReservation {
            id,
            title,
            url,
            run_at_ms,
            kind,
            status: "予約中".to_string(),
        });
        id
    }

    pub fn update_reservation_status(&mut self, id: u64, status: &str) {
        if let Some(reservation) = self
            .reservations
            .iter_mut()
            .find(|reservation| reservation.id == id)
        {
            reservation.status = status.to_string();
        }
    }

    pub fn reservations(&self) -> Vec<ScheduledReservation> {
        self.reservations.clone()
    }

    fn push_output(&mut self, line: String) {
        let id = self.next_output_id;
        self.next_output_id += 1;
        self.outputs.push(ProcessOutput { id, line });
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

async fn push_process_output(
    command_manager: &Arc<Mutex<CommandManager>>,
    window: Option<Window>,
    line: String,
) {
    let mut manager = command_manager.lock().await;
    manager.push_output(line.clone());
    drop(manager);
    if let Some(window) = window {
        let _ = window.emit("process-output", line);
    }
}

async fn finish_process(
    command_manager: &Arc<Mutex<CommandManager>>,
    window: Option<Window>,
    message: &str,
) {
    {
        let mut manager = command_manager.lock().await;
        manager.running = false;
        manager.pid = None;
    }
    if let Some(window) = window {
        let _ = window.emit("process-exit", message);
    }
}

async fn process_lines<R>(
    mut reader: R,
    command_manager: Arc<Mutex<CommandManager>>,
    window: Option<Window>,
    mut stop_rx: broadcast::Receiver<()>,
) where
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
                                push_process_output(&command_manager, window.clone(), line).await;
                                buffer.clear();
                            } else {
                                buffer.push(byte);
                                if buffer.len() > MAX_LINE_LENGTH {
                                    let line = decode_buffer(&buffer);
                                    push_process_output(&command_manager, window.clone(), line).await;
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
        push_process_output(&command_manager, window, line).await;
    }
}
