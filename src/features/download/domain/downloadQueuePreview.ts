import { parseQueueItems } from "./downloadForm";

export type DownloadQueuePreview = {
	id: string;
	index: number;
	source: "primary" | "queue";
	url: string;
};

export function buildDownloadQueuePreview(
	primaryUrl: string,
	queueText: string,
): DownloadQueuePreview[] {
	const queueItems = parseQueueItems(queueText);
	if (queueItems.length > 0) {
		return queueItems.map((url, index) => ({
			id: `queue-${index}-${url}`,
			index,
			source: "queue",
			url,
		}));
	}

	const trimmedPrimaryUrl = primaryUrl.trim();
	if (trimmedPrimaryUrl === "") {
		return [];
	}

	return [
		{
			id: `primary-${trimmedPrimaryUrl}`,
			index: 0,
			source: "primary",
			url: trimmedPrimaryUrl,
		},
	];
}
