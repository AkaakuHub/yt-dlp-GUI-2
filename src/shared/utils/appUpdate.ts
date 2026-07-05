import { relaunch } from "@tauri-apps/plugin-process";
import type { DownloadEvent, Update } from "@tauri-apps/plugin-updater";

type UpdateProgress = {
	downloadedBytes: number;
	contentLength: number | null;
};

type InstallAvailableUpdateOptions = {
	update: Update;
	onProgress?: (progress: UpdateProgress) => void;
};

export const installAvailableUpdate = async ({
	update,
	onProgress,
}: InstallAvailableUpdateOptions): Promise<void> => {
	let downloadedBytes = 0;
	let contentLength: number | null = null;
	await update.downloadAndInstall((event: DownloadEvent) => {
		if (event.event === "Started") {
			downloadedBytes = 0;
			contentLength = event.data.contentLength ?? null;
		}
		if (event.event === "Progress") {
			downloadedBytes += event.data.chunkLength;
		}
		if (event.event === "Finished") {
			downloadedBytes = contentLength ?? downloadedBytes;
		}
		onProgress?.({ downloadedBytes, contentLength });
	});
	await relaunch();
};
