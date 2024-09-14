#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use encoding_rs;
use open as openPath;
use serde::{Deserialize, Serialize};
use std::fs;
use std::os::windows::process::CommandExt;
use std::path::Path;
use std::process::Command;
use std::process::Stdio;
use std::sync::Arc;
use tauri::api::shell::open;
use tauri::Manager;
use tauri::State;
use tauri::Window;
use tokio::io::AsyncReadExt;
use tokio::io::AsyncWriteExt;
use tokio::io::BufReader as TokioBufReader;
use tokio::net::{TcpListener, TcpStream};
use tokio::process::Command as TokioCommand;
use tokio::select;
use tokio::sync::broadcast;
use tokio::sync::mpsc::{channel, Sender};
use tokio::sync::Mutex;
use tokio::task;
use window_shadows::set_shadow;

mod config;
use config::AppState;

pub struct CommandManager {
    command_task: Option<task::JoinHandle<()>>,
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
        args: Vec<&str>,
        window: tauri::Window,
    ) -> Result<u32, String> {
        if self.command_task.is_some() {
            return Err("プロセスは既に実行中です".into());
        }

        let (tx, _) = broadcast::channel(1);
        self.stop_signal = Some(tx.clone());

        #[cfg(target_os = "windows")]
        let mut child = TokioCommand::new("yt-dlp")
            .args(&args)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .creation_flags(0x08000000)
            .spawn()
            .map_err(|e| format!("コマンドの実行に失敗しました: {}", e))?;

        #[cfg(any(target_os = "linux", target_os = "macos"))]
        let mut child = TokioCommand::new("yt-dlp")
            .args(&args)
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

        // let stop_signal = self
        //     .stop_signal
        //     .clone()
        //     .ok_or("Stop signal not initialized")?;

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
                    // println!("Command stop signal received");
                    if let Err(e) = child.kill().await {
                        eprintln!("Failed to kill process: {}", e);
                    }
                    let _ = child.wait().await;
                    window_clone2.emit("process-exit", "プロセス終了").unwrap();

                    return ;
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

#[derive(Deserialize)]
struct RunCommandParam {
    url: Option<String>,
    kind: i32,
    codec_id: Option<String>,
    subtitle_lang: Option<String>,
    is_cookie: bool,
    arbitrary_code: Option<String>,
}
#[tauri::command]
async fn run_command(
    command_manager: State<'_, Arc<Mutex<CommandManager>>>,
    window: tauri::Window,
    param: RunCommandParam,
) -> Result<u32, String> {
    let app_state = AppState::new();
    let settings = app_state.settings.lock().await;

    let mut manager = command_manager.lock().await;

    let url = param.url.unwrap_or("not_set".to_string());
    let codec_id = param.codec_id.unwrap_or("not_set".to_string());
    let subtitle_lang = param.subtitle_lang.unwrap_or("not_set".to_string());
    let arbitrary_code = param.arbitrary_code.unwrap_or("not_set".to_string());
    let is_cookie = param.is_cookie;

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
            if subtitle_lang == "not_set" {
                return Err("字幕言語が指定されていません".into());
            }
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
            if codec_id == "not_set" {
                return Err("コーデックIDが指定されていません".into());
            }
            args.push(&url);
            args.push("-o");
            args.push(&save_directory);
            args.push("-f");
            args.push(&codec_id);
            args.push("--no-mtime");
        }
        9 => {
            args.push(&url);
            args.push("-o");
            args.push(&save_directory);
            args.push("--live-from-start");
            args.push("-f");
            args.push("bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best");
            args.push("--no-mtime");
        }
        10 => {
            args.push(&url);
            args.push("-o");
            args.push(&save_directory);
            args.push("-f");
            args.push("bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best");
            args.push("--no-mtime");
        }
        11 => {
            if arbitrary_code == "not_set" {
                return Err("任意のコードが指定されていません".into());
            }
            args.push(&arbitrary_code);
        }
        _ => {
            return Err("不正な種類です".into());
        }
    }

    if is_cookie {
        args.push("--cookies-from-browser");
        args.push(&browser);
    }

    return manager
        .start_command(command_manager.inner().clone(), args, window)
        .await;
}
async fn process_lines<R>(
    mut reader: R,
    window: tauri::Window,
    mut stop_rx: broadcast::Receiver<()>,
) where
    R: AsyncReadExt + Unpin,
{
    let mut buffer = Vec::new();
    let mut temp_buffer = [0u8; 1024];

    loop {
        select! {
            result = reader.read(&mut temp_buffer) => {
                match result {
                    Ok(0) => break, // EOF
                    Ok(n) => {
                        for &byte in &temp_buffer[..n] {
                            if byte == b'\r' || byte == b'\n' {
                                // 改行でemit
                                let (decoded, _, decode_error) = encoding_rs::SHIFT_JIS.decode(&buffer);
                                if decode_error {
                                    eprintln!("デコードエラー: {}", String::from_utf8_lossy(&buffer));
                                }
                                let line = decoded.to_string();
                                window.emit("process-output", line).unwrap();
                                buffer.clear();
                            } else {
                                buffer.push(byte);
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

    // 最後に残ったバッファの内容があればemit
    if !buffer.is_empty() {
        let (decoded, _, decode_error) = encoding_rs::SHIFT_JIS.decode(&buffer);
        if decode_error {
            eprintln!("デコードエラー: {}", String::from_utf8_lossy(&buffer));
        }
        let line = decoded.to_string();
        window.emit("process-output", line).unwrap();
    }
}

#[tauri::command]
async fn stop_command(
    command_manager: State<'_, Arc<Mutex<CommandManager>>>,
    window: tauri::Window,
) -> Result<(), String> {
    let mut manager = command_manager.lock().await;
    manager.stop_command(window).await
}

#[tauri::command]
async fn is_program_available(program_name: String) -> Result<String, String> {
    let command_arg = match program_name.as_str() {
        "yt-dlp" => "--version",
        "ffmpeg" => "-version",
        _ => return Err(format!("Program {} is not supported", program_name)),
    };

    #[cfg(target_os = "windows")]
    let output = Command::new(program_name.clone())
        .arg(command_arg)
        .creation_flags(0x08000000)
        .output();

    #[cfg(any(target_os = "linux", target_os = "macos"))]
    let output = Command::new(program_name.clone()).arg(command_arg).output();

    match output {
        Ok(output) => {
            if output.status.success() {
                Ok(String::from_utf8_lossy(&output.stdout).to_string())
            } else {
                Err(format!(
                    "{} is not installed or not found in the system path.",
                    program_name
                ))
            }
        }
        Err(err) => Err(format!("Failed to run command: {}", err)),
    }
}

#[tauri::command]
async fn open_url_and_exit(window: Window, url: String) {
    if open(&window.shell_scope(), url, None).is_ok() {
        std::process::exit(0x0);
    }
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

struct ServerManager {
    server_task: Option<task::JoinHandle<()>>,
    stop_signal: Option<Sender<()>>,
}

impl ServerManager {
    fn new() -> Self {
        Self {
            server_task: None,
            stop_signal: None,
        }
    }

    async fn start_server(&mut self, port: u16, window: Window) {
        let (tx, mut rx) = channel(1);
        self.stop_signal = Some(tx);

        self.server_task = Some(task::spawn(async move {
            let port = port;
            let listener = loop {
                match TcpListener::bind(format!("127.0.0.1:{}", port)).await {
                    Ok(listener) => break listener,
                    Err(_) => {
                        window.emit("start-server-output", "失敗").unwrap();
                        return;
                    }
                }
            };
            println!("Server started at {}", port);
            window.emit("start-server-output", "成功").unwrap();

            loop {
                tokio::select! {
                    _ = rx.recv() => {
                        println!("Server stopped");
                        break;
                    }

                    Ok((socket, _)) = listener.accept() => {
                        tokio::spawn(handle_client(socket, window.clone()));
                    }
                }
            }
        }));
    }

    async fn stop_server(&mut self) {
        if let Some(stop_signal) = self.stop_signal.take() {
            if let Err(err) = stop_signal.send(()).await {
                eprintln!("Failed to send stop signal: {}", err);
                return;
            }
        } else {
            return;
        }

        if let Some(handle) = self.server_task.take() {
            if let Err(err) = handle.await {
                eprintln!("Failed to stop server task: {}", err);
            }
        }
    }
}

impl Drop for ServerManager {
    fn drop(&mut self) {
        let stop_signal = self.stop_signal.take();
        if let Some(stop_signal) = stop_signal {
            tokio::spawn(async move {
                stop_signal.send(()).await.unwrap();
            });
        }
    }
}

async fn handle_client(mut socket: TcpStream, window: Window) {
    let (reader, mut writer) = socket.split();
    let mut buf_reader = TokioBufReader::new(reader);
    let mut buffer = vec![0; 10240];

    // 非同期でデータを読み取る
    match buf_reader.read(&mut buffer).await {
        Ok(n) if n > 0 => {
            let request = String::from_utf8_lossy(&buffer[..n]);

            if request.starts_with("OPTIONS") {
                let response = "HTTP/1.1 204 No Content\r\n\
                                Access-Control-Allow-Origin: *\r\n\
                                Access-Control-Allow-Methods: POST, GET, OPTIONS\r\n\
                                Access-Control-Allow-Headers: Content-Type\r\n\
                                \r\n";

                if let Err(e) = writer.write_all(response.as_bytes()).await {
                    eprintln!("Failed to write response: {}", e);
                }
            } else if request.starts_with("POST") {
                let body_start = request.find("\r\n\r\n").unwrap_or(0) + 4;
                let body = &request[body_start..];

                window.emit("server-output", body).unwrap();

                // レスポンスを作成
                let response = format!(
                    "HTTP/1.1 200 OK\r\n\
                    Content-Length: {}\r\n\
                    Access-Control-Allow-Origin: *\r\n\
                    Access-Control-Allow-Methods: POST, GET, OPTIONS\r\n\
                    Access-Control-Allow-Headers: Content-Type\r\n\
                    \r\n\
                    {}",
                    body.len(),
                    body
                );

                if let Err(e) = writer.write_all(response.as_bytes()).await {
                    eprintln!("Failed to write response: {}", e);
                }
            } else {
                // その他のリクエストの処理
                let response = "HTTP/1.1 400 Bad Request\r\n\r\n";
                if let Err(e) = writer.write_all(response.as_bytes()).await {
                    eprintln!("Failed to write response: {}", e);
                }
            }
        }
        _ => {}
    }
}

#[tauri::command]
async fn toggle_server(
    enable: bool,
    port: u16,
    window: tauri::Window,
    server_manager: State<'_, Arc<Mutex<ServerManager>>>,
) -> Result<(), String> {
    let mut server_manager = server_manager.lock().await;

    if enable {
        server_manager.start_server(port, window).await;
        Ok(())
    } else {
        server_manager.stop_server().await;
        Ok(())
    }
}

#[derive(Serialize, Deserialize)]
pub struct FileInfo {
    name: String,
    is_dir: bool,
    last_modified: u64,
    file_size: u64,
}

#[tauri::command]
fn get_sorted_directory_contents(path: &str) -> Result<Vec<FileInfo>, String> {
    let path = Path::new(path);
    let mut entries = Vec::new();

    if let Ok(dir_entries) = fs::read_dir(path) {
        for entry in dir_entries {
            if let Ok(entry) = entry {
                let file_name = entry.file_name().to_string_lossy().into_owned();
                let is_dir = entry.file_type().map(|ft| ft.is_dir()).unwrap_or(false);
                let last_modified = entry
                    .metadata()
                    .and_then(|m| m.modified())
                    .map(|t| t.duration_since(std::time::UNIX_EPOCH).unwrap().as_secs())
                    .unwrap_or(0);
                let file_size = entry.metadata().map(|m| m.len()).unwrap_or(0);

                entries.push(FileInfo {
                    name: file_name,
                    is_dir,
                    last_modified,
                    file_size,
                });
            }
        }
    }

    entries.sort_by(|a, b| b.last_modified.cmp(&a.last_modified));
    Ok(entries)
}

#[tauri::command]
fn open_file(path: String) -> Result<(), String> {
    openPath::that(path).map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_current_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

fn main() {
    let app_state = config::AppState::new();
    let command_manager = Arc::new(Mutex::new(CommandManager::new()));
    let server_manager = Arc::new(Mutex::new(ServerManager::new()));

    tauri::Builder::default()
        .setup(|app| {
            let main_window = app.get_window("main").unwrap();
            #[cfg(any(windows, target_os = "macos"))]
            set_shadow(main_window, true).unwrap();
            Ok(())
        })
        .manage(app_state)
        .manage(command_manager)
        .manage(server_manager)
        .invoke_handler(tauri::generate_handler![
            run_command,
            stop_command,
            open_directory,
            is_program_available,
            open_url_and_exit,
            toggle_server,
            get_sorted_directory_contents,
            open_file,
            get_current_version,
            config::commands::set_save_dir,
            config::commands::set_browser,
            config::commands::set_server_port,
            config::commands::set_is_send_notification,
            config::commands::set_index,
            config::commands::set_is_server_enabled,
            config::commands::get_settings
        ])
        .plugin(tauri_plugin_drag::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
