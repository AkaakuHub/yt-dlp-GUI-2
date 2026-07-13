const DOWNLOAD_TITLE = "yt-dlp-GUI";

const parseRemainingSeconds = (progressText: string): number | null => {
	const match = progressText.match(/^残り (\d+(?::\d{2}){1,2}) \((.+?)%\)$/);
	if (!match) {
		return null;
	}
	const units = match[1].split(":").map(Number);
	if (units.some((unit) => !Number.isInteger(unit) || unit < 0)) {
		return null;
	}
	if (units.length === 2) {
		return units[0] * 60 + units[1];
	}
	return units[0] * 60 * 60 + units[1] * 60 + units[2];
};

const formatRemainingSeconds = (remainingSeconds: number): string => {
	const hours = Math.floor(remainingSeconds / 3600);
	const minutes = Math.floor((remainingSeconds % 3600) / 60);
	const seconds = remainingSeconds % 60;
	if (hours > 0) {
		return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds
			.toString()
			.padStart(2, "0")}`;
	}
	return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};

export const createDownloadTitle = (
	progressText: string,
	videoTitle: string,
	elapsedSeconds: number,
): string => {
	const remainingSeconds = parseRemainingSeconds(progressText);
	const titlePrefix =
		remainingSeconds === null
			? progressText
			: progressText.replace(
					/^残り \d+(?::\d{2}){1,2}/,
					`残り ${formatRemainingSeconds(
						Math.max(remainingSeconds - elapsedSeconds, 0),
					)}`,
				);
	return videoTitle
		? `${titlePrefix} ${videoTitle}`
		: titlePrefix || DOWNLOAD_TITLE;
};

export const defaultDocumentTitle = (): string => DOWNLOAD_TITLE;
