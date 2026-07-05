import { parseQueueItems } from "./downloadForm";

export type ExecutionTargetPreview = {
	id: string;
	index: number;
	source: "primary" | "queue";
	url: string;
};

export function buildExecutionTargetPreview(
	primaryUrl: string,
	queueText: string,
): ExecutionTargetPreview[] {
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
