use crate::config::Settings;
use serde::Deserialize;

#[derive(Deserialize)]
pub(crate) struct RunCommandParam {
    pub url: Option<String>,
    pub kind: i32,
    pub codec_id: Option<String>,
    pub subtitle_lang: Option<String>,
    pub output_name: Option<String>,
    pub start_time: Option<String>,
    pub end_time: Option<String>,
    pub is_cookie: bool,
    pub arbitrary_code: Option<String>,
}

pub(crate) fn build_yt_dlp_args(
    param: RunCommandParam,
    settings: &Settings,
) -> Result<Vec<String>, String> {
    let url = param.url.unwrap_or_default();
    let codec_id = param.codec_id.unwrap_or_default();
    let subtitle_lang = param.subtitle_lang.unwrap_or_default();
    let output_name = param.output_name.unwrap_or_default();
    let arbitrary_code = param.arbitrary_code.unwrap_or_default();
    let start_time = param.start_time.unwrap_or_default();
    let end_time = param.end_time.unwrap_or_default();

    let output_file_name = if output_name.trim().is_empty() {
        "%(title)s.%(ext)s".to_string()
    } else {
        output_name
    };
    let save_path = format!("{}/{}", settings.save_dir, output_file_name);
    let mut args = args_for_mode(
        param.kind,
        &url,
        &save_path,
        &codec_id,
        &subtitle_lang,
        &arbitrary_code,
    )?;

    if let Some(download_section) = build_download_section(&start_time, &end_time) {
        args.push("--download-sections".to_string());
        args.push(download_section);
    }

    if param.is_cookie {
        args.push("--cookies-from-browser".to_string());
        args.push(settings.browser.clone());
    }

    args.push("--remote-components".to_string());
    args.push("ejs:github".to_string());

    Ok(args)
}

fn args_for_mode(
    kind: i32,
    url: &str,
    save_path: &str,
    codec_id: &str,
    subtitle_lang: &str,
    arbitrary_code: &str,
) -> Result<Vec<String>, String> {
    match kind {
        1 => video_download_args(url, save_path),
        2 => Ok(vec![
            url.to_string(),
            "-o".to_string(),
            save_path.to_string(),
            "-f".to_string(),
            "bestaudio[ext=m4a]".to_string(),
            "--no-mtime".to_string(),
        ]),
        3..=6 => Ok(vec![
            url.to_string(),
            "-o".to_string(),
            save_path.to_string(),
            "-f".to_string(),
            format_command(kind),
            "--no-mtime".to_string(),
        ]),
        7 => Ok(vec![
            url.to_string(),
            "--list-formats".to_string(),
            "--skip-download".to_string(),
        ]),
        8 => {
            if codec_id.trim().is_empty() {
                return Err("コーデックIDが指定されていません".into());
            }
            Ok(vec![
                url.to_string(),
                "-o".to_string(),
                save_path.to_string(),
                "-f".to_string(),
                codec_id.to_string(),
                "--no-mtime".to_string(),
            ])
        }
        9 => {
            let mut args = vec![
                url.to_string(),
                "-o".to_string(),
                save_path.to_string(),
                "--live-from-start".to_string(),
            ];
            args.extend(video_format_args());
            Ok(args)
        }
        10 => video_download_args(url, save_path),
        11 => Ok(vec![
            url.to_string(),
            "-o".to_string(),
            save_path.to_string(),
            "--write-thumbnail".to_string(),
            "--skip-download".to_string(),
            "--no-mtime".to_string(),
        ]),
        12 => {
            if subtitle_lang.trim().is_empty() {
                return Err("字幕言語が指定されていません".into());
            }
            Ok(vec![
                url.to_string(),
                "-o".to_string(),
                save_path.to_string(),
                "--write-auto-sub".to_string(),
                "--sub-lang".to_string(),
                subtitle_lang.to_string(),
                "--skip-download".to_string(),
            ])
        }
        13 => {
            if arbitrary_code.trim().is_empty() {
                return Err("任意のコードが指定されていません".into());
            }
            Ok(vec![arbitrary_code.to_string()])
        }
        _ => Err("不正な種類です".into()),
    }
}

