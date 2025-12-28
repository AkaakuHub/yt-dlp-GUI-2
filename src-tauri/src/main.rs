#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use encoding_rs;
use open as openPath;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
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
use tokio::fs as TokioFs;

mod config;
use config::AppState;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(any(windows, target_os = "macos"))]
use window_shadows::set_shadow;

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

#[derive(Serialize, Deserialize, Clone)]
struct DownloadProgress {
    tool_name: String,
    progress: f64,
    status: String,
}

fn get_format_command(kind: i32) -> Result<String, String> {
    // kindの値に応じてビデオIDのリストを選択
    let video_ids_str = match kind {
        3 => "616/270/137/614/248/399",
        4 => "232/609/247/136/398",
        5 => "231/606/244/135/397",
        6 => "230/605/243/134/396",
        // その他は特にから文字列を返す
        _ => "",
    };
    // video_ids_strを'/'で分割し、各IDに音声オプションを結合してから、再度'/'で連結する
    let format_option = video_ids_str
        .split('/')
        .map(|id| format!("{}+bestaudio", id))
        .collect::<Vec<String>>()
        .join("/");

    Ok(format_option)
}

#[tauri::command]
async fn run_command(
    command_manager: State<'_, Arc<Mutex<CommandManager>>>,
    window: tauri::Window,
    param: RunCommandParam,
    app_state: State<'_, AppState>,
) -> Result<u32, String> {
    let settings = app_state.settings.lock().await;

    let mut manager = command_manager.lock().await;
    let yt_dlp_path = if settings.use_bundle_tools {
        let paths = get_bundle_tool_paths().map_err(|e| format!("バンドル版ツールの取得に失敗しました: {}", e))?;
        let path = paths.get(0).cloned().unwrap_or_default();
        if path.trim().is_empty() {
            return Err("バンドル版yt-dlpが見つかりません。ツールをダウンロードしてください。".into());
        }
        path
    } else {
        if settings.yt_dlp_path.trim().is_empty() {
            return Err("yt-dlpのパスが設定されていません。設定でパスを指定してください。".into());
        }
        settings.yt_dlp_path.clone()
    };

    let url = param.url.unwrap_or("not_set".to_string());
    let codec_id = param.codec_id.unwrap_or("not_set".to_string());
    let subtitle_lang = param.subtitle_lang.unwrap_or("not_set".to_string());
    let arbitrary_code = param.arbitrary_code.unwrap_or("not_set".to_string());
    let is_cookie = param.is_cookie;

    let browser = format!("{}", settings.browser);
    let save_directory = format!("{}/%(title)s.%(ext)s", settings.save_dir);

    let mut args: Vec<&str> = Vec::new();

    let specific_command = get_format_command(param.kind)?;

    match param.kind {
        1 => {
            args.push(&url);
            args.push("-o");
            args.push(&save_directory);
            args.push("-f");
            args.push("bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best");
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
        3..=6 => {
            args.push(&url);
            args.push("-o");
            args.push(&save_directory);
            args.push("-f");
            args.push(&specific_command);
            args.push("--no-mtime");
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
            args.push(&url);
            args.push("-o");
            args.push(&save_directory);
            args.push("--write-thumbnail");
            args.push("--skip-download");
            args.push("--no-mtime");
        }
        12 => {
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
        13 => {
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

    args.push("--remote-components");
    args.push("ejs:github");

    return manager
        .start_command(command_manager.inner().clone(), args, window, &yt_dlp_path)
        .await;
}

// 文字のデコードを行う関数
// macOSとLinuxではUTF-8を優先、WindowsではShift_JISを優先
fn decode_buffer(buffer: &[u8]) -> String {
    #[cfg(any(target_os = "linux", target_os = "macos"))]
    {
        // Try UTF-8 first
        match std::str::from_utf8(buffer) {
            Ok(s) => return s.to_string(),
            Err(_) => {
                // If UTF-8 fails, try Shift_JIS as fallback
                let (decoded, _, has_errors) = encoding_rs::SHIFT_JIS.decode(buffer);
                if !has_errors {
                    return decoded.to_string();
                }
                // If both fail, use lossy UTF-8 conversion
                return String::from_utf8_lossy(buffer).to_string();
            }
        }
    }

    #[cfg(target_os = "windows")]
    {
        // Try Shift_JIS first on Windows
        let (decoded, _, has_errors) = encoding_rs::SHIFT_JIS.decode(buffer);
        if !has_errors {
            return decoded.to_string();
        }

        // If Shift_JIS fails, try UTF-8
        match std::str::from_utf8(buffer) {
            Ok(s) => return s.to_string(),
            Err(_) => {
                // If both fail, use lossy UTF-8 conversion
                return String::from_utf8_lossy(buffer).to_string();
            }
        }
    }
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
    const MAX_LINE_LENGTH: usize = 8192; // Maximum line length to prevent memory issues

    loop {
        select! {
            result = reader.read(&mut temp_buffer) => {
                match result {
                    Ok(0) => break, // EOF
                    Ok(n) => {
                        for &byte in &temp_buffer[..n] {
                            if byte == b'\r' || byte == b'\n' {
                                // 改行でemit
                                let line = decode_buffer(&buffer);
                                window.emit("process-output", line).unwrap();
                                buffer.clear();
                            } else {
                                buffer.push(byte);
                                // Prevent buffer from growing too large
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

    // 最後に残ったバッファの内容があればemit
    if !buffer.is_empty() {
        let line = decode_buffer(&buffer);
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
fn get_bundle_tool_paths() -> Result<Vec<String>, String> {
    let mut path = std::env::current_exe()
        .map_err(|e| format!("Failed to get current exe path: {}", e))?;
    path.pop(); // exeファイル名を削除
    let binaries_dir = path.join("binaries");

    if !binaries_dir.exists() {
        return Ok(vec!["".to_string(), "".to_string()]);
    }

    // yt-dlpを検索
    let yt_dlp_path = std::fs::read_dir(&binaries_dir)
        .map_err(|e| format!("Failed to read binaries directory: {}", e))?
        .filter_map(|entry| entry.ok())
        .find(|entry| {
            let file_name = entry.file_name();
            let file_name_str = file_name.to_string_lossy();
            file_name_str.starts_with("yt-dlp") &&
            (file_name_str.ends_with(".exe") || !file_name_str.contains('.'))
        })
        .map(|entry| entry.path().to_string_lossy().to_string())
        .unwrap_or_default();

    // ffmpegを検索（サブディレクトリも含める）
    let ffmpeg_path = find_ffmpeg_recursive(&binaries_dir)?;

    Ok(vec![yt_dlp_path, ffmpeg_path])
}

fn find_ffmpeg_recursive(dir: &std::path::Path) -> Result<String, String> {
    if !dir.exists() {
        return Ok("".to_string());
    }

    let entries = std::fs::read_dir(dir)
        .map_err(|e| format!("Failed to read directory: {}", e))?;

    for entry in entries.flatten() {
        let path = entry.path();
        let file_name = path.file_name().unwrap_or_default();
        let file_name_str = file_name.to_string_lossy();

        if path.is_dir() {
            // サブディレクトリを再帰的に探索
            if let Ok(found) = find_ffmpeg_recursive(&path) {
                if !found.is_empty() {
                    return Ok(found);
                }
            }
        } else if file_name_str.starts_with("ffmpeg") &&
                 (file_name_str.ends_with(".exe") || !file_name_str.contains('.')) {
            return Ok(path.to_string_lossy().to_string());
        }
    }

    Ok("".to_string())
}

#[tauri::command]
async fn is_program_available(program_name: String, custom_path: Option<String>) -> Result<String, String> {
    let command_path = if let Some(path) = custom_path {
        if path.trim().is_empty() {
            return Err(format!(
                "{} bundle path is empty. Tools may not be downloaded yet.",
                program_name
            ));
        }
        path
    } else {
        // パスが指定されていない場合はプログラム名をそのまま使用
        program_name.clone()
    };

    let command_arg = match program_name.as_str() {
        "yt-dlp" => "--version",
        "ffmpeg" => "-version",
        _ => return Err(format!("Program {} is not supported", program_name)),
    };

    // ファイルの存在チェック
    let file_exists = Path::new(&command_path).exists();
    if !file_exists {
        return Err(format!(
            "{} not found at path: {}",
            program_name, command_path
        ));
    }

    #[cfg(target_os = "windows")]
    let output = Command::new(&command_path)
        .arg(command_arg)
        .creation_flags(0x08000000)
        .output();

    #[cfg(any(target_os = "linux", target_os = "macos"))]
    let output = Command::new(&command_path)
        .arg(command_arg)
        .env("LC_ALL", "en_US.UTF-8")
        .env("LANG", "en_US.UTF-8")
        .output();

    match output {
        Ok(output) => {
            if output.status.success() {
                Ok(format!("{} found at: {}", program_name, command_path))
            } else {
                Err(format!(
                    "{} is not working at path: {} (exit code: {})",
                    program_name, command_path, output.status.code().unwrap_or(-1)
                ))
            }
        }
        Err(err) => Err(format!(
            "Failed to run {} at path {}: {}",
            program_name, command_path, err
        )),
    }
}

#[tauri::command]
async fn open_url_and_exit(window: Window, url: String) {
    if open(&window.shell_scope(), url, None).is_ok() {
        std::process::exit(0x0);
    }
}

#[tauri::command]
async fn exit_app() {
    std::process::exit(0x0);
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

#[tauri::command]
fn get_os_type() -> String {
    std::env::consts::OS.to_string()
}

#[tauri::command]
async fn download_bundle_tools(window: tauri::Window) -> Result<String, String> {
    let os_type = std::env::consts::OS;
    let arch = std::env::consts::ARCH;

    // binariesフォルダを作成
    let exe_path = std::env::current_exe().unwrap_or_else(|_| PathBuf::from("."));
    let binaries_dir = exe_path.parent().unwrap().join("binaries");

    if !binaries_dir.exists() {
        TokioFs::create_dir_all(&binaries_dir).await
            .map_err(|e| format!("Failed to create binaries directory: {}", e))?;
    }

    // yt-dlpのダウンロード
    window.emit("download-progress", DownloadProgress {
        tool_name: "yt-dlp".to_string(),
        progress: 0.0,
        status: "Getting latest version...".to_string(),
    }).unwrap();

    let yt_dlp_url = get_yt_dlp_download_url(&os_type, &arch)?;
    let yt_dlp_path = binaries_dir.join(if cfg!(target_os = "windows") { "yt-dlp.exe" } else { "yt-dlp" });

    download_file_with_progress(&yt_dlp_url, &yt_dlp_path, &window, "yt-dlp").await?;

    // FFmpegのダウンロード
    window.emit("download-progress", DownloadProgress {
        tool_name: "ffmpeg".to_string(),
        progress: 0.0,
        status: "Getting latest version...".to_string(),
    }).unwrap();

    let ffmpeg_url = get_ffmpeg_download_url(&os_type, &arch)?;
    let ffmpeg_filename = if cfg!(target_os = "windows") {
        if cfg!(target_arch = "aarch64") {
            "ffmpeg-master-latest-winarm64-gpl.zip"
        } else {
            "ffmpeg-master-latest-win64-gpl.zip"
        }
    } else if cfg!(target_os = "macos") {
        if cfg!(target_arch = "aarch64") {
            "ffmpeg-master-latest-macosarm64-gpl.tar.xz"
        } else {
            "ffmpeg-master-latest-macos64-gpl.tar.xz"
        }
    } else {
        if cfg!(target_arch = "aarch64") {
            "ffmpeg-master-latest-linuxarm64-gpl.tar.xz"
        } else {
            "ffmpeg-master-latest-linux64-gpl.tar.xz"
        }
    };

    let ffmpeg_archive_path = binaries_dir.join(ffmpeg_filename);
    download_file_with_progress(&ffmpeg_url, &ffmpeg_archive_path, &window, "ffmpeg").await?;

    // FFmpegを展開（Windowsの場合はzipを展開、Unix系はtar.xzを展開）
    if cfg!(target_os = "windows") {
        extract_zip(&ffmpeg_archive_path, &binaries_dir)?;
    } else {
        extract_tar_xz(&ffmpeg_archive_path, &binaries_dir).await?;
    }

    // アーカイブファイルを削除
    TokioFs::remove_file(ffmpeg_archive_path).await.ok();

    Ok("All tools downloaded successfully".to_string())
}

fn get_yt_dlp_download_url(os: &str, arch: &str) -> Result<String, String> {
    match (os, arch) {
        ("windows", "x86_64") => Ok("https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe".to_string()),
        ("windows", "aarch64") => Ok("https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_arm64.exe".to_string()),
        ("windows", "x86") => Ok("https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_x86.exe".to_string()),
        ("linux", "x86_64") => Ok("https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux".to_string()),
        ("linux", "aarch64") => Ok("https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux_aarch64".to_string()),
        ("linux", "arm") => Ok("https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux_armv7l".to_string()),
        ("macos", "x86_64") => Ok("https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos".to_string()),
        ("macos", "aarch64") => Ok("https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos".to_string()),
        _ => Err(format!("Unsupported platform: {} {}", os, arch))
    }
}

fn get_ffmpeg_download_url(os: &str, arch: &str) -> Result<String, String> {
    match (os, arch) {
        ("windows", "x86_64") => Ok("https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip".to_string()),
        ("windows", "aarch64") => Ok("https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-winarm64-gpl.zip".to_string()),
        ("linux", "x86_64") => Ok("https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linux64-gpl.tar.xz".to_string()),
        ("linux", "aarch64") => Ok("https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linuxarm64-gpl.tar.xz".to_string()),
        ("macos", "x86_64") => Ok("https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-macos64-gpl.tar.xz".to_string()),
        ("macos", "aarch64") => Ok("https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-macosarm64-gpl.tar.xz".to_string()),
        _ => Err(format!("Unsupported platform: {} {}", os, arch))
    }
}

async fn download_file_with_progress(url: &str, path: &Path, window: &tauri::Window, tool_name: &str) -> Result<(), String> {
    let response = reqwest::get(url).await
        .map_err(|e| format!("Failed to download {}: {}", tool_name, e))?;

    let total_size = response.content_length().unwrap_or(0);
    let mut downloaded = 0u64;
    let mut stream = response.bytes_stream();

    let mut file = TokioFs::File::create(path).await
        .map_err(|e| format!("Failed to create file: {}", e))?;

    use futures_util::StreamExt;

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Failed to read chunk: {}", e))?;
        file.write_all(&chunk).await
            .map_err(|e| format!("Failed to write chunk: {}", e))?;

        downloaded += chunk.len() as u64;
        let progress = if total_size > 0 {
            (downloaded as f64 / total_size as f64) * 100.0
        } else {
            0.0
        };

        window.emit("download-progress", DownloadProgress {
            tool_name: tool_name.to_string(),
            progress,
            status: format!("Downloading... {:.1}%", progress),
        }).unwrap();
    }

    // ファイルに実行権限を付与（Unix系）
    #[cfg(any(target_os = "linux", target_os = "macos"))]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = std::fs::metadata(path).unwrap().permissions();
        perms.set_mode(0o755);
        std::fs::set_permissions(path, perms).unwrap();
    }

    Ok(())
}

fn extract_zip(archive_path: &Path, extract_dir: &Path) -> Result<(), String> {
    use zip::ZipArchive;

    let file = std::fs::File::open(archive_path)
        .map_err(|e| format!("Failed to open zip file: {}", e))?;

    let mut archive = ZipArchive::new(file)
        .map_err(|e| format!("Failed to read zip archive: {}", e))?;

    for i in 0..archive.len() {
        let mut file = archive.by_index(i)
            .map_err(|e| format!("Failed to get file from zip: {}", e))?;

        let outpath = extract_dir.join(file.name());

        if file.name().ends_with('/') {
            std::fs::create_dir_all(&outpath)
                .map_err(|e| format!("Failed to create directory: {}", e))?;
        } else {
            if let Some(parent) = outpath.parent() {
                std::fs::create_dir_all(parent)
                    .map_err(|e| format!("Failed to create parent directory: {}", e))?;
            }

            let mut outfile = std::fs::File::create(&outpath)
                .map_err(|e| format!("Failed to create output file: {}", e))?;

            std::io::copy(&mut file, &mut outfile)
                .map_err(|e| format!("Failed to extract file: {}", e))?;
        }
    }

    Ok(())
}

async fn extract_tar_xz(archive_path: &Path, extract_dir: &Path) -> Result<(), String> {
    let output = TokioCommand::new("tar")
        .arg("-xf")
        .arg(archive_path)
        .arg("-C")
        .arg(extract_dir)
        .output()
        .await
        .map_err(|e| format!("Failed to extract tar.xz: {}", e))?;

    if !output.status.success() {
        return Err(format!("tar extraction failed: {}", String::from_utf8_lossy(&output.stderr)));
    }

    Ok(())
}

fn main() {
    let _ = fix_path_env::fix();
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
            exit_app,
            toggle_server,
            get_sorted_directory_contents,
            open_file,
            get_current_version,
            get_os_type,
            download_bundle_tools,
            config::commands::set_save_dir,
            config::commands::set_browser,
            config::commands::set_server_port,
            config::commands::set_is_send_notification,
            config::commands::set_index,
            config::commands::set_is_server_enabled,
            config::commands::set_theme_mode,
            config::commands::get_settings,
            config::commands::set_use_bundle_tools,
            config::commands::set_yt_dlp_path,
            config::commands::set_ffmpeg_path,
            get_bundle_tool_paths
        ])
        .plugin(tauri_plugin_drag::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
