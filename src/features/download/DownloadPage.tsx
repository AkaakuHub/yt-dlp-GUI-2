import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { readText } from "@tauri-apps/plugin-clipboard-manager";
import { Cookie, Download, FolderOpen, Square } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "react-toastify";
import { useAppContext } from "../../app/contexts/AppContext";
import {
	appendConsoleOutput,
	createConsoleLogState,
} from "../../shared/components/ConsoleBox/consoleLog";
import { AppInput } from "../../shared/components/FormControls";
import PrimaryCircleButton from "../../shared/components/PrimaryCircleButton";
import { SurfaceIsland, SurfacePanel } from "../../shared/components/Surface";
import Workspace from "../../shared/components/Workspace";
import { AdvancedDownloadPanel } from "./components/AdvancedDownloadPanel";
import { DownloadModeSelector } from "./components/DownloadModeSelector";
import { QueueUrlPanel } from "./components/QueueUrlPanel";
import {
	cleanDownloadUrl,
	type DownloadParam,
	isDownloadModeValue,
	isValidTimestamp,
	normalizeTimestamp,
	parseQueueItems,
	type RunCommandParam,
	resolveOutputName,
	shortenText,
	type TimestampField,
} from "./domain/downloadForm";

const downloadModes = [
	{ value: 1, label: "通常ダウンロード" },
	{ value: 2, label: "音声のみダウンロード" },
	{ value: 3, label: "1080p" },
	{ value: 4, label: "720p" },
	{ value: 5, label: "480p" },
	{ value: 6, label: "360p" },
	{ value: 7, label: "リストを表示" },
	{ value: 8, label: "IDを指定" },
	{ value: 9, label: "配信録画(最初から)" },
	{ value: 10, label: "配信録画(現在から)" },
	{ value: 11, label: "サムネイル" },
	{ value: 12, label: "字幕" },
	{ value: 13, label: "任意コード >yt-dlp" },
] as const;

const DOWNLOAD_STOPPED_MESSAGE = "プロセスを停止しました";

const stringifyError = (error: unknown): string => {
	if (error instanceof Error) {
		return error.message;
	}
	return String(error);
};

interface QueueState {
	active: boolean;
	index: number;
	items: string[];
}

