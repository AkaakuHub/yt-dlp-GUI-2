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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct OutputResponse {
    running: bool,
    outputs: Vec<OutputLine>,
}

#[derive(Serialize)]
struct OutputLine {
    id: u64,
    line: String,
}

struct HttpRequest {
    method: String,
    path: String,
    headers: Vec<(String, String)>,
    body: String,
}

struct HttpResponse {
    status: u16,
    reason: &'static str,
    content_type: Option<&'static str>,
    body: String,
    should_shutdown: bool,
}

pub(super) async fn handle_connection(
    mut stream: TcpStream,
    download_process: SharedDownloadProcess,
) -> Result<(), String> {
    let request = read_http_request(&mut stream).await?;
    let settings = Settings::new();
    let response =
        handle_http_request(request, settings.server_auth_token.trim(), download_process).await?;
    let should_shutdown = response.should_shutdown;
    write_response(&mut stream, response).await?;
    if should_shutdown {
        std::thread::spawn(|| {
            std::thread::sleep(std::time::Duration::from_millis(100));
            std::process::exit(0);
        });
    }
    Ok(())
}

async fn handle_http_request(
    request: HttpRequest,
    token: &str,
    download_process: SharedDownloadProcess,
) -> Result<HttpResponse, String> {
    if !is_authorized(&request, token) {
        return Ok(text_response(401, "Unauthorized", "unauthorized"));
    }

    let (path, query) = split_path_query(&request.path);

    match (request.method.as_str(), path) {
        ("GET", "/health") => Ok(text_response(200, "OK", "ok")),
        ("GET", "/output") => {
            let since = query_param(query, "since")
                .and_then(|value| value.parse::<u64>().ok())
                .unwrap_or(0);
            let snapshot = download_process.snapshot_since(since).await;
            let body = serde_json::to_string(&OutputResponse {
                running: snapshot.running,
                outputs: snapshot
                    .outputs
                    .into_iter()
                    .map(|output| OutputLine {
                        id: output.id,
                        line: output.line,
                    })
                    .collect(),
            })
            .map_err(|e| format!("レスポンスの作成に失敗しました: {}", e))?;
            Ok(json_response(200, "OK", body))
        }
        ("POST", "/run") => {
            let run_request = match serde_json::from_str::<RunRequest>(&request.body) {
                Ok(run_request) => run_request,
                Err(err) => {
                    return Ok(text_response(
                        400,
                        "Bad Request",
                        &format!("リクエストの解析に失敗しました: {}", err),
                    ));
                }
            };
            let pid = match download_process.start(run_request.param).await {
                Ok(pid) => pid,
                Err(err) => return Ok(text_response(400, "Bad Request", &err)),
            };
            let body = serde_json::to_string(&RunResponse { pid })
                .map_err(|e| format!("レスポンスの作成に失敗しました: {}", e))?;
            Ok(json_response(200, "OK", body))
        }
        ("POST", "/stop") => {
            if let Err(err) = download_process.stop().await {
                return Ok(text_response(400, "Bad Request", &err));
            }
            Ok(text_response(200, "OK", "stopped"))
        }
        ("POST", "/shutdown") => Ok(shutdown_response()),
        _ => Ok(text_response(404, "Not Found", "not found")),
    }
}

fn split_path_query(path: &str) -> (&str, Option<&str>) {
    path.split_once('?')
        .map(|(path, query)| (path, Some(query)))
        .unwrap_or((path, None))
}

fn query_param<'a>(query: Option<&'a str>, key: &str) -> Option<&'a str> {
    query?.split('&').find_map(|pair| {
        let (name, value) = pair.split_once('=')?;
        if name == key {
            return Some(value);
        }
        None
    })
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
    let token = token.trim();
    if token.is_empty() {
        return false;
    }
    request
        .headers
        .iter()
        .find(|(name, _)| name.eq_ignore_ascii_case("authorization"))
        .map(|(_, value)| value == &format!("Bearer {}", token))
        .unwrap_or(false)
}

fn text_response(status: u16, reason: &'static str, body: &str) -> HttpResponse {
    HttpResponse {
        status,
        reason,
        content_type: None,
        body: body.to_string(),
        should_shutdown: false,
    }
}

fn json_response(status: u16, reason: &'static str, body: String) -> HttpResponse {
    HttpResponse {
        status,
        reason,
        content_type: Some("application/json"),
        body,
        should_shutdown: false,
    }
}

