export interface DownloadParam {
	codec_id?: string;
	subtitle_lang?: string;
	output_name?: string;
	start_time?: string;
	end_time?: string;
	is_cookie: boolean;
}

export type TimestampField = "start_time" | "end_time";

export const parseQueueItems = (value: string): string[] => {
	return value
		.split(/[,\r\n]+/)
		.map((url) => url.trim())
		.filter((url) => url !== "");
};

export const normalizeTimestamp = (value: string): string | null => {
	const trimmed = value.trim().replace(/\s+/g, "").replace(/：/g, ":");
	if (trimmed === "") {
		return "";
	}

	const parts = trimmed.split(":");
	if (parts.length === 0 || parts.length > 3) {
		return null;
	}
	if (parts.some((part) => part === "" || !/^\d+$/.test(part))) {
		return null;
	}

	if (parts.length === 1) {
		const seconds = Number(parts[0]);
		if (!Number.isInteger(seconds) || seconds < 0) {
			return null;
		}
		return formatSeconds(seconds);
	}

	if (parts.length === 2) {
		const minutes = Number(parts[0]);
		const seconds = Number(parts[1]);
		if (
			!Number.isInteger(minutes) ||
			minutes < 0 ||
			!Number.isInteger(seconds) ||
			seconds < 0 ||
			seconds >= 60
		) {
			return null;
		}
		return formatSeconds(minutes * 60 + seconds);
	}

	const [hoursText, minutesText, secondsText] = parts;
	const hours = Number(hoursText);
	const minutes = Number(minutesText);
	const seconds = Number(secondsText);
	if (
		!Number.isInteger(hours) ||
		hours < 0 ||
		!Number.isInteger(minutes) ||
		minutes < 0 ||
		minutes >= 60 ||
		!Number.isInteger(seconds) ||
		seconds < 0 ||
		seconds >= 60
	) {
		return null;
	}

	return [
		String(hours).padStart(2, "0"),
		String(minutes).padStart(2, "0"),
		String(seconds).padStart(2, "0"),
	].join(":");
};

export const isValidTimestamp = (value: string): boolean => {
	return normalizeTimestamp(value) !== null;
};

export const cleanDownloadUrl = (urlInput: string): string | null => {
	const trimmedUrl = urlInput.trim();
	if (trimmedUrl === "") {
		return null;
	}

	let parsedUrl: URL;
	try {
		parsedUrl = new URL(trimmedUrl);
	} catch {
		return null;
	}

	if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
		return null;
	}

	const removableParams = parsedUrl.pathname.includes("playlist")
		? ["si", "index", "ab_channel", "pp"]
		: ["si", "list", "index", "ab_channel", "pp", "spm_id_from"];
	for (const paramName of removableParams) {
		parsedUrl.searchParams.delete(paramName);
	}

	return parsedUrl.toString();
};

export const resolveOutputName = (
	outputName: string,
	queueIndex?: number,
): string => {
	if (queueIndex === undefined) {
		return outputName;
	}

	const indexText = `${queueIndex + 1}`;
	return outputName.replace(
		/\{i(?::(\d+))?\}/g,
		(_match, rawWidth?: string) => {
			if (rawWidth === undefined) {
				return indexText;
			}

			const width = Number.parseInt(rawWidth, 10);
			if (!Number.isInteger(width) || width <= 0) {
				return indexText;
			}

			return indexText.padStart(width, "0");
		},
	);
};

export const shortenText = (value: string, maxLength: number): string => {
	if (value.length <= maxLength) {
		return value;
	}
	return `${value.slice(0, maxLength - 1)}…`;
};

const formatSeconds = (totalSeconds: number): string => {
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;

	return [
		String(hours).padStart(2, "0"),
		String(minutes).padStart(2, "0"),
		String(seconds).padStart(2, "0"),
	].join(":");
};
