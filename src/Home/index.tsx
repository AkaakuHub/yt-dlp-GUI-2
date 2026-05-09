import { readText } from "@tauri-apps/api/clipboard";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/tauri";
import {
	ChevronLeft,
	ChevronRight,
	Clock,
	Cookie,
	Download,
	FileText,
	FolderOpen,
	ListPlus,
	Settings2,
	ShieldCheck,
	Terminal,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "react-toastify";
import { useAppContext } from "../_components/AppContext";
import Workspace from "../_components/BottomTab";
import {
	cleanDownloadUrl,
	type DownloadParam,
	isValidTimestamp,
	normalizeTimestamp,
	parseQueueItems,
	resolveOutputName,
	shortenText,
	type TimestampField,
} from "./downloadForm";

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

interface QueueState {
	active: boolean;
	index: number;
	items: string[];
}

export default function Home() {
	const {
		isSettingLoaded,
		saveDir,
		selectedIndexNumber,
		setLatestConsoleText,
		setSelectedIndexNumber,
	} = useAppContext();
	const [pid, setPid] = useState<number | null>(null);
	const [consoleText, setConsoleText] = useState("");
	const [urlInput, setUrlInput] = useState("");
	const [arbitraryCode, setArbitraryCode] = useState("");
	const [urlQueueText, setUrlQueueText] = useState("");
	const [queueProgress, setQueueProgress] = useState({ current: 0, total: 0 });
	const [param, setParam] = useState<DownloadParam>({
		codec_id: undefined,
		subtitle_lang: undefined,
		output_name: "",
		start_time: "",
		end_time: "",
		is_cookie: false,
	});

	const queueStateRef = useRef<QueueState>({
		active: false,
		index: -1,
		items: [],
	});
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
		const processId = await invoke<number>("run_command", {
			param: {
				is_cookie: param.is_cookie,
				output_name: param.output_name,
				start_time: startTime,
				end_time: endTime,
				arbitrary_code: arbitraryCode,
				kind: currentSelectedIndex,
			},
		});
		setPid(processId);
	}, [arbitraryCode, hasInvalidTimestamp, param]);

	const runCommandFromUrl = useCallback(
		async (targetUrl: string, queueIndex?: number) => {
			const currentSelectedIndex = selectedIndexRef.current;
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
			const processId = await invoke<number>("run_command", {
				param: {
					...param,
					output_name: resolveOutputName(param.output_name || "", queueIndex),
					start_time: startTime,
					end_time: endTime,
					url,
					kind: currentSelectedIndex,
				},
			});
			setPid(processId);
		},
		[param],
	);

	const executeButtonOnClick = useCallback(
		async (targetUrl: string) => {
			const currentSelectedIndex = selectedIndexRef.current;
			if (hasInvalidTimestamp()) {
				return;
			}
			if (currentSelectedIndex === 13) {
				try {
					await runArbitraryCommand();
				} catch (err) {
					toast.error(`エラー:${err}`);
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
			} catch {
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
			setConsoleText((prev) => {
				if (prev === "") {
					return event.payload.trimStart();
				}
				setLatestConsoleText(event.payload);
				return `${prev}\n${event.payload}`;
			});
		});

		const unlistenExit = listen<string>("process-exit", () => {
			setPid(null);
			runQueueNext();
		});

		const unlistenServerOutput = listen<string>("server-output", (event) => {
			try {
				const dataJson = JSON.parse(event.payload);
				void executeButtonOnClick(dataJson.url);
			} catch (err) {
				toast.error(`エラー:${err}`);
			}
		});

		return () => {
			unlistenOutput.then((fn) => fn());
			unlistenExit.then((fn) => fn());
			unlistenServerOutput.then((fn) => fn());
		};
	}, [executeButtonOnClick, runQueueNext, setLatestConsoleText]);

	const executeFromPrimaryInput = async () => {
		const manualUrl = urlInput.trim();
		if (manualUrl !== "") {
			await executeButtonOnClick(manualUrl);
			return;
		}
		const clipboardUrl = (await readText()) || "";
		setUrlInput(clipboardUrl);
		await executeButtonOnClick(clipboardUrl);
	};

	const stopProcess = async () => {
		resetQueueState();
		await invoke("stop_command", { pid });
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
			<section className="rounded-lg border border-base-300 bg-base-200 p-3 shadow-sm">
				<div className="grid gap-3">
					<div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_190px_minmax(0,1fr)] lg:items-center">
						<div className="grid gap-2">
							<div className="flex min-w-0 flex-wrap items-center gap-2">
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
							<input
								className="input input-bordered h-11 min-h-11 w-full rounded-md bg-base-100 text-sm"
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
							<div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-2">
								<select
									className="select select-bordered h-10 min-h-10 w-full rounded-md bg-base-100 text-sm"
									disabled={!isSettingLoaded}
									value={selectedIndexNumber}
									onChange={(event) => {
										void persistDownloadMode(Number(event.target.value));
									}}
								>
									{downloadModes.map((mode) => (
										<option key={mode.value} value={mode.value}>
											{mode.label}
										</option>
									))}
								</select>
								<button
									aria-label="前のモード"
									className="btn btn-outline h-10 min-h-10 w-10 rounded-md p-0"
									disabled={!isSettingLoaded}
									type="button"
									onClick={() => moveDownloadMode(-1)}
								>
									<ChevronLeft size={18} />
								</button>
								<button
									aria-label="次のモード"
									className="btn btn-outline h-10 min-h-10 w-10 rounded-md p-0"
									disabled={!isSettingLoaded}
									type="button"
									onClick={() => moveDownloadMode(1)}
								>
									<ChevronRight size={18} />
								</button>
							</div>
						</div>

						<div className="grid place-items-center gap-2">
							<button
								className="btn btn-primary aspect-square h-36 min-h-0 rounded-full text-lg font-bold shadow-lg shadow-primary/25 ring-8 ring-primary/10 transition-transform hover:scale-[1.02] active:scale-95 lg:h-40"
								type="button"
								disabled={isQueueRunning || pid !== null}
								onClick={() => void executeFromPrimaryInput()}
							>
								<span className="grid place-items-center gap-2">
									<Download size={30} />
									実行
								</span>
							</button>
							{pid !== null ? (
								<button
									className="btn btn-error btn-sm rounded-md"
									type="button"
									onClick={() => void stopProcess()}
								>
									中止
								</button>
							) : (
								<div className="flex items-center gap-2 text-xs text-base-content/50">
									<ShieldCheck size={14} />
									空欄ならクリップボード
								</div>
							)}
						</div>

						<div className="grid gap-2">
							<div className="grid grid-cols-2 gap-2">
								<button
									className="btn btn-outline h-10 min-h-10 rounded-md"
									type="button"
									onClick={openDirectory}
								>
									<FolderOpen size={16} />
									保存先
								</button>
								<label className="flex h-10 min-w-0 items-center justify-center gap-2 rounded-md border border-base-300 bg-base-100 px-3 text-sm">
									<input
										className="toggle toggle-primary toggle-sm"
										checked={param.is_cookie}
										type="checkbox"
										onChange={(event) =>
											setParam({ ...param, is_cookie: event.target.checked })
										}
									/>
									<Cookie size={15} />
									クッキー
								</label>
							</div>

							<details className="rounded-md border border-base-300 bg-base-100 p-3">
								<summary className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-base-content/65">
									<ListPlus size={14} />
									一括URLリスト
								</summary>
								<textarea
									className="textarea textarea-bordered mt-2 h-20 min-h-20 w-full resize-none rounded-md bg-base-200 text-sm"
									value={urlQueueText}
									onChange={(event) => setUrlQueueText(event.target.value)}
									placeholder="改行またはカンマ区切り"
								/>
							</details>
						</div>
					</div>

					<details className="rounded-md border border-base-300 bg-base-100 p-3">
						<summary className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-base-content/65">
							<Settings2 size={14} />
							詳細設定
						</summary>
						<div className="mt-2 grid gap-2 md:grid-cols-4">
							<label className="grid gap-1">
								<span className="flex items-center gap-1 text-xs text-base-content/60">
									<Clock size={13} />
									開始
								</span>
								<input
									className="input input-bordered h-9 w-full rounded-md bg-base-200 text-sm"
									value={param.start_time || ""}
									onChange={(event) => {
										const value = event.target.value;
										setParam((prev) => ({ ...prev, start_time: value }));
										validateTimestamp("start_time", value);
									}}
									placeholder="00:00:00"
									type="text"
								/>
							</label>
							<label className="grid gap-1">
								<span className="flex items-center gap-1 text-xs text-base-content/60">
									<Clock size={13} />
									終了
								</span>
								<input
									className="input input-bordered h-9 w-full rounded-md bg-base-200 text-sm"
									value={param.end_time || ""}
									onChange={(event) => {
										const value = event.target.value;
										setParam((prev) => ({ ...prev, end_time: value }));
										validateTimestamp("end_time", value);
									}}
									placeholder="00:00:00"
									type="text"
								/>
							</label>
							<label className="grid gap-1 md:col-span-2">
								<span className="flex items-center gap-1 text-xs text-base-content/60">
									<FileText size={13} />
									出力ファイル名
								</span>
								<input
									className="input input-bordered h-9 w-full rounded-md bg-base-200 text-sm"
									value={param.output_name || ""}
									onChange={(event) =>
										setParam((prev) => ({
											...prev,
											output_name: event.target.value,
										}))
									}
									placeholder="{i}で連番"
									type="text"
								/>
							</label>
							{usesCodecId ? (
								<label className="grid gap-1 md:col-span-2">
									<span className="text-xs text-base-content/60">
										コーデックID
									</span>
									<input
										className="input input-bordered h-9 w-full rounded-md bg-base-200 text-sm"
										value={param.codec_id || ""}
										onChange={(event) =>
											setParam({ ...param, codec_id: event.target.value })
										}
										type="text"
									/>
								</label>
							) : null}
							{usesSubtitleLang ? (
								<label className="grid gap-1 md:col-span-2">
									<span className="text-xs text-base-content/60">字幕言語</span>
									<input
										className="input input-bordered h-9 w-full rounded-md bg-base-200 text-sm"
										value={param.subtitle_lang || ""}
										onChange={(event) =>
											setParam({
												...param,
												subtitle_lang: event.target.value,
											})
										}
										type="text"
									/>
								</label>
							) : null}
							{usesArbitraryCode ? (
								<label className="grid gap-1 md:col-span-4">
									<span className="flex items-center gap-1 text-xs text-base-content/60">
										<Terminal size={13} />
										任意コード
									</span>
									<input
										className="input input-bordered h-9 w-full rounded-md bg-base-200 text-sm"
										value={arbitraryCode}
										onChange={(event) => setArbitraryCode(event.target.value)}
										onKeyDown={(event) => {
											if (event.key === "Enter") {
												void executeButtonOnClick("");
											}
										}}
										type="text"
									/>
								</label>
							) : null}
						</div>
					</details>
				</div>
			</section>

			<Workspace consoleText={consoleText} />
		</div>
	);
}
