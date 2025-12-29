import { invoke } from "@tauri-apps/api/tauri";

export type ToolStatus = {
	ok: boolean;
	ytDlpPath: string;
	ffmpegPath: string;
	denoPath: string;
	ytDlpFound: boolean;
	ffmpegFound: boolean;
	denoFound: boolean;
	ytDlpError?: string | null;
	ffmpegError?: string | null;
	denoError?: string | null;
};

export async function checkToolAvailability(
	useBundleTools: boolean,
	ytDlpPath?: string,
	ffmpegPath?: string,
	denoPath?: string,
): Promise<ToolStatus> {
	return invoke<ToolStatus>("check_tools_status", {
		useBundleTools,
		ytDlpPath,
		ffmpegPath,
		denoPath,
	});
}