export default function DownloadPage() {
	const {
		isSettingLoaded,
		saveDir,
		selectedIndexNumber,
		setLatestConsoleText,
		setSelectedIndexNumber,
		setUseCookie,
		useCookie,
	} = useAppContext();
	const [pid, setPid] = useState<number | null>(null);
	const [consoleLog, setConsoleLog] = useState(createConsoleLogState);
	const [urlInput, setUrlInput] = useState("");
	const [arbitraryCode, setArbitraryCode] = useState("");
	const [urlQueueText, setUrlQueueText] = useState("");
	const [showQueuePanel, setShowQueuePanel] = useState(false);
	const [showAdvancedPanel, setShowAdvancedPanel] = useState(false);
	const [queueProgress, setQueueProgress] = useState({ current: 0, total: 0 });
	const [param, setParam] = useState<DownloadParam>({
		codec_id: undefined,
		subtitle_lang: undefined,
		output_name: "",
		start_time: "",
		end_time: "",
		is_cookie: useCookie,
	});

	const queueStateRef = useRef<QueueState>({
		active: false,
		index: -1,
		items: [],
	});
	const latestDownloadDestinationRef = useRef("");
	const stopRequestedRef = useRef(false);
	const selectedIndexRef = useRef(selectedIndexNumber);
	const invalidTimestampRef = useRef({
		start_time: false,
		end_time: false,
	});

	const resetQueueState = useCallback(() => {
		queueStateRef.current = { active: false, index: -1, items: [] };
		setQueueProgress({ current: 0, total: 0 });
	}, []);

	useEffect(() => {
		selectedIndexRef.current = selectedIndexNumber;
	}, [selectedIndexNumber]);

	useEffect(() => {
		setParam((prev) => ({ ...prev, is_cookie: useCookie }));
	}, [useCookie]);

	const updateCookie = async (nextUseCookie: boolean) => {
		setUseCookie(nextUseCookie);
		setParam((prev) => ({ ...prev, is_cookie: nextUseCookie }));
		await invoke("set_use_cookie", { newUseCookie: nextUseCookie });
	};

	const validateTimestamp = useCallback(
		(field: TimestampField, value: string): void => {
			if (value === "") {
				invalidTimestampRef.current[field] = false;
				return;
			}
			if (isValidTimestamp(value)) {
				invalidTimestampRef.current[field] = false;
				return;
			}
			if (!invalidTimestampRef.current[field]) {
				toast.error(
					`${field === "start_time" ? "開始時間" : "終了時間"}は10、0:10、01:20:30のいずれかの形式で入力してください。`,
				);
				invalidTimestampRef.current[field] = true;
			}
		},
		[],
	);

	const hasInvalidTimestamp = useCallback((): boolean => {
		if (!isValidTimestamp(param.start_time || "")) {
			toast.error("開始時間の形式が不正です。");
			return true;
		}
		if (!isValidTimestamp(param.end_time || "")) {
			toast.error("終了時間の形式が不正です。");
			return true;
		}
		return false;
	}, [param.start_time, param.end_time]);

	const runArbitraryCommand = useCallback(async () => {
		const currentSelectedIndex = selectedIndexRef.current;
		if (!isDownloadModeValue(currentSelectedIndex)) {
			toast.error("不正なモードです。");
			return;
		}
		if (hasInvalidTimestamp()) {
			return;
		}
		if (arbitraryCode === "") {
			toast.error("任意コードが空です。");
			return;
		}
		const startTime = normalizeTimestamp(param.start_time || "");
		const endTime = normalizeTimestamp(param.end_time || "");
		if (startTime === null || endTime === null) {
			toast.error("開始時間/終了時間の形式が不正です。");
			return;
		}
		const runParam: RunCommandParam = {
			is_cookie: param.is_cookie,
			output_name: param.output_name,
			start_time: startTime,
			end_time: endTime,
			arbitrary_code: arbitraryCode,
			kind: currentSelectedIndex,
		};
		const processId = await invoke<number>("start_download", {
			param: runParam,
		});
		setPid(processId);
	}, [arbitraryCode, hasInvalidTimestamp, param]);

	const runCommandFromUrl = useCallback(
		async (targetUrl: string, queueIndex?: number) => {
			const currentSelectedIndex = selectedIndexRef.current;
			if (!isDownloadModeValue(currentSelectedIndex)) {
				toast.error("不正なモードです。");
				throw new Error("invalid_mode");
			}
			const startTime = normalizeTimestamp(param.start_time || "");
			const endTime = normalizeTimestamp(param.end_time || "");
			if (startTime === null || endTime === null) {
				toast.error("開始時間/終了時間の形式が不正です。");
				throw new Error("invalid_timestamp");
			}
			if (targetUrl.trim() === "") {
				toast.error("URLが空です。");
				throw new Error("empty_url");
			}
			const url = cleanDownloadUrl(targetUrl);
			if (url === null) {
				toast.error(
					`"${shortenText(targetUrl, 100)}"は有効なURLではありません。`,
				);
				throw new Error("invalid_url");
			}
			const runParam: RunCommandParam = {
				...param,
				output_name: resolveOutputName(param.output_name || "", queueIndex),
				start_time: startTime,
				end_time: endTime,
				url,
				kind: currentSelectedIndex,
			};
			const processId = await invoke<number>("start_download", {
				param: runParam,
			});
			setPid(processId);
		},
		[param],
	);

	const executeButtonOnClick = useCallback(
		async (targetUrl: string) => {
			const currentSelectedIndex = selectedIndexRef.current;
			if (!isDownloadModeValue(currentSelectedIndex)) {
				toast.error("不正なモードです。");
				return;
			}
			if (hasInvalidTimestamp()) {
				return;
			}
			if (currentSelectedIndex === 13) {
				try {
					await runArbitraryCommand();
				} catch (err) {
					toast.error(`エラー:${stringifyError(err)}`);
				}
				return;
			}

			const queueInput = parseQueueItems(urlQueueText);
			const isQueueMode = queueInput.length > 0;
			const urls = isQueueMode ? queueInput : [targetUrl];
			if (urls.length === 0 || urls.every((url) => url === "")) {
				toast.error("URLが空です。");
				return;
			}

			const invalidUrl = urls.find((url) => cleanDownloadUrl(url) === null);
			if (invalidUrl) {
				toast.error(
					`"${shortenText(invalidUrl, 100)}"は有効なURLではありません。`,
				);
				return;
			}

			queueStateRef.current = { active: true, index: 0, items: urls };
			setQueueProgress({ current: 1, total: urls.length });

			try {
				await runCommandFromUrl(urls[0] ?? "", isQueueMode ? 0 : undefined);
			} catch (err) {
				toast.error(`エラー:${stringifyError(err)}`);
				resetQueueState();
			}
		},
		[
			hasInvalidTimestamp,
			resetQueueState,
			runArbitraryCommand,
			runCommandFromUrl,
			urlQueueText,
		],
	);

	const runQueueNext = useCallback(() => {
		if (!queueStateRef.current.active) {
			return;
		}
		const nextIndex = queueStateRef.current.index + 1;
		if (nextIndex >= queueStateRef.current.items.length) {
			resetQueueState();
			return;
		}
		queueStateRef.current = { ...queueStateRef.current, index: nextIndex };
		setQueueProgress((prev) => ({ current: nextIndex + 1, total: prev.total }));
		void runCommandFromUrl(
			queueStateRef.current.items[nextIndex] ?? "",
			nextIndex,
		).catch((err) => {
			toast.error(`エラー:${err}`);
			resetQueueState();
		});
	}, [resetQueueState, runCommandFromUrl]);

	useEffect(() => {
		const unlistenOutput = listen<string>("process-output", (event) => {
			if (event.payload === "") {
				return;
			}
			if (event.payload.includes("Destination:")) {
				latestDownloadDestinationRef.current = event.payload;
			}
			if (
				event.payload.startsWith("[download]") ||
				event.payload.startsWith("[Merger]") ||
				event.payload.startsWith("[Fixup")
			) {
				const progressPayload =
					latestDownloadDestinationRef.current &&
					event.payload.startsWith("[download]") &&
					!event.payload.includes("Destination:")
						? `${event.payload}\n${latestDownloadDestinationRef.current}`
						: event.payload;
				setLatestConsoleText(progressPayload);
			}
			setConsoleLog((prev) => appendConsoleOutput(prev, event.payload));
		});

		const unlistenExit = listen<string>("process-exit", () => {
			const wasStopped = stopRequestedRef.current;
			stopRequestedRef.current = false;
			latestDownloadDestinationRef.current = "";
			setLatestConsoleText(wasStopped ? DOWNLOAD_STOPPED_MESSAGE : "");
			setPid(null);
			if (wasStopped) {
				return;
			}
			runQueueNext();
		});

		return () => {
			unlistenOutput.then((fn) => fn());
			unlistenExit.then((fn) => fn());
		};
	}, [runQueueNext, setLatestConsoleText]);

	const executeFromPrimaryInput = async () => {
		const inputUrl = urlInput.trim();
		let clipboardText = "";
		try {
			clipboardText = (await readText()) || "";
		} catch (err) {
			toast.error(
				`クリップボードの読み取りに失敗しました:${stringifyError(err)}`,
			);
		}
		const targetUrl = clipboardText.trim() || inputUrl;
		try {
			await executeButtonOnClick(targetUrl);
		} catch (err) {
			toast.error(`エラー:${stringifyError(err)}`);
		}
	};

	const stopProcess = async () => {
		resetQueueState();
		stopRequestedRef.current = true;
		try {
			await invoke("stop_download");
		} catch (error) {
			stopRequestedRef.current = false;
			toast.error(`停止に失敗しました:${stringifyError(error)}`);
			return;
		}
		setPid(null);
	};

	const openDirectory = async () => {
		await invoke("open_directory", { path: saveDir });
	};

	const persistDownloadMode = async (nextMode: number) => {
		if (!isSettingLoaded) {
			return;
		}
		setSelectedIndexNumber(nextMode);
		await invoke("set_index", { newIndex: nextMode });
	};

	const moveDownloadMode = (direction: -1 | 1) => {
		const currentIndex = downloadModes.findIndex(
			(mode) => mode.value === selectedIndexNumber,
		);
		const safeIndex = currentIndex === -1 ? 0 : currentIndex;
		const nextIndex =
			(safeIndex + direction + downloadModes.length) % downloadModes.length;
		void persistDownloadMode(downloadModes[nextIndex].value);
	};

	const isQueueRunning = queueProgress.total > 0;
	const usesCodecId = selectedIndexNumber === 8;
	const usesSubtitleLang = selectedIndexNumber === 12;
	const usesArbitraryCode = selectedIndexNumber === 13;
	const queueLabel =
		queueProgress.total > 0
			? `${queueProgress.current}/${queueProgress.total}`
			: "";

	return (
		<div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-2 overflow-hidden bg-base-100 p-2 text-base-content">
			<SurfaceIsland>
				<div className="grid gap-2">
					<div className="relative grid gap-2 sm:min-h-40">
						<SurfacePanel className="z-10 grid gap-2 sm:absolute sm:top-0 sm:bottom-0 sm:left-0 sm:right-1/2 sm:pr-28">
							<div className="flex min-w-0 items-center gap-2">
								{pid === null ? (
									<span className="badge badge-ghost border-base-300 text-base-content/60">
										待機中
									</span>
								) : (
									<span className="badge badge-error badge-outline">
										PID {pid}
										{queueLabel !== "" ? ` ${queueLabel}` : ""}
									</span>
								)}
							</div>
							<AppInput
								className="h-10 min-h-10 w-full bg-base-200"
								value={urlInput}
								onChange={(event) => setUrlInput(event.target.value)}
								onKeyDown={(event) => {
									if (event.key === "Enter") {
										void executeFromPrimaryInput();
									}
								}}
								placeholder="URL"
								type="url"
							/>

							<DownloadModeSelector
								disabled={!isSettingLoaded}
								options={downloadModes}
								value={selectedIndexNumber}
								onChange={(value) => void persistDownloadMode(value)}
								onMove={moveDownloadMode}
							/>
						</SurfacePanel>

						<SurfacePanel className="z-10 grid grid-cols-2 gap-2 sm:absolute sm:top-0 sm:right-0 sm:left-1/2 sm:pl-28">
							<button
								className="btn btn-ghost h-10 min-h-10 rounded-md bg-base-200 hover:bg-base-300"
								type="button"
								onClick={openDirectory}
							>
								<FolderOpen size={16} />
								<span className="hidden lg:inline">保存先</span>
							</button>
							<label className="dark-control-border flex h-10 min-w-0 items-center justify-center gap-2 rounded-md border border-base-300 bg-base-200 px-3 text-sm">
								<input
									className="toggle toggle-primary toggle-sm"
									checked={param.is_cookie}
									type="checkbox"
									onChange={(event) => void updateCookie(event.target.checked)}
								/>
								<Cookie size={15} />
								<span className="hidden lg:inline">クッキー</span>
							</label>
						</SurfacePanel>

						<QueueUrlPanel
							isOpen={showQueuePanel}
							value={urlQueueText}
							onChange={setUrlQueueText}
							onToggle={() => setShowQueuePanel((prev) => !prev)}
						/>

						<div className="z-[60] grid place-items-center sm:absolute sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2">
							<PrimaryCircleButton
								label={pid === null ? "実行" : "中止"}
								icon={
									pid === null ? <Download size={30} /> : <Square size={26} />
								}
								disabled={pid === null && isQueueRunning}
								tone={pid === null ? "primary" : "danger"}
								onClick={() => {
									if (pid === null) {
										void executeFromPrimaryInput();
										return;
									}
									void stopProcess();
								}}
							/>
						</div>
					</div>

					<AdvancedDownloadPanel
						arbitraryCode={arbitraryCode}
						isOpen={showAdvancedPanel}
						param={param}
						usesArbitraryCode={usesArbitraryCode}
						usesCodecId={usesCodecId}
						usesSubtitleLang={usesSubtitleLang}
						onArbitraryCodeChange={setArbitraryCode}
						onExecuteArbitraryCode={() => void executeButtonOnClick("")}
						onParamChange={setParam}
						onToggle={() => setShowAdvancedPanel((prev) => !prev)}
						onValidateTimestamp={validateTimestamp}
					/>
				</div>
			</SurfaceIsland>

			<Workspace consoleLog={consoleLog} />
		</div>
	);
}
