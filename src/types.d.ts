export interface ConfigProps {
  save_dir: string;
  browser: string;
  server_port: number;
  is_send_notification: boolean;
  index: number;
  is_server_enabled: boolean;
  theme_mode: string;
  use_bundle_tools: boolean; // true: バンドル版使用, false: パス版使用
  yt_dlp_path: string;    // バンドル版またはカスタムパスのyt-dlp
  ffmpeg_path: string;    // バンドル版またはカスタムパスのffmpeg
}