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
	Square,
	Terminal,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "react-toastify";
import { useAppContext } from "../_components/AppContext";
import Workspace from "../_components/BottomTab";
import PrimaryCircleButton from "../_components/PrimaryCircleButton";
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
	const [showQueuePanel, setShowQueuePanel] = useState(false);
	const [showAdvancedPanel, setShowAdvancedPanel] = useState(false);
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
		const processId = await invoke<number>("run_command", { param: runParam });
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
			const processId = await invoke<number>("run_command", {
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
			<section className="rounded-lg border border-base-300 bg-base-200 p-2 shadow-sm">
				<div className="grid gap-2">
					<div className="relative grid gap-2 sm:min-h-40">
						<div className="z-10 grid gap-2 rounded-lg bg-base-100 p-2 sm:absolute sm:top-2 sm:bottom-2 sm:left-2 sm:right-1/2 sm:pr-28">
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
							<input
								className="input input-bordered h-10 min-h-10 w-full rounded-md bg-base-200 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
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
									className="select select-bordered h-10 min-h-10 w-full rounded-md bg-base-200 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
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
									className="btn btn-ghost h-10 min-h-10 w-10 rounded-md bg-base-200 p-0 hover:bg-base-300 focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
									disabled={!isSettingLoaded}
									type="button"
									onClick={() => moveDownloadMode(-1)}
								>
									<ChevronLeft size={18} />
								</button>
								<button
									aria-label="次のモード"
									className="btn btn-ghost h-10 min-h-10 w-10 rounded-md bg-base-200 p-0 hover:bg-base-300 focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
									disabled={!isSettingLoaded}
									type="button"
									onClick={() => moveDownloadMode(1)}
								>
									<ChevronRight size={18} />
								</button>
							</div>
						</div>

						<div className="z-10 grid grid-cols-2 gap-2 rounded-lg bg-base-100 p-2 sm:absolute sm:top-2 sm:right-2 sm:left-1/2 sm:pl-28">
							<button
								className="btn btn-ghost h-10 min-h-10 rounded-md bg-base-200 hover:bg-base-300"
								type="button"
								onClick={openDirectory}
							>
								<FolderOpen size={16} />
								<span className="hidden lg:inline">保存先</span>
							</button>
							<label className="flex h-10 min-w-0 items-center justify-center gap-2 rounded-md bg-base-200 px-3 text-sm">
								<input
									className="toggle toggle-primary toggle-sm"
									checked={param.is_cookie}
									type="checkbox"
									onChange={(event) =>
										setParam({ ...param, is_cookie: event.target.checked })
									}
								/>
								<Cookie size={15} />
								<span className="hidden lg:inline">クッキー</span>
							</label>
						</div>

						<div className="z-30 sm:absolute sm:right-2 sm:bottom-2 sm:left-1/2 sm:pl-28">
							<button
								className="flex h-12 w-full items-center gap-2 rounded-lg bg-base-100 p-3 text-left text-xs font-semibold text-base-content/65 hover:bg-base-300"
								type="button"
								onClick={() => setShowQueuePanel((prev) => !prev)}
							>
								<ListPlus size={14} />
								一括URLリスト
							</button>
							{showQueuePanel ? (
								<div className="absolute top-14 right-0 left-28 z-40 rounded-lg bg-base-100 p-3 shadow-xl ring-1 ring-base-300">
									<textarea
										className="textarea textarea-bordered h-28 min-h-28 w-full resize-none rounded-md bg-base-200 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
										value={urlQueueText}
										onChange={(event) => setUrlQueueText(event.target.value)}
										placeholder="改行またはカンマ区切り"
									/>
								</div>
							) : null}
						</div>

						<div className="z-20 grid place-items-center sm:absolute sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2">
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

					<div className="relative">
						<button
							className="flex h-10 w-full items-center gap-2 rounded-md bg-base-100 px-3 text-left text-xs font-semibold text-base-content/65 hover:bg-base-300"
							type="button"
							onClick={() => setShowAdvancedPanel((prev) => !prev)}
						>
							<Settings2 size={14} />
							詳細設定
						</button>
						{showAdvancedPanel ? (
							<div className="absolute top-12 right-0 left-0 z-30 grid gap-2 rounded-lg bg-base-100 p-3 shadow-xl ring-1 ring-base-300 md:grid-cols-4">
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
										<span className="text-xs text-base-content/60">
											字幕言語
										</span>
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
						) : null}
					</div>
				</div>
			</section>

			<Workspace consoleText={consoleText} />
		</div>
	);
}
