import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { RunCommandParam } from "../../features/download/domain/downloadForm";
import type { ConfigProps } from "../../types";

type ProcessListeners = {
	onOutput: (line: string) => void;
	onExit: (message: string) => void;
	onQueue: (status: QueueStatus) => void;
};

type RunResponse = {
	pid: number;
};

export type QueueStatus = {
	pending: number;
	running: number;
	maxParallel: number;
	runningPids: number[];
};

export type QueueRunResponse = {
	queueId: number;
	total: number;
	started: number;
	runningPids: number[];
};

type ScheduleResponse = {
	scheduleId: string;
};

export type ReservationResponse = {
	scheduleId: string;
	runAtMs: number;
	title: string;
};

export type ScheduledReservation = {
	id: number;
	title: string;
	url: string;
	runAtMs: number;
	kind: string;
	status: string;
};

export type ChannelMonitorRuleRequest = {
	title: string;
	channelUrl: string;
	weekdays: number[];
	checkTime: string;
	includeWords: string[];
	excludeWords: string[];
	param: RunCommandParam;
};

export type ChannelMonitorRule = {
	id: number;
	title: string;
	channelUrl: string;
	weekdays: number[];
	checkTime: string;
	includeWords: string[];
	excludeWords: string[];
	enabled: boolean;
	nextCheckAtMs: number;
	lastCheckedAtMs?: number;
	status: string;
};

declare global {
	interface Window {
		__TAURI_INTERNALS__?: unknown;
	}
}

export const isTauriRuntime = (): boolean => {
	return window.__TAURI_INTERNALS__ !== undefined;
};

export const initializeWebAuthToken = (): void => {
	const url = new URL(window.location.href);
	const token = url.searchParams.get("token");
	if (!token) {
		return;
	}
	window.localStorage.setItem("serverAuthToken", token);
	url.searchParams.delete("token");
	window.history.replaceState({}, "", url.toString());
};

export const hasWebAuthToken = (): boolean => {
	if (isTauriRuntime()) {
		return true;
	}
	return webAuthToken().trim() !== "";
};

export const setWebAuthToken = (token: string): void => {
	window.localStorage.setItem("serverAuthToken", token);
};

export const getSettings = async (): Promise<ConfigProps> => {
	if (isTauriRuntime()) {
		return invoke<ConfigProps>("get_settings");
	}
	return apiFetch<ConfigProps>("/api/settings");
};

export const startDownload = async (
	param: RunCommandParam,
): Promise<number> => {
	if (isTauriRuntime()) {
		return invoke<number>("start_download", { param });
	}
	const response = await apiFetch<RunResponse>("/api/downloads", {
		method: "POST",
		body: JSON.stringify({ param }),
	});
	return response.pid;
};

export const startDownloadQueue = async (
	params: RunCommandParam[],
	maxParallel: number,
): Promise<QueueRunResponse> => {
	if (isTauriRuntime()) {
		return invoke<QueueRunResponse>("start_download_queue", {
			params,
			maxParallel,
		});
	}
	return apiFetch<QueueRunResponse>("/api/downloads/queue", {
		method: "POST",
		body: JSON.stringify({ params, maxParallel }),
	});
};

export const stopDownload = async (): Promise<void> => {
	if (isTauriRuntime()) {
		await invoke("stop_download");
		return;
	}
	await apiFetchText("/api/downloads/stop", { method: "POST" });
};

export const scheduleDownload = async (
	param: RunCommandParam,
	runAtMs: number,
): Promise<string> => {
	if (isTauriRuntime()) {
		return invoke<string>("schedule_download", {
			param,
			runAtMs,
		});
	}
	const response = await apiFetch<ScheduleResponse>("/api/schedules", {
		method: "POST",
		body: JSON.stringify({ param, runAtMs }),
	});
	return response.scheduleId;
};

export const scheduleYoutubeLiveFromStart = async (
	param: RunCommandParam,
): Promise<ReservationResponse> => {
	if (isTauriRuntime()) {
		return invoke<ReservationResponse>("schedule_youtube_live_from_start", {
			request: { param },
		});
	}
	return apiFetch<ReservationResponse>(
		"/api/schedules/youtube-live-from-start",
		{
			method: "POST",
			body: JSON.stringify({ param }),
		},
	);
};

