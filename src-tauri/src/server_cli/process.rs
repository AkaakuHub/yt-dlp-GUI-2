use std::{process::Stdio, sync::Arc};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

use tokio::{
    io::{AsyncReadExt, BufReader},
    process::{Child, Command},
    sync::Mutex,
};

use crate::{
    config::Settings,
    download_command::{build_yt_dlp_args, RunCommandParam},
    tools::resolve_tool_paths,
};

#[derive(Clone)]
pub(super) struct SharedDownloadProcess {
    inner: Arc<Mutex<DownloadProcess>>,
}

struct DownloadProcess {
    child: Option<Child>,
    outputs: Vec<ProcessOutput>,
    next_output_id: u64,
    running: bool,
}

#[derive(Clone)]
pub(super) struct ProcessOutput {
    pub(super) id: u64,
    pub(super) line: String,
}

pub(super) struct ProcessSnapshot {
    pub(super) running: bool,
    pub(super) outputs: Vec<ProcessOutput>,
}

impl SharedDownloadProcess {
    pub(super) fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(DownloadProcess {
                child: None,
                outputs: Vec::new(),
                next_output_id: 0,
                running: false,
            })),
        }
    }

    pub(super) async fn start(&self, param: RunCommandParam) -> Result<u32, String> {
        let mut process = self.inner.lock().await;
        if let Some(child) = process.child.as_mut() {
            if child
                .try_wait()
                .map_err(|e| format!("プロセス状態の確認に失敗しました: {}", e))?
                .is_none()
            {
                return Err("プロセスは既に実行中です".to_string());
            }
            process.child = None;
        }

        process.outputs.clear();
        process.next_output_id = 0;

        let settings = Settings::new();
        let (yt_dlp_path, _ffmpeg_path, _deno_path) = resolve_tool_paths(
            settings.use_bundle_tools,
            &settings.yt_dlp_path,
            &settings.ffmpeg_path,
            &settings.deno_path,
        )
        .map_err(|e| format!("ツールパスの解決に失敗しました: {}", e))?;

        if yt_dlp_path.trim().is_empty() {
            return Err("yt-dlpが見つかりません".into());
        }

        let args = build_yt_dlp_args(param, &settings)?;
        let mut command = Command::new(&yt_dlp_path);
        command
            .args(&args)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        #[cfg(target_os = "windows")]
        command.creation_flags(0x08000000);
        let mut child = command
            .spawn()
            .map_err(|e| format!("yt-dlpの起動に失敗しました: {}", e))?;
        let pid = child.id().ok_or("プロセスIDの取得に失敗しました")?;

        let stdout = child.stdout.take().ok_or("標準出力の取得に失敗しました")?;
        let stderr = child
            .stderr
            .take()
            .ok_or("標準エラーの取得に失敗しました")?;
        let process_ref = self.clone();
        let process_ref_for_stdout = process_ref.clone();
        tokio::spawn(async move {
            read_output(stdout, process_ref_for_stdout).await;
        });
        tokio::spawn(async move {
            read_output(stderr, process_ref).await;
        });

        process.running = true;
        process.child = Some(child);
        Ok(pid)
    }

    pub(super) async fn stop(&self) -> Result<(), String> {
        let mut process = self.inner.lock().await;
        let Some(child) = process.child.as_mut() else {
            return Err("プロセスは実行されていません".to_string());
        };
        child
            .kill()
            .await
            .map_err(|e| format!("yt-dlpの停止に失敗しました: {}", e))?;
        process.child = None;
        process.running = false;
        Ok(())
    }

    pub(super) async fn snapshot_since(&self, since: u64) -> ProcessSnapshot {
        let mut process = self.inner.lock().await;
        let exited = if let Some(child) = process.child.as_mut() {
            matches!(child.try_wait(), Ok(Some(_)))
        } else {
            false
        };
        if exited {
            process.child = None;
            process.running = false;
        }
        ProcessSnapshot {
            running: process.running,
            outputs: process
                .outputs
                .iter()
                .filter(|output| output.id >= since)
                .cloned()
                .collect(),
        }
    }

    async fn push_output(&self, line: String) {
        let mut process = self.inner.lock().await;
        let id = process.next_output_id;
        process.next_output_id += 1;
        process.outputs.push(ProcessOutput { id, line });
    }
}

async fn read_output<R>(mut reader: R, process: SharedDownloadProcess)
where
    R: AsyncReadExt + Unpin,
{
    let mut reader = BufReader::new(&mut reader);
    let mut buffer = Vec::new();
    let mut temp_buffer = [0u8; 1024];
    const MAX_LINE_LENGTH: usize = 8192;

    loop {
        match reader.read(&mut temp_buffer).await {
            Ok(0) => break,
            Ok(n) => {
                for &byte in &temp_buffer[..n] {
                    if byte == b'\r' || byte == b'\n' {
                        let line = decode_buffer(&buffer);
                        process.push_output(line).await;
                        buffer.clear();
                    } else {
                        buffer.push(byte);
                        if buffer.len() > MAX_LINE_LENGTH {
                            let line = decode_buffer(&buffer);
                            process.push_output(line).await;
                            buffer.clear();
                        }
                    }
                }
            }
            Err(_) => break,
        }
    }

    if !buffer.is_empty() {
        process.push_output(decode_buffer(&buffer)).await;
    }
}

fn decode_buffer(buffer: &[u8]) -> String {
    #[cfg(any(target_os = "linux", target_os = "macos"))]
    {
        match std::str::from_utf8(buffer) {
            Ok(s) => s.to_string(),
            Err(_) => String::from_utf8_lossy(buffer).to_string(),
        }
    }

    #[cfg(target_os = "windows")]
    {
        let (decoded, _, has_errors) = encoding_rs::SHIFT_JIS.decode(buffer);
        if !has_errors {
            return decoded.to_string();
        }
        String::from_utf8_lossy(buffer).to_string()
    }
}
