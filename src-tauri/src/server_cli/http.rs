use serde::{Deserialize, Serialize};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpStream,
};

use crate::{config::Settings, download_command::RunCommandParam};

use super::process::SharedDownloadProcess;

#[derive(Deserialize)]
struct RunRequest {
    param: RunCommandParam,
}

#[derive(Serialize)]
struct RunResponse {
    pid: u32,
}

struct HttpRequest {
    method: String,
    path: String,
    headers: Vec<(String, String)>,
    body: String,
}

pub(super) async fn handle_connection(
    mut stream: TcpStream,
    download_process: SharedDownloadProcess,
) -> Result<(), String> {
    let request = read_http_request(&mut stream).await?;
    let settings = Settings::new();
    if !is_authorized(&request, &settings.server_auth_token) {
        return write_response(&mut stream, 401, "Unauthorized", "unauthorized").await;
    }

    match (request.method.as_str(), request.path.as_str()) {
        ("GET", "/health") => write_response(&mut stream, 200, "OK", "ok").await,
        ("POST", "/run") => {
            let run_request = serde_json::from_str::<RunRequest>(&request.body)
                .map_err(|e| format!("リクエストの解析に失敗しました: {}", e))?;
            let pid = match download_process.start(run_request.param).await {
                Ok(pid) => pid,
                Err(err) => return write_response(&mut stream, 400, "Bad Request", &err).await,
            };
            let body = serde_json::to_string(&RunResponse { pid })
                .map_err(|e| format!("レスポンスの作成に失敗しました: {}", e))?;
            write_json_response(&mut stream, 200, "OK", &body).await
        }
        ("POST", "/stop") => {
            if let Err(err) = download_process.stop().await {
                return write_response(&mut stream, 400, "Bad Request", &err).await;
            }
            write_response(&mut stream, 200, "OK", "stopped").await
        }
        ("POST", "/shutdown") => {
            let response = write_response(&mut stream, 200, "OK", "shutdown").await;
            std::thread::spawn(|| {
                std::thread::sleep(std::time::Duration::from_millis(100));
                std::process::exit(0);
            });
            response
        }
        _ => write_response(&mut stream, 404, "Not Found", "not found").await,
    }
}

async fn read_http_request(stream: &mut TcpStream) -> Result<HttpRequest, String> {
    let mut buffer = Vec::new();
    let mut temp = [0u8; 1024];
    let header_end = loop {
        let read_size = stream
            .read(&mut temp)
            .await
            .map_err(|e| format!("リクエストの読み取りに失敗しました: {}", e))?;
        if read_size == 0 {
            return Err("リクエストが空です".to_string());
        }
        buffer.extend_from_slice(&temp[..read_size]);
        if let Some(position) = find_header_end(&buffer) {
            break position;
        }
    };

    let header_text = String::from_utf8(buffer[..header_end].to_vec())
        .map_err(|e| format!("リクエストヘッダーがUTF-8ではありません: {}", e))?;
    let mut lines = header_text.split("\r\n");
    let request_line = lines.next().ok_or("リクエスト行がありません")?;
    let mut request_parts = request_line.split_whitespace();
    let method = request_parts
        .next()
        .ok_or("HTTPメソッドがありません")?
        .to_string();
    let path = request_parts.next().ok_or("パスがありません")?.to_string();

    let headers = lines
        .filter_map(|line| {
            let (name, value) = line.split_once(':')?;
            Some((name.trim().to_string(), value.trim().to_string()))
        })
        .collect::<Vec<_>>();
    let content_length = content_length(&headers)?;
    let body_start = header_end + 4;
    while buffer.len() < body_start + content_length {
        let read_size = stream
            .read(&mut temp)
            .await
            .map_err(|e| format!("リクエスト本文の読み取りに失敗しました: {}", e))?;
        if read_size == 0 {
            break;
        }
        buffer.extend_from_slice(&temp[..read_size]);
    }

    let body = String::from_utf8(buffer[body_start..body_start + content_length].to_vec())
        .map_err(|e| format!("リクエスト本文がUTF-8ではありません: {}", e))?;

    Ok(HttpRequest {
        method,
        path,
        headers,
        body,
    })
}

fn find_header_end(buffer: &[u8]) -> Option<usize> {
    buffer.windows(4).position(|window| window == b"\r\n\r\n")
}

fn content_length(headers: &[(String, String)]) -> Result<usize, String> {
    headers
        .iter()
        .find(|(name, _)| name.eq_ignore_ascii_case("content-length"))
        .map(|(_, value)| {
            value
                .parse::<usize>()
                .map_err(|e| format!("Content-Lengthが不正です: {}", e))
        })
        .unwrap_or(Ok(0))
}

fn is_authorized(request: &HttpRequest, token: &str) -> bool {
    if token.trim().is_empty() {
        return false;
    }
    request
        .headers
        .iter()
        .find(|(name, _)| name.eq_ignore_ascii_case("authorization"))
        .map(|(_, value)| value == &format!("Bearer {}", token))
        .unwrap_or(false)
}

async fn write_json_response(
    stream: &mut TcpStream,
    status: u16,
    reason: &str,
    body: &str,
) -> Result<(), String> {
    let response = format!(
        "HTTP/1.1 {} {}\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n{}",
        status,
        reason,
        body.len(),
        body
    );
    stream
        .write_all(response.as_bytes())
        .await
        .map_err(|e| format!("レスポンスの送信に失敗しました: {}", e))
}

async fn write_response(
    stream: &mut TcpStream,
    status: u16,
    reason: &str,
    body: &str,
) -> Result<(), String> {
    let response = format!(
        "HTTP/1.1 {} {}\r\nContent-Length: {}\r\n\r\n{}",
        status,
        reason,
        body.len(),
        body
    );
    stream
        .write_all(response.as_bytes())
        .await
        .map_err(|e| format!("レスポンスの送信に失敗しました: {}", e))
}