fn shutdown_response() -> HttpResponse {
    HttpResponse {
        status: 200,
        reason: "OK",
        content_type: None,
        body: "shutdown".to_string(),
        should_shutdown: true,
    }
}

async fn write_response(stream: &mut TcpStream, response: HttpResponse) -> Result<(), String> {
    let content_type = response
        .content_type
        .map(|value| format!("Content-Type: {}\r\n", value))
        .unwrap_or_default();
    let http_response = format!(
        "HTTP/1.1 {} {}\r\n{}Content-Length: {}\r\n\r\n{}",
        response.status,
        response.reason,
        content_type,
        response.body.len(),
        response.body
    );
    stream
        .write_all(http_response.as_bytes())
        .await
        .map_err(|e| format!("レスポンスの送信に失敗しました: {}", e))
}

#[cfg(test)]
mod tests {
    use super::{handle_http_request, is_authorized, HttpRequest};
    use crate::server_cli::process::SharedDownloadProcess;

    fn request_with_authorization(value: &str) -> HttpRequest {
        HttpRequest {
            method: "GET".to_string(),
            path: "/health".to_string(),
            headers: vec![("Authorization".to_string(), value.to_string())],
            body: String::new(),
        }
    }

    fn request(method: &str, path: &str, token: Option<&str>, body: &str) -> HttpRequest {
        let headers = token
            .map(|token| vec![("Authorization".to_string(), format!("Bearer {}", token))])
            .unwrap_or_default();
        HttpRequest {
            method: method.to_string(),
            path: path.to_string(),
            headers,
            body: body.to_string(),
        }
    }

    async fn response_for(request: HttpRequest, saved_token: &str) -> super::HttpResponse {
        handle_http_request(request, saved_token, SharedDownloadProcess::new())
            .await
            .expect("HTTPレスポンスを作成できる")
    }

    #[test]
    fn authorizes_trimmed_saved_token() {
        let request = request_with_authorization("Bearer abc123");

        assert!(is_authorized(&request, " abc123\n"));
    }

    #[test]
    fn rejects_empty_token() {
        let request = request_with_authorization("Bearer abc123");

        assert!(!is_authorized(&request, " \n"));
    }

    #[tokio::test]
    async fn health_returns_ok_with_valid_token() {
        let response = response_for(request("GET", "/health", Some("abc123"), ""), "abc123").await;

        assert_eq!(response.status, 200);
        assert_eq!(response.body, "ok");
    }

    #[tokio::test]
    async fn request_without_token_returns_unauthorized() {
        let response = response_for(request("GET", "/health", None, ""), "abc123").await;

        assert_eq!(response.status, 401);
        assert_eq!(response.body, "unauthorized");
    }

    #[tokio::test]
    async fn request_with_wrong_token_returns_unauthorized() {
        let response = response_for(request("GET", "/health", Some("wrong"), ""), "abc123").await;

        assert_eq!(response.status, 401);
        assert_eq!(response.body, "unauthorized");
    }

    #[tokio::test]
    async fn unknown_path_returns_not_found() {
        let response = response_for(request("GET", "/missing", Some("abc123"), ""), "abc123").await;

        assert_eq!(response.status, 404);
        assert_eq!(response.body, "not found");
    }

    #[tokio::test]
    async fn stop_without_process_returns_bad_request() {
        let response = response_for(request("POST", "/stop", Some("abc123"), ""), "abc123").await;

        assert_eq!(response.status, 400);
        assert_eq!(response.body, "プロセスは実行されていません");
    }

    #[tokio::test]
    async fn malformed_run_request_returns_bad_request() {
        let response = response_for(request("POST", "/run", Some("abc123"), "{"), "abc123").await;

        assert_eq!(response.status, 400);
        assert!(response.body.starts_with("リクエストの解析に失敗しました:"));
    }

    #[tokio::test]
    async fn output_returns_json_with_running_state() {
        let response = response_for(
            request("GET", "/output?since=0", Some("abc123"), ""),
            "abc123",
        )
        .await;

        assert_eq!(response.status, 200);
        assert_eq!(response.content_type, Some("application/json"));
        assert_eq!(response.body, "{\"running\":false,\"outputs\":[]}");
    }

    #[tokio::test]
    async fn shutdown_marks_response_without_exiting_test_process() {
        let response =
            response_for(request("POST", "/shutdown", Some("abc123"), ""), "abc123").await;

        assert_eq!(response.status, 200);
        assert_eq!(response.body, "shutdown");
        assert!(response.should_shutdown);
    }
}