fn video_download_args(url: &str, save_path: &str) -> Result<Vec<String>, String> {
    let mut args = vec![url.to_string(), "-o".to_string(), save_path.to_string()];
    args.extend(video_format_args());
    Ok(args)
}

fn video_format_args() -> Vec<String> {
    vec![
        "-f".to_string(),
        "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best".to_string(),
        "--no-mtime".to_string(),
    ]
}

fn format_command(kind: i32) -> String {
    let video_ids = match kind {
        3 => ["616", "270", "137", "614", "248", "399"],
        4 => ["232", "609", "247", "136", "398", ""],
        5 => ["231", "606", "244", "135", "397", ""],
        6 => ["230", "605", "243", "134", "396", ""],
        _ => ["", "", "", "", "", ""],
    };

    video_ids
        .iter()
        .filter(|id| !id.is_empty())
        .map(|id| format!("{}+bestaudio", id))
        .collect::<Vec<String>>()
        .join("/")
}

fn build_download_section(start_time: &str, end_time: &str) -> Option<String> {
    let trimmed_start_time = start_time.trim();
    let trimmed_end_time = end_time.trim();
    if trimmed_start_time.is_empty() && trimmed_end_time.is_empty() {
        return None;
    }

    if trimmed_start_time.is_empty() {
        return Some(format!("*00:00:00-{}", trimmed_end_time));
    }
    if trimmed_end_time.is_empty() {
        return Some(format!("*{}-", trimmed_start_time));
    }
    Some(format!("*{}-{}", trimmed_start_time, trimmed_end_time))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn settings() -> Settings {
        Settings {
            save_dir: "C:/downloads".to_string(),
            browser: "firefox".to_string(),
            ..Settings::default()
        }
    }

    #[test]
    fn builds_normal_video_args() {
        let args = build_yt_dlp_args(
            RunCommandParam {
                url: Some("https://example.com/video".to_string()),
                kind: 1,
                codec_id: None,
                subtitle_lang: None,
                output_name: None,
                start_time: None,
                end_time: None,
                is_cookie: false,
                arbitrary_code: None,
            },
            &settings(),
        )
        .unwrap();

        assert_eq!(args[0], "https://example.com/video");
        assert!(args.contains(&"C:/downloads/%(title)s.%(ext)s".to_string()));
        assert!(
            args.contains(&"bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best".to_string())
        );
    }

    #[test]
    fn rejects_empty_codec_id() {
        let result = build_yt_dlp_args(
            RunCommandParam {
                url: Some("https://example.com/video".to_string()),
                kind: 8,
                codec_id: Some("".to_string()),
                subtitle_lang: None,
                output_name: None,
                start_time: None,
                end_time: None,
                is_cookie: false,
                arbitrary_code: None,
            },
            &settings(),
        );

        assert_eq!(result.unwrap_err(), "コーデックIDが指定されていません");
    }

    #[test]
    fn adds_download_section_and_cookie_args() {
        let args = build_yt_dlp_args(
            RunCommandParam {
                url: Some("https://example.com/video".to_string()),
                kind: 2,
                codec_id: None,
                subtitle_lang: None,
                output_name: Some("audio.m4a".to_string()),
                start_time: Some("00:01:00".to_string()),
                end_time: Some("00:02:00".to_string()),
                is_cookie: true,
                arbitrary_code: None,
            },
            &settings(),
        )
        .unwrap();

        assert!(args
            .windows(2)
            .any(|pair| pair == ["--download-sections", "*00:01:00-00:02:00"]));
        assert!(args
            .windows(2)
            .any(|pair| pair == ["--cookies-from-browser", "firefox"]));
    }
}
