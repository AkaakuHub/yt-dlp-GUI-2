export interface ConfigProps {
	save_dir: string;
	browser: string;
	server_port: number;
	is_send_notification: boolean;
	index: number;
	theme_mode: string;
	use_bundle_tools: boolean; // true: バンドル版使用, false: パス版使用
	yt_dlp_path: string; // バンドル版またはカスタムパスのyt-dlp
	ffmpeg_path: string; // バンドル版またはカスタムパスのffmpeg
	deno_path: string; // バンドル版またはカスタムパスのdeno
	execution_target: "local" | "remote";
	remote_server_url: string;
	remote_auth_token: string;
	server_auth_token: string;
}
