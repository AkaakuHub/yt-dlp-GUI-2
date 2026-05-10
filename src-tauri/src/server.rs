use tauri::{Emitter, Window};
use tokio::io::AsyncReadExt;
use tokio::io::AsyncWriteExt;
use tokio::io::BufReader as TokioBufReader;
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::mpsc::{channel, Sender};
use tokio::task;

pub struct ServerManager {
    server_task: Option<task::JoinHandle<()>>,
    stop_signal: Option<Sender<()>>,
}

impl ServerManager {
    pub fn new() -> Self {
        Self {
            server_task: None,
            stop_signal: None,
        }
    }

    pub async fn start_server(&mut self, port: u16, window: Window) {
        let (tx, mut rx) = channel(1);
        self.stop_signal = Some(tx);

        self.server_task = Some(task::spawn(async move {
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

    pub async fn stop_server(&mut self) {
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
pub async fn toggle_server(
    enable: bool,
    port: u16,
    window: tauri::Window,
    server_manager: tauri::State<'_, std::sync::Arc<tokio::sync::Mutex<ServerManager>>>,
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
