import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { RunCommandParam } from "../../features/download/domain/downloadForm";
import type { ConfigProps } from "../../types";

type ProcessListeners = {
	onOutput: (line: string) => void;
	onExit: (message: string) => void;
};

type RunResponse = {
	pid: number;
};

type ScheduleResponse = {
	scheduleId: string;
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

export const openDownloadDirectory = async (path: string): Promise<void> => {
	if (!isTauriRuntime()) {
		return;
	}
	await invoke("open_directory", { path });
};

export const subscribeProcessEvents = async ({
	onOutput,
	onExit,
}: ProcessListeners): Promise<() => void> => {
	if (isTauriRuntime()) {
		const unlistenOutput = await listen<string>("process-output", (event) => {
			onOutput(event.payload);
		});
		const unlistenExit = await listen<string>("process-exit", (event) => {
			onExit(event.payload);
		});
		return () => {
			unlistenOutput();
			unlistenExit();
		};
	}

	const eventSource = new EventSource(`/api/events?token=${webAuthToken()}`);
	eventSource.addEventListener("process-output", (event) => {
		onOutput(JSON.parse(event.data) as string);
	});
	eventSource.addEventListener("process-exit", (event) => {
		onExit(JSON.parse(event.data) as string);
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