export const getReservations = async (): Promise<ScheduledReservation[]> => {
	if (isTauriRuntime()) {
		return invoke<ScheduledReservation[]>("get_reservations");
	}
	return apiFetch<ScheduledReservation[]>("/api/reservations");
};

export const createChannelMonitorRule = async (
	rule: ChannelMonitorRuleRequest,
): Promise<number> => {
	if (isTauriRuntime()) {
		return invoke<number>("create_channel_monitor_rule", {
			request: { rule },
		});
	}
	const response = await apiFetch<{ ruleId: number }>("/api/channel-monitors", {
		method: "POST",
		body: JSON.stringify(rule),
	});
	return response.ruleId;
};

export const getChannelMonitorRules = async (): Promise<
	ChannelMonitorRule[]
> => {
	if (isTauriRuntime()) {
		return invoke<ChannelMonitorRule[]>("get_channel_monitor_rules");
	}
	return apiFetch<ChannelMonitorRule[]>("/api/channel-monitors");
};

export const setUseCookieSetting = async (value: boolean): Promise<void> => {
	if (isTauriRuntime()) {
		await invoke("set_use_cookie", { newUseCookie: value });
		return;
	}
	await apiFetchText("/api/settings/use-cookie", {
		method: "POST",
		body: JSON.stringify({ value }),
	});
};

export const setDownloadModeSetting = async (value: number): Promise<void> => {
	if (isTauriRuntime()) {
		await invoke("set_index", { newIndex: value });
		return;
	}
	await apiFetchText("/api/settings/index", {
		method: "POST",
		body: JSON.stringify({ value }),
	});
};

export const setKeepRunningInTraySetting = async (
	value: boolean,
): Promise<void> => {
	if (isTauriRuntime()) {
		await invoke("set_keep_running_in_tray", {
			keepRunningInTray: value,
		});
	}
};

export const openDownloadDirectory = async (path: string): Promise<void> => {
	if (!isTauriRuntime()) {
		return;
	}
	await invoke("open_directory", { path });
};

export const subscribeProcessEvents = async ({
	onOutput,
	onExit,
	onQueue,
}: ProcessListeners): Promise<() => void> => {
	if (isTauriRuntime()) {
		const unlistenOutput = await listen<string>("process-output", (event) => {
			onOutput(event.payload);
		});
		const unlistenExit = await listen<string>("process-exit", (event) => {
			onExit(event.payload);
		});
		const unlistenQueue = await listen<QueueStatus>(
			"process-queue",
			(event) => {
				onQueue(event.payload);
			},
		);
		return () => {
			unlistenOutput();
			unlistenExit();
			unlistenQueue();
		};
	}

	const eventSource = new EventSource(`/api/events?token=${webAuthToken()}`);
	eventSource.addEventListener("process-output", (event) => {
		onOutput(JSON.parse(event.data) as string);
	});
	eventSource.addEventListener("process-exit", (event) => {
		onExit(JSON.parse(event.data) as string);
	});
	eventSource.addEventListener("process-queue", (event) => {
		onQueue(JSON.parse(event.data) as QueueStatus);
	});
	return () => eventSource.close();
};

export const listenDownloadProgress = async <T>(
	handler: (payload: T) => void,
): Promise<UnlistenFn> => {
	if (!isTauriRuntime()) {
		return () => {};
	}
	return listen<T>("download-progress", (event) => {
		handler(event.payload);
	});
};

const apiFetch = async <T>(
	path: string,
	init: RequestInit = {},
): Promise<T> => {
	const response = await fetch(path, {
		...init,
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${webAuthToken()}`,
			...init.headers,
		},
	});
	if (!response.ok) {
		throw new Error(await response.text());
	}
	return response.json() as Promise<T>;
};

const apiFetchText = async (
	path: string,
	init: RequestInit = {},
): Promise<string> => {
	const response = await fetch(path, {
		...init,
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${webAuthToken()}`,
			...init.headers,
		},
	});
	if (!response.ok) {
		throw new Error(await response.text());
	}
	return response.text();
};

const webAuthToken = (): string => {
	return window.localStorage.getItem("serverAuthToken") || "";
};
