use std::{fs, path::PathBuf, sync::Arc, time::Duration};

use rcgen::generate_simple_self_signed;
use serde::{Deserialize, Serialize};
use tauri::{path::BaseDirectory, AppHandle, Manager};
use tokio::{
    io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt},
    net::{TcpListener, TcpStream},
    sync::Mutex,
    time::sleep,
};
use tokio_rustls::{
    rustls::{
        pki_types::{CertificateDer, PrivateKeyDer, PrivatePkcs8KeyDer},
        ServerConfig,
    },
    TlsAcceptor,
};

use crate::{
    channel_monitor::create_channel_monitor_rule_from_web,
    command_handlers::schedule_local_download,
    config::{get_config_root, AppState, Settings, WebServerStatus},
    download_command::{build_yt_dlp_args, RunCommandParam},
    process_manager::{CommandManager, QueueStartResponse},
    reservation::{
        resolve_youtube_live_reservation, ReservationResponse, YoutubeLiveReservationRequest,
    },
    reservation_store::{ChannelMonitorRuleRequest, ReservationStore},
    tools::resolve_tool_paths,
};

const WEB_TLS_CERT_FILENAME: &str = "web-server-cert.der";
const WEB_TLS_KEY_FILENAME: &str = "web-server-key.der";

#[derive(Deserialize)]
struct RunRequest {
    param: RunCommandParam,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct QueueRunRequest {
    params: Vec<RunCommandParam>,
    max_parallel: usize,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ScheduleRequest {
    param: RunCommandParam,
    run_at_ms: u64,
}

#[derive(Serialize)]
struct RunResponse {
    pid: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ScheduleResponse {
    schedule_id: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ChannelMonitorRuleResponse {
    rule_id: i64,
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
    content_type: &'static str,
    body: Vec<u8>,
}

pub fn start(
    app_handle: AppHandle,
    app_state: tauri::State<'_, AppState>,
    command_manager: tauri::State<'_, Arc<Mutex<CommandManager>>>,
) {
    spawn_web_server(
        app_handle,
        app_state.inner(),
        command_manager.inner().clone(),
    );
}

fn spawn_web_server(
    app_handle: AppHandle,
    app_state: &AppState,
    command_manager: Arc<Mutex<CommandManager>>,
) {
    let settings =
        tauri::async_runtime::block_on(async { app_state.settings.lock().await.clone() });
    let address = format!("0.0.0.0:{}", settings.server_port);
    let reservation_store = app_state.reservation_store.clone();
    let web_server_status = app_state.web_server_status.clone();
    let web_server_task = app_state.web_server_task.clone();
    let task = tauri::async_runtime::spawn(async move {
        set_web_server_status(
            &web_server_status,
            WebServerStatus {
                running: false,
                address: address.clone(),
                error: String::new(),
            },
        )
        .await;
        if let Err(err) = run_server(
            address.clone(),
            app_handle,
            command_manager,
            reservation_store,
            web_server_status.clone(),
        )
        .await
        {
            eprintln!("webサーバーの起動に失敗しました: {}", err);
            set_web_server_status(
                &web_server_status,
                WebServerStatus {
                    running: false,
                    address,
                    error: err,
                },
            )
            .await;
        }
    });
    tauri::async_runtime::spawn(async move {
        *web_server_task.lock().await = Some(task);
    });
}

async fn run_server(
    address: String,
    app_handle: AppHandle,
    command_manager: Arc<Mutex<CommandManager>>,
    reservation_store: ReservationStore,
    web_server_status: Arc<Mutex<WebServerStatus>>,
) -> Result<(), String> {
    let listener = TcpListener::bind(&address)
        .await
        .map_err(|e| format!("{}: {}", address, e))?;
    let tls_acceptor = create_tls_acceptor()?;
    set_web_server_status(
        &web_server_status,
        WebServerStatus {
            running: true,
            address: address.clone(),
            error: String::new(),
        },
    )
    .await;
    println!("yt-dlp-GUI web listening on https://{}", address);

    loop {
        let (stream, _) = listener
            .accept()
            .await
            .map_err(|e| format!("接続の受付に失敗しました: {}", e))?;
        let app_handle = app_handle.clone();
        let command_manager = command_manager.clone();
        let reservation_store = reservation_store.clone();
        let tls_acceptor = tls_acceptor.clone();
        tokio::spawn(async move {
            if let Err(err) = handle_tls_connection(
                stream,
                tls_acceptor,
                app_handle,
                command_manager,
                reservation_store,
            )
            .await
            {
                eprintln!("{}", err);
            }
        });
    }
}

pub async fn set_web_server_status(
    status: &Arc<Mutex<WebServerStatus>>,
    next_status: WebServerStatus,
) {
    *status.lock().await = next_status;
}

#[tauri::command]
pub async fn get_web_server_status(
    state: tauri::State<'_, AppState>,
) -> Result<WebServerStatus, String> {
    Ok(state.web_server_status.lock().await.clone())
}

#[tauri::command]
pub async fn restart_web_server(
    app_handle: AppHandle,
    state: tauri::State<'_, AppState>,
    command_manager: tauri::State<'_, Arc<Mutex<CommandManager>>>,
) -> Result<WebServerStatus, String> {
    if let Some(task) = state.web_server_task.lock().await.take() {
        task.abort();
    }
    set_web_server_status(
        &state.web_server_status,
        WebServerStatus {
            running: false,
            address: String::new(),
            error: "再起動中".to_string(),
        },
    )
    .await;
    spawn_web_server(app_handle, state.inner(), command_manager.inner().clone());
    sleep(Duration::from_millis(250)).await;
    Ok(state.web_server_status.lock().await.clone())
}

fn create_tls_acceptor() -> Result<TlsAcceptor, String> {
    let (cert_der, key_der) = load_or_create_tls_identity()?;
    let config = create_tls_server_config(cert_der, key_der).or_else(|_| {
        recreate_tls_identity()
            .and_then(|(cert_der, key_der)| create_tls_server_config(cert_der, key_der))
    })?;
    Ok(TlsAcceptor::from(Arc::new(config)))
}

fn create_tls_server_config(
    cert_der: CertificateDer<'static>,
    key_der: PrivateKeyDer<'static>,
) -> Result<ServerConfig, String> {
    let config = ServerConfig::builder()
        .with_no_client_auth()
        .with_single_cert(vec![cert_der], key_der)
        .map_err(|e| format!("HTTPS設定を作成できません: {}", e))?;
    Ok(config)
}

fn load_or_create_tls_identity() -> Result<(CertificateDer<'static>, PrivateKeyDer<'static>), String>
{
    let config_root = get_config_root();
    let cert_path = config_root.join(WEB_TLS_CERT_FILENAME);
    let key_path = config_root.join(WEB_TLS_KEY_FILENAME);
    if cert_path.exists() && key_path.exists() {
        let cert_der =
            fs::read(&cert_path).map_err(|e| format!("HTTPS証明書を読めません: {}", e))?;
        let key_der = fs::read(&key_path).map_err(|e| format!("HTTPS秘密鍵を読めません: {}", e))?;
        return Ok((
            CertificateDer::from(cert_der),
            PrivateKeyDer::from(PrivatePkcs8KeyDer::from(key_der)),
        ));
    }

    fs::create_dir_all(&config_root)
        .map_err(|e| format!("設定ディレクトリを作成できません: {}", e))?;
    let certified_key = generate_simple_self_signed(tls_subject_alt_names())
        .map_err(|e| format!("HTTPS証明書を生成できません: {}", e))?;
    let cert_bytes = certified_key.cert.der().to_vec();
    let key_bytes = certified_key.signing_key.serialize_der();
    fs::write(&cert_path, &cert_bytes)
        .map_err(|e| format!("HTTPS証明書を保存できません: {}", e))?;
    fs::write(&key_path, &key_bytes).map_err(|e| format!("HTTPS秘密鍵を保存できません: {}", e))?;
    Ok((
        CertificateDer::from(cert_bytes),
        PrivateKeyDer::from(PrivatePkcs8KeyDer::from(key_bytes)),
    ))
}

fn recreate_tls_identity() -> Result<(CertificateDer<'static>, PrivateKeyDer<'static>), String> {
    let config_root = get_config_root();
    let cert_path = config_root.join(WEB_TLS_CERT_FILENAME);
    let key_path = config_root.join(WEB_TLS_KEY_FILENAME);
    if cert_path.exists() {
        fs::remove_file(&cert_path).map_err(|e| format!("HTTPS証明書を削除できません: {}", e))?;
    }
    if key_path.exists() {
        fs::remove_file(&key_path).map_err(|e| format!("HTTPS秘密鍵を削除できません: {}", e))?;
    }
    load_or_create_tls_identity()
}

fn tls_subject_alt_names() -> Vec<String> {
    vec![
        "localhost".to_string(),
        "127.0.0.1".to_string(),
        "::1".to_string(),
    ]
}

async fn handle_tls_connection(
    stream: TcpStream,
    tls_acceptor: TlsAcceptor,
    app_handle: AppHandle,
    command_manager: Arc<Mutex<CommandManager>>,
    reservation_store: ReservationStore,
) -> Result<(), String> {
    let stream = tls_acceptor
        .accept(stream)
        .await
        .map_err(|e| format!("TLS接続に失敗しました: {}", e))?;
    handle_connection(stream, app_handle, command_manager, reservation_store).await
}

async fn handle_connection<S>(
    mut stream: S,
    app_handle: AppHandle,
    command_manager: Arc<Mutex<CommandManager>>,
    reservation_store: ReservationStore,
) -> Result<(), String>
where
    S: AsyncRead + AsyncWrite + Unpin,
{
    let request = read_http_request(&mut stream).await?;
    if request.method == "GET" && request.path.starts_with("/api/events") {
        return handle_sse(stream, request, command_manager).await;
    }

    let response = handle_http_request(request, &app_handle, command_manager, reservation_store)
        .await
        .unwrap_or_else(|error| text_response(500, "Internal Server Error", &error));
    write_response(&mut stream, response).await
}

async fn handle_http_request(
    request: HttpRequest,
    app_handle: &AppHandle,
    command_manager: Arc<Mutex<CommandManager>>,
    reservation_store: ReservationStore,
) -> Result<HttpResponse, String> {
    let (path, _) = split_path_query(&request.path);
    if path.starts_with("/api/") && !is_authorized(&request, &Settings::new()) {
        return Ok(text_response(401, "Unauthorized", "unauthorized"));
    }

    match (request.method.as_str(), path) {
        ("GET", "/api/health") => Ok(text_response(200, "OK", "ok")),
        ("GET", "/api/settings") => json_response(200, "OK", &Settings::new()),
        ("GET", "/api/reservations") => {
            let reservations = reservation_store.reservations()?;
            json_response(200, "OK", &reservations)
        }
        ("GET", "/api/channel-monitors") => {
            let rules = reservation_store.channel_monitor_rules()?;
            json_response(200, "OK", &rules)
        }
        ("POST", "/api/downloads") => {
            let run_request = serde_json::from_str::<RunRequest>(&request.body)
                .map_err(|e| format!("リクエストの解析に失敗しました: {}", e))?;
            let response =
                start_download_queue(vec![run_request.param], 1, command_manager).await?;
            let pid = response
                .running_pids
                .first()
                .copied()
                .ok_or_else(|| "プロセスIDの取得に失敗しました".to_string())?;
            json_response(200, "OK", &RunResponse { pid })
        }
        ("POST", "/api/downloads/queue") => {
            let run_request = serde_json::from_str::<QueueRunRequest>(&request.body)
                .map_err(|e| format!("リクエストの解析に失敗しました: {}", e))?;
            let response = start_download_queue(
                run_request.params,
                run_request.max_parallel,
                command_manager,
            )
            .await?;
            json_response(200, "OK", &response)
        }
        ("POST", "/api/schedules") => {
            let schedule_request = serde_json::from_str::<ScheduleRequest>(&request.body)
                .map_err(|e| format!("リクエストの解析に失敗しました: {}", e))?;
            let schedule_id =
                schedule_download(schedule_request, command_manager, reservation_store).await?;
            json_response(200, "OK", &ScheduleResponse { schedule_id })
        }
        ("POST", "/api/schedules/youtube-live-from-start") => {
            let schedule_request =
                serde_json::from_str::<YoutubeLiveReservationRequest>(&request.body)
                    .map_err(|e| format!("リクエストの解析に失敗しました: {}", e))?;
            let reservation = schedule_youtube_live_from_start(
                schedule_request,
                command_manager,
                reservation_store,
            )
            .await?;
            json_response(200, "OK", &reservation)
        }
        ("POST", "/api/channel-monitors") => {
            let rule_request = serde_json::from_str::<ChannelMonitorRuleRequest>(&request.body)
                .map_err(|e| format!("リクエストの解析に失敗しました: {}", e))?;
            let rule_id = create_channel_monitor_rule_from_web(
                command_manager,
                reservation_store,
                rule_request,
            )
            .await?;
            json_response(200, "OK", &ChannelMonitorRuleResponse { rule_id })
        }
        ("POST", "/api/downloads/stop") => {
            command_manager.lock().await.stop_all_commands(None).await?;
            Ok(text_response(200, "OK", "stopped"))
        }
        ("POST", "/api/settings/use-cookie") => {
            let value = json_bool_field(&request.body, "value")?;
            let mut settings = Settings::new();
            settings.set_use_cookie(value);
            Ok(text_response(200, "OK", "ok"))
        }
        ("POST", "/api/settings/index") => {
            let value = json_u32_field(&request.body, "value")?;
            let mut settings = Settings::new();
            settings.set_index(value);
            Ok(text_response(200, "OK", "ok"))
        }
        _ if request.method == "GET" => serve_static(app_handle, path).await,
        _ => Ok(text_response(404, "Not Found", "not found")),
    }
}

async fn schedule_download(
    request: ScheduleRequest,
    command_manager: Arc<Mutex<CommandManager>>,
    reservation_store: ReservationStore,
) -> Result<String, String> {
    schedule_local_download(
        command_manager,
        None,
        reservation_store,
        request.param,
        request.run_at_ms,
        "日時指定予約".to_string(),
        "日時指定".to_string(),
    )
    .await
}

async fn schedule_youtube_live_from_start(
    request: YoutubeLiveReservationRequest,
    command_manager: Arc<Mutex<CommandManager>>,
    reservation_store: ReservationStore,
) -> Result<ReservationResponse, String> {
    let settings = Settings::new();
    let (param, run_at_ms, title) = resolve_youtube_live_reservation(request, &settings).await?;
    let schedule_id = schedule_local_download(
        command_manager,
        None,
        reservation_store,
        param,
        run_at_ms,
        title.clone(),
        "YouTubeライブ".to_string(),
    )
    .await?;
    Ok(ReservationResponse {
        schedule_id,
        run_at_ms,
        title,
    })
}

async fn start_download_queue(
    params: Vec<RunCommandParam>,
    max_parallel: usize,
    command_manager: Arc<Mutex<CommandManager>>,
) -> Result<QueueStartResponse, String> {
    let settings = Settings::new();
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
    let commands = params
        .into_iter()
        .map(|param| {
            let args = build_yt_dlp_args(param, &settings)?;
            Ok((args, yt_dlp_path.clone()))
        })
        .collect::<Result<Vec<_>, String>>()?;
    CommandManager::enqueue_commands(command_manager, commands, None, max_parallel).await
}

async fn handle_sse<S>(
    mut stream: S,
    request: HttpRequest,
    command_manager: Arc<Mutex<CommandManager>>,
) -> Result<(), String>
where
    S: AsyncRead + AsyncWrite + Unpin,
{
    if !is_authorized(&request, &Settings::new()) {
        let response = text_response(401, "Unauthorized", "unauthorized");
        return write_response(&mut stream, response).await;
    }

    stream
        .write_all(
            b"HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nCache-Control: no-cache\r\nConnection: keep-alive\r\n\r\n",
        )
        .await
        .map_err(|e| format!("SSEレスポンスの送信に失敗しました: {}", e))?;

    let mut since = 0_u64;
    let mut was_running = false;
    let mut last_queue_json = String::new();
    loop {
        let snapshot = command_manager.lock().await.snapshot_since(since);
        for output in snapshot.outputs {
            since = output.id + 1;
            write_sse_event(&mut stream, "process-output", &output.line).await?;
        }
        let queue_json = serde_json::to_string(&snapshot.queue)
            .map_err(|e| format!("キュー状態の作成に失敗しました: {}", e))?;
        if queue_json != last_queue_json {
            write_sse_raw_event(&mut stream, "process-queue", &queue_json).await?;
            last_queue_json = queue_json;
        }
        if snapshot.running {
            was_running = true;
        } else if was_running {
            write_sse_event(&mut stream, "process-exit", "プロセス終了").await?;
            break;
        }
        sleep(Duration::from_millis(500)).await;
    }
    Ok(())
}

async fn write_sse_event<S>(stream: &mut S, event: &str, data: &str) -> Result<(), String>
where
    S: AsyncWrite + Unpin,
{
    let data =
        serde_json::to_string(data).map_err(|e| format!("SSEの作成に失敗しました: {}", e))?;
    write_sse_raw_event(stream, event, &data).await
}

async fn write_sse_raw_event(
    stream: &mut (impl AsyncWrite + Unpin),
    event: &str,
    data: &str,
) -> Result<(), String> {
    stream
        .write_all(format!("event: {}\ndata: {}\n\n", event, data).as_bytes())
        .await
        .map_err(|e| format!("SSEの送信に失敗しました: {}", e))
}

async fn serve_static(app_handle: &AppHandle, path: &str) -> Result<HttpResponse, String> {
    let requested_path = if path == "/" {
        "index.html"
    } else {
        path.trim_start_matches('/')
    };
    if requested_path.contains("..") {
        return Ok(text_response(400, "Bad Request", "bad request"));
    }

    let dist_dir = web_dist_dir(app_handle)?;
    let mut file_path = dist_dir.join(requested_path);
    if !file_path.exists() {
        file_path = dist_dir.join("index.html");
    }
    let body = tokio::fs::read(&file_path)
        .await
        .map_err(|e| format!("webファイルの読み取りに失敗しました: {}", e))?;
    Ok(HttpResponse {
        status: 200,
        reason: "OK",
        content_type: content_type(&file_path),
        body,
    })
}

fn web_dist_dir(app_handle: &AppHandle) -> Result<PathBuf, String> {
    let dist_dir = app_handle
        .path()
        .resolve("../dist", BaseDirectory::Resource)
        .map_err(|e| format!("resource_dir: {}", e))?;
    if dist_dir.join("index.html").exists() {
        return Ok(dist_dir);
    }
    Err("web配信用のdistが見つかりません".to_string())
}

fn content_type(path: &std::path::Path) -> &'static str {
    match path.extension().and_then(|extension| extension.to_str()) {
        Some("html") => "text/html; charset=utf-8",
        Some("js") => "text/javascript; charset=utf-8",
        Some("css") => "text/css; charset=utf-8",
        Some("png") => "image/png",
        Some("svg") => "image/svg+xml",
        Some("ico") => "image/x-icon",
        _ => "application/octet-stream",
    }
}

fn split_path_query(path: &str) -> (&str, Option<&str>) {
    path.split_once('?')
        .map(|(path, query)| (path, Some(query)))
        .unwrap_or((path, None))
}

fn is_authorized(request: &HttpRequest, settings: &Settings) -> bool {
    let token = settings.server_auth_token.trim();
    if token.is_empty() {
        return false;
    }
    if request
        .headers
        .iter()
        .find(|(name, _)| name.eq_ignore_ascii_case("authorization"))
        .map(|(_, value)| value == &format!("Bearer {}", token))
        .unwrap_or(false)
    {
        return true;
    }
    let (_, query) = split_path_query(&request.path);
    query
        .map(|query| {
            query
                .split('&')
                .filter_map(|pair| pair.split_once('='))
                .any(|(name, value)| name == "token" && value == token)
        })
        .unwrap_or(false)
}

async fn read_http_request(stream: &mut (impl AsyncRead + Unpin)) -> Result<HttpRequest, String> {
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

async fn write_response(
    stream: &mut (impl AsyncWrite + Unpin),
    response: HttpResponse,
) -> Result<(), String> {
    let http_response = format!(
        "HTTP/1.1 {} {}\r\nContent-Type: {}\r\nContent-Length: {}\r\n\r\n",
        response.status,
        response.reason,
        response.content_type,
        response.body.len()
    );
    stream
        .write_all(http_response.as_bytes())
        .await
        .map_err(|e| format!("レスポンスの送信に失敗しました: {}", e))?;
    stream
        .write_all(&response.body)
        .await
        .map_err(|e| format!("レスポンス本文の送信に失敗しました: {}", e))
}

fn text_response(status: u16, reason: &'static str, body: &str) -> HttpResponse {
    HttpResponse {
        status,
        reason,
        content_type: "text/plain; charset=utf-8",
        body: body.as_bytes().to_vec(),
    }
}

fn json_response<T: Serialize>(
    status: u16,
    reason: &'static str,
    value: &T,
) -> Result<HttpResponse, String> {
    let body = serde_json::to_vec(value).map_err(|e| format!("JSONの作成に失敗しました: {}", e))?;
    Ok(HttpResponse {
        status,
        reason,
        content_type: "application/json; charset=utf-8",
        body,
    })
}

fn json_bool_field(body: &str, field: &str) -> Result<bool, String> {
    serde_json::from_str::<serde_json::Value>(body)
        .ok()
        .and_then(|value| value.get(field).and_then(|value| value.as_bool()))
        .ok_or_else(|| format!("{}が不正です", field))
}

fn json_u32_field(body: &str, field: &str) -> Result<u32, String> {
    serde_json::from_str::<serde_json::Value>(body)
        .ok()
        .and_then(|value| value.get(field).and_then(|value| value.as_u64()))
        .and_then(|value| u32::try_from(value).ok())
        .ok_or_else(|| format!("{}が不正です", field))
}
