#![cfg_attr(target_os = "windows", windows_subsystem = "windows")]

#[tokio::main]
async fn main() -> Result<(), String> {
    yt_dlp_gui::server_cli::run_from_args(std::env::args().skip(1).collect()).await
}
