mod http;
mod options;
mod process;
mod tray;

pub async fn run_from_args(args: Vec<String>) -> Result<(), String> {
    let options = options::ServerCliOptions::from_args(args)?;
    let address = options.address();
    let listener = std::net::TcpListener::bind(&address)
        .map_err(|e| format!("サーバーCLIの起動に失敗しました: {}", e))?;
    listener
        .set_nonblocking(true)
        .map_err(|e| format!("サーバーCLIの初期化に失敗しました: {}", e))?;
    let address_for_server = address.clone();
    let download_process = process::SharedDownloadProcess::new();
    let download_process_for_server = download_process.clone();
    std::thread::spawn(move || {
        let runtime = match tokio::runtime::Runtime::new() {
            Ok(runtime) => runtime,
            Err(err) => {
                eprintln!("サーバーCLIのruntime作成に失敗しました: {}", err);
                return;
            }
        };
        if let Err(err) = runtime.block_on(run_http_server(
            address_for_server,
            listener,
            download_process_for_server,
        )) {
            eprintln!("{}", err);
        }
    });

    tray::run_tray(address, download_process)?;
    Ok(())
}

async fn run_http_server(
    address: String,
    listener: std::net::TcpListener,
    download_process: process::SharedDownloadProcess,
) -> Result<(), String> {
    let listener = tokio::net::TcpListener::from_std(listener)
        .map_err(|e| format!("サーバーCLIの初期化に失敗しました: {}", e))?;
    println!("yt-dlp-GUI server-cli listening on {}", address);

    loop {
        let (stream, _) = listener
            .accept()
            .await
            .map_err(|e| format!("接続の受付に失敗しました: {}", e))?;
        let download_process = download_process.clone();
        tokio::spawn(async move {
            if let Err(err) = http::handle_connection(stream, download_process).await {
                eprintln!("{}", err);
            }
        });
    }
}
