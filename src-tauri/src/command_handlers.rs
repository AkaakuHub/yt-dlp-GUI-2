use crate::{config::AppState, process_manager::CommandManager, tools::resolve_tool_paths};
use serde::Deserialize;
use std::sync::Arc;
use tauri::State;
use tauri::Window;
use tokio::sync::Mutex;

#[derive(Deserialize)]
pub(crate) struct RunCommandParam {
    url: Option<String>,
    kind: i32,
    codec_id: Option<String>,
    subtitle_lang: Option<String>,
    output_name: Option<String>,
    start_time: Option<String>,
    end_time: Option<String>,
    is_cookie: bool,
    arbitrary_code: Option<String>,
}

fn get_format_command(kind: i32) -> Result<String, String> {
    let video_ids_str = match kind {
        3 => "616/270/137/614/248/399",
        4 => "232/609/247/136/398",
        5 => "231/606/244/135/397",
        6 => "230/605/243/134/396",
        _ => "",
    };

    let format_option = video_ids_str
        .split('/')
        .map(|id| format!("{}+bestaudio", id))
        .collect::<Vec<String>>()
        .join("/");

    Ok(format_option)
}

#[tauri::command]
pub async fn run_command(
    command_manager: State<'_, Arc<Mutex<CommandManager>>>,
    window: tauri::Window,
    param: RunCommandParam,
    app_state: State<'_, AppState>,
) -> Result<u32, String> {
    let settings = app_state.settings.lock().await;

    let mut manager = command_manager.lock().await;
    let (yt_dlp_path, _ffmpeg_path, _deno_path) = resolve_tool_paths(
        settings.use_bundle_tools,
        &settings.yt_dlp_path,
        &settings.ffmpeg_path,
        &settings.deno_path,
    )
    .map_err(|e| format!("ツールパスの解決に失敗しました: {}", e))?;

    if yt_dlp_path.trim().is_empty() {
        return Err(
            "yt-dlpが見つかりません。ツールをダウンロードするかパスを設定してください。".into(),
        );
    }

    let url = param.url.unwrap_or("not_set".to_string());
    let codec_id = param.codec_id.unwrap_or("not_set".to_string());
    let subtitle_lang = param.subtitle_lang.unwrap_or("not_set".to_string());
    let output_name = param.output_name.unwrap_or("".to_string());
    let arbitrary_code = param.arbitrary_code.unwrap_or("not_set".to_string());
    let is_cookie = param.is_cookie;
    let start_time = param.start_time.unwrap_or("".to_string());
    let end_time = param.end_time.unwrap_or("".to_string());

    let browser = format!("{}", settings.browser);
    let output_file_name = if output_name.trim().is_empty() {
        "%(title)s.%(ext)s".to_string()
    } else {
        output_name
    };
    let save_directory = format!("{}/{}", settings.save_dir, output_file_name);

    let trimmed_start_time = start_time.trim();
    let trimmed_end_time = end_time.trim();
    let mut download_sections: Option<String> = None;
    if !trimmed_start_time.is_empty() || !trimmed_end_time.is_empty() {
        let section = if trimmed_start_time.is_empty() {
            format!("*00:00:00-{}", trimmed_end_time)
        } else if trimmed_end_time.is_empty() {
            format!("*{}-", trimmed_start_time)
        } else {
            format!("*{}-{}", trimmed_start_time, trimmed_end_time)
        };
        download_sections = Some(section);
    }

    let mut args: Vec<String> = Vec::new();

    let specific_command = get_format_command(param.kind)?;

    match param.kind {
        1 => {
            args.push(url);
            args.push("-o".to_string());
            args.push(save_directory);
            args.push("-f".to_string());
            args.push("bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best".to_string());
            args.push("--no-mtime".to_string());
        }
        2 => {
            args.push(url);
            args.push("-o".to_string());
            args.push(save_directory);
            args.push("-f".to_string());
            args.push("bestaudio[ext=m4a]".to_string());
            args.push("--no-mtime".to_string());
        }
        3..=6 => {
            args.push(url);
            args.push("-o".to_string());
            args.push(save_directory);
            args.push("-f".to_string());
            args.push(specific_command);
            args.push("--no-mtime".to_string());
        }
        7 => {
            args.push(url);
            args.push("--list-formats".to_string());
            args.push("--skip-download".to_string());
        }
        8 => {
            if codec_id == "not_set" {
                return Err("コーデックIDが指定されていません".into());
            }
            args.push(url);
            args.push("-o".to_string());
            args.push(save_directory);
            args.push("-f".to_string());
            args.push(codec_id);
            args.push("--no-mtime".to_string());
        }
        9 => {
            args.push(url);
            args.push("-o".to_string());
            args.push(save_directory);
            args.push("--live-from-start".to_string());
            args.push("-f".to_string());
            args.push("bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best".to_string());
            args.push("--no-mtime".to_string());
        }
        10 => {
            args.push(url);
            args.push("-o".to_string());
            args.push(save_directory);
            args.push("-f".to_string());
            args.push("bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best".to_string());
            args.push("--no-mtime".to_string());
        }
        11 => {
            args.push(url);
            args.push("-o".to_string());
            args.push(save_directory);
            args.push("--write-thumbnail".to_string());
            args.push("--skip-download".to_string());
            args.push("--no-mtime".to_string());
        }
        12 => {
            if subtitle_lang == "not_set" {
                return Err("字幕言語が指定されていません".into());
            }
            args.push(url);
            args.push("-o".to_string());
            args.push(save_directory);
            args.push("--write-auto-sub".to_string());
            args.push("--sub-lang".to_string());
            args.push(subtitle_lang);
            args.push("--skip-download".to_string());
        }
        13 => {
            if arbitrary_code == "not_set" {
                return Err("任意のコードが指定されていません".into());
            }
            args.push(arbitrary_code);
        }
        _ => {
            return Err("不正な種類です".into());
        }
    }

    if let Some(sections) = download_sections {
        args.push("--download-sections".to_string());
        args.push(sections);
    }

    if is_cookie {
        args.push("--cookies-from-browser".to_string());
        args.push(browser);
    }

    args.push("--remote-components".to_string());
    args.push("ejs:github".to_string());

    return manager
        .start_command(command_manager.inner().clone(), args, window, &yt_dlp_path)
        .await;
}

#[tauri::command]
pub async fn stop_command(
    command_manager: State<'_, Arc<Mutex<CommandManager>>>,
    window: Window,
) -> Result<(), String> {
    let mut manager = command_manager.lock().await;
    manager.stop_command(window).await
}
