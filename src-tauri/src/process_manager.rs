use std::collections::{HashMap, VecDeque};
use std::process::Stdio;
use std::sync::Arc;

use futures_util::future::BoxFuture;
use serde::Serialize;
use tauri::{Emitter, Window};
use tokio::io::AsyncReadExt;
use tokio::io::BufReader as TokioBufReader;
use tokio::process::Command as TokioCommand;
use tokio::select;
use tokio::sync::broadcast;
use tokio::sync::Mutex;
use tokio::task;

pub struct CommandManager {
    queued_jobs: VecDeque<QueuedCommand>,
    running_jobs: HashMap<u64, RunningCommand>,
    next_job_id: u64,
    max_parallel: usize,
    outputs: Vec<ProcessOutput>,
    next_output_id: u64,
    reservations: Vec<ScheduledReservation>,
    next_reservation_id: u64,
}

#[derive(Clone)]
pub struct QueuedCommand {
    pub id: u64,
    pub args: Vec<String>,
    pub yt_dlp_path: String,
}

struct RunningCommand {
    pid: u32,
    stop_signal: broadcast::Sender<()>,
}

#[derive(Clone)]
pub struct ProcessOutput {
    pub id: u64,
    pub line: String,
}

pub struct ProcessSnapshot {
    pub running: bool,
    pub outputs: Vec<ProcessOutput>,
    pub queue: QueueSnapshot,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QueueSnapshot {
    pub pending: usize,
    pub running: usize,
    pub max_parallel: usize,
    pub running_pids: Vec<u32>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QueueStartResponse {
    pub queue_id: u64,
    pub total: usize,
    pub started: usize,
    pub running_pids: Vec<u32>,
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
            queued_jobs: VecDeque::new(),
            running_jobs: HashMap::new(),
            next_job_id: 1,
            max_parallel: 1,
            outputs: Vec::new(),
            next_output_id: 0,
            reservations: Vec::new(),
            next_reservation_id: 1,
        }
    }

    pub async fn enqueue_commands(
        command_manager: Arc<Mutex<CommandManager>>,
        commands: Vec<(Vec<String>, String)>,
        window: Option<tauri::Window>,
        max_parallel: usize,
    ) -> Result<QueueStartResponse, String> {
        let total = commands.len();
        if total == 0 {
            return Err("キューが空です".to_string());
        }

        let mut manager = command_manager.lock().await;
        if !manager.running_jobs.is_empty() || !manager.queued_jobs.is_empty() {
            return Err("キューは既に実行中です".to_string());
        }
        manager.outputs.clear();
        manager.next_output_id = 0;
        manager.queued_jobs.clear();
        manager.running_jobs.clear();
        manager.next_job_id = 1;
        manager.max_parallel = max_parallel.max(1);
        let queue_id = manager.next_job_id;
        for (args, yt_dlp_path) in commands {
            let id = manager.next_job_id;
            manager.next_job_id += 1;
            manager.queued_jobs.push_back(QueuedCommand {
                id,
                args,
                yt_dlp_path,
            });
        }
        let startable_count = manager.available_worker_count();
        drop(manager);

        start_next_commands(command_manager.clone(), window, startable_count).await?;
        let running_pids = command_manager.lock().await.queue_snapshot().running_pids;
        Ok(QueueStartResponse {
            queue_id,
            total,
            started: startable_count.min(total),
            running_pids,
        })
    }

    pub async fn stop_all_commands(&mut self, window: Option<tauri::Window>) -> Result<(), String> {
        if self.running_jobs.is_empty() && self.queued_jobs.is_empty() {
            return Err("Command is not running.".to_string());
        }
        self.queued_jobs.clear();
        for running_job in self.running_jobs.values() {
            let _ = running_job.stop_signal.send(());
        }
        self.running_jobs.clear();
        self.push_output("プロセスを停止しました\n".to_string());
        if let Some(window) = window {
            let _ = window.emit("process-output", "プロセスを停止しました\n");
            let _ = window.emit("process-exit", "プロセスを停止しました");
            let _ = window.emit("process-queue", self.queue_snapshot());
        }
        Ok(())
    }

    pub fn snapshot_since(&self, since: u64) -> ProcessSnapshot {
        ProcessSnapshot {
            running: !self.running_jobs.is_empty() || !self.queued_jobs.is_empty(),
            outputs: self
                .outputs
                .iter()
                .filter(|output| output.id >= since)
                .cloned()
                .collect(),
            queue: self.queue_snapshot(),
        }
    }

    pub fn queue_snapshot(&self) -> QueueSnapshot {
        let mut running_pids = self
            .running_jobs
            .values()
            .map(|job| job.pid)
            .collect::<Vec<_>>();
        running_pids.sort_unstable();
        QueueSnapshot {
            pending: self.queued_jobs.len(),
            running: self.running_jobs.len(),
            max_parallel: self.max_parallel,
            running_pids,
        }
    }

    fn available_worker_count(&self) -> usize {
        self.max_parallel.saturating_sub(self.running_jobs.len())
    }

    fn take_next_command(&mut self) -> Option<QueuedCommand> {
        if self.available_worker_count() == 0 {
            return None;
        }
        self.queued_jobs.pop_front()
    }

