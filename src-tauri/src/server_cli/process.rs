use std::{process::Stdio, sync::Arc};

use tokio::{
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
}

impl SharedDownloadProcess {
    pub(super) fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(DownloadProcess { child: None })),
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
        let child = Command::new(&yt_dlp_path)
            .args(&args)
            .stdout(Stdio::inherit())
            .stderr(Stdio::inherit())
            .spawn()
            .map_err(|e| format!("yt-dlpの起動に失敗しました: {}", e))?;
        let pid = child.id().ok_or("プロセスIDの取得に失敗しました")?;

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
        Ok(())
    }
}