    fn register_running_job(&mut self, id: u64, pid: u32, stop_signal: broadcast::Sender<()>) {
        self.running_jobs
            .insert(id, RunningCommand { pid, stop_signal });
    }

    fn finish_running_job(&mut self, id: u64) {
        self.running_jobs.remove(&id);
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

async fn start_next_commands(
    command_manager: Arc<Mutex<CommandManager>>,
    window: Option<Window>,
    count: usize,
) -> Result<(), String> {
    for _ in 0..count {
        let command = {
            let mut manager = command_manager.lock().await;
            manager.take_next_command()
        };
        let Some(command) = command else {
            break;
        };
        start_command_task(command_manager.clone(), command, window.clone()).await?;
    }
    Ok(())
}

fn start_command_task(
    command_manager: Arc<Mutex<CommandManager>>,
    command: QueuedCommand,
    window: Option<Window>,
) -> BoxFuture<'static, Result<(), String>> {
    Box::pin(async move {
        let (tx, _) = broadcast::channel(1);

        #[cfg(target_os = "windows")]
        let mut child = TokioCommand::new(&command.yt_dlp_path)
            .args(&command.args)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .creation_flags(0x08000000)
            .spawn()
            .map_err(|e| format!("コマンドの実行に失敗しました: {}", e))?;

        #[cfg(any(target_os = "linux", target_os = "macos"))]
        let mut child = TokioCommand::new(&command.yt_dlp_path)
            .args(&command.args)
            .env("LC_ALL", "en_US.UTF-8")
            .env("LANG", "en_US.UTF-8")
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("コマンドの実行に失敗しました: {}", e))?;

        let pid = child.id().ok_or("プロセスIDの取得に失敗しました")?;

        let command_line = format!(
            "[job:{} pid:{}] {}>yt-dlp {}\n",
            command.id,
            pid,
            std::env::current_dir().unwrap().to_string_lossy(),
            command.args.join(" ")
        );
        push_process_output(&command_manager, window.clone(), command_line).await;
        command_manager
            .lock()
            .await
            .register_running_job(command.id, pid, tx.clone());

        emit_queue_snapshot(&command_manager, window.clone()).await;

        let stdout = child.stdout.take().ok_or("標準出力の取得に失敗しました")?;
        let stderr = child
            .stderr
            .take()
            .ok_or("標準エラーの取得に失敗しました")?;

        let job_id = command.id;
        let tx_clone = tx.clone();
        let command_manager_clone = Arc::clone(&command_manager);
        let window_clone = window.clone();

        task::spawn(async move {
            let stdout_reader = TokioBufReader::new(stdout);
            let stderr_reader = TokioBufReader::new(stderr);

            let stop_rx1 = tx.subscribe();
            let stop_rx2 = tx.subscribe();

            let command_manager_stdout = Arc::clone(&command_manager_clone);
            let command_manager_stderr = Arc::clone(&command_manager_clone);
            let stdout_window = window_clone.clone();
            let stderr_window = window_clone.clone();

            let stdout_task = tokio::spawn(async move {
                process_lines(
                    stdout_reader,
                    command_manager_stdout,
                    stdout_window,
                    stop_rx1,
                )
                .await;
            });

            let stderr_task = tokio::spawn(async move {
                process_lines(
                    stderr_reader,
                    command_manager_stderr,
                    stderr_window,
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
                    finish_command(&command_manager_clone, window_clone.clone(), job_id, "プロセス終了").await;
                }
                status = child.wait() => {
                    match status {
                        Ok(_) => {
                            push_process_output(&command_manager_clone, window_clone.clone(), "\n".to_string()).await;
                            finish_command(&command_manager_clone, window_clone.clone(), job_id, "プロセス終了").await;
                        }
                        Err(e) => {
                            finish_command(
                                &command_manager_clone,
                                window_clone.clone(),
                                job_id,
                                &format!("プロセス終了エラー: {}", e),
                            ).await;
                        }
                    }
                }
            }

            let _ = stdout_task.await;
            let _ = stderr_task.await;
        });

        Ok(())
    })
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

async fn finish_command(
    command_manager: &Arc<Mutex<CommandManager>>,
    window: Option<Window>,
    job_id: u64,
    message: &str,
) {
    let startable_count = {
        let mut manager = command_manager.lock().await;
        manager.finish_running_job(job_id);
        manager.available_worker_count()
    };
    let _ = start_next_commands(command_manager.clone(), window.clone(), startable_count).await;
    emit_queue_snapshot(command_manager, window.clone()).await;
    let is_queue_finished = {
        let manager = command_manager.lock().await;
        manager.running_jobs.is_empty() && manager.queued_jobs.is_empty()
    };
    if !is_queue_finished {
        return;
    }
    {
        let mut manager = command_manager.lock().await;
        manager.push_output(format!("{}\n", message));
    }
    if let Some(window) = window {
        let _ = window.emit("process-exit", message);
    }
}

async fn emit_queue_snapshot(command_manager: &Arc<Mutex<CommandManager>>, window: Option<Window>) {
    if let Some(window) = window {
        let snapshot = command_manager.lock().await.queue_snapshot();
        let _ = window.emit("process-queue", snapshot);
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
