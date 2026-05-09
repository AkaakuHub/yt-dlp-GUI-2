import { readText } from "@tauri-apps/api/clipboard";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/tauri";
import {
	ChevronLeft,
	ChevronRight,
	Cookie,
	Download,
	FolderOpen,
	ListPlus,
	Terminal,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { toast } from "react-toastify";
import { useAppContext } from "../_components/AppContext";
import BottomTab from "../_components/BottomTab";
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

	const [consoleText, setConsoleText] = useState<string>("");
	const [urlInput, setUrlInput] = useState<string>("");
	const [arbitraryCode, setArbitraryCode] = useState<string>("");
	const [urlQueueText, setUrlQueueText] = useState<string>("");

	const [queueProgress, setQueueProgress] = useState<{
		current: number;
		total: number;
	}>({ current: 0, total: 0 });
	const queueStateRef = useRef<QueueState>({
		active: false,
		index: -1,
		items: [],
	});

	const selectedIndexRef = useRef(selectedIndexNumber);

	const resetQueueState = useCallback(() => {
		queueStateRef.current = { active: false, index: -1, items: [] };
		setQueueProgress({ current: 0, total: 0 });
	}, []);

	useEffect(() => {
		selectedIndexRef.current = selectedIndexNumber;
	}, [selectedIndexNumber]);

	const [param, setParam] = useState<DownloadParam>({
		codec_id: undefined,
		subtitle_lang: undefined,
		output_name: "",
		start_time: "",
		end_time: "",
		is_cookie: false,
	});

	const invalidTimestampRef = useRef({
		start_time: false,
		end_time: false,
	});

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
					`${field === "start_time" ? "開始時間" : "終了時間"}は 10, 0:10, 01:20:30 のいずれかの形式で入力してください。`,
				);
				invalidTimestampRef.current[field] = true;
			}
		},
		[],
	);

	const hasInvalidTimestamp = useCallback((): boolean => {
		if (!isValidTimestamp(param.start_time || "")) {
			toast.error(
				"開始時間は、10 (10秒), 0:10 (0分10秒), 01:10:20 (1時間10分20秒)形式で入力できます。",
			);
			return true;
		}
		if (!isValidTimestamp(param.end_time || "")) {
			toast.error(
				"終了時間は、10 (10秒), 0:10 (0分10秒), 01:10:20 (1時間10分20秒)形式で入力できます。",
			);
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
		const processId = (await invoke("run_command", {
			param: {
				is_cookie: param.is_cookie,
				output_name: param.output_name,
				start_time: startTime,
				end_time: endTime,
				arbitrary_code: arbitraryCode,
				kind: currentSelectedIndex,
			},
		})) as number;
		setPid(processId);
	}, [arbitraryCode, hasInvalidTimestamp, param]);

	const runCommandFromUrl = useCallback(
		async (urlInput: string, queueIndex?: number) => {
			const currentSelectedIndex = selectedIndexRef.current;
			const startTime = normalizeTimestamp(param.start_time || "");
			const endTime = normalizeTimestamp(param.end_time || "");
			if (startTime === null || endTime === null) {
				toast.error("開始時間/終了時間の形式が不正です。");
				throw new Error("invalid_timestamp");
			}
			if (!urlInput || urlInput.trim() === "") {
				toast.error("URLが空です。");
				throw new Error("empty_url");
			}
			const url = cleanDownloadUrl(urlInput);
			if (url === null) {
				toast.error(
					`"${shortenText(urlInput, 100)}"は有効なURLではありません。`,
				);
				throw new Error("invalid_url");
			}
			const processId = (await invoke("run_command", {
				param: {
					...param,
					output_name: resolveOutputName(param.output_name || "", queueIndex),
					start_time: startTime,
					end_time: endTime,
					url,
					kind: currentSelectedIndex,
				},
			})) as number;
			setPid(processId);
		},
		[param],
	);

	const executeButtonOnClick = useCallback(
		async (urlInput: string) => {
			const currentSelectedIndex = selectedIndexRef.current;
			if (hasInvalidTimestamp()) {
				return;
			}
			if (currentSelectedIndex === 13) {
				try {
					await runArbitraryCommand();
				} catch (err) {
					toast.error(`エラー: ${err}`);
				}
				return;
			}

			const queueInput = parseQueueItems(urlQueueText);
			const isQueueMode = queueInput.length > 0;

			const urls = queueInput.length > 0 ? queueInput : [urlInput];
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

			queueStateRef.current = {
				active: true,
				index: 0,
				items: urls,
			};
			setQueueProgress({ current: 1, total: urls.length });
			const queueIndex = isQueueMode ? 0 : undefined;

			try {
				await runCommandFromUrl(urls[0] ?? "", queueIndex);
			} catch {
				resetQueueState();
			}
		},
		[
			runArbitraryCommand,
			runCommandFromUrl,
			resetQueueState,
			urlQueueText,
			hasInvalidTimestamp,
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

		queueStateRef.current = {
			...queueStateRef.current,
			index: nextIndex,
		};
		setQueueProgress((prev) => ({ current: nextIndex + 1, total: prev.total }));
		void runCommandFromUrl(
			queueStateRef.current.items[nextIndex] ?? "",
			nextIndex,
		).catch((err) => {
			toast.error(`エラー: ${err}`);
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
			const data = event.payload;
			try {
				const dataJson = JSON.parse(data);
				const url = dataJson.url;
				executeButtonOnClick(url);
			} catch (err) {
				toast.error(`エラー: ${err}`);
			}
		});

		return () => {
			unlistenOutput.then((fn) => fn());
			unlistenExit.then((fn) => fn());
			unlistenServerOutput.then((fn) => fn());
		};
	}, [executeButtonOnClick, runQueueNext, setLatestConsoleText]);

	const stopProcessHanlder = async () => {
		resetQueueState();
		await invoke("stop_command", { pid });
		setPid(null);
	};

	const openDirectory = async () => {
		await invoke("open_directory", { path: saveDir });
	};

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

	const queueProgressLabel =
		queueProgress.total > 0
			? ` キュー(${queueProgress.current}/${queueProgress.total})`
			: "";
	const isQueueRunning = queueProgress.total > 0;
	const usesCodecId = selectedIndexNumber === 8;
	const usesSubtitleLang = selectedIndexNumber === 12;
	const usesArbitraryCode = selectedIndexNumber === 13;

	return (
		<div className="grid h-full min-h-0 grid-rows-[auto_auto_minmax(0,1fr)] gap-3 overflow-hidden bg-base-100 p-3 text-base-content">
			<section className="grid min-h-0 grid-cols-[minmax(0,1fr)_260px] gap-3 rounded-lg border border-base-300 bg-base-200 p-3 shadow-sm">
				<div className="grid min-w-0 gap-3">
					<div className="flex items-center justify-between gap-3">
						<div className="flex min-w-0 items-center gap-3">
							<h2 className="shrink-0 text-sm font-semibold">ダウンロード</h2>
							{pid !== null ? (
								<div className="flex items-center gap-2">
									<span className="badge badge-error badge-outline">
										PID {pid}
										{queueProgressLabel}
									</span>
									<button
										className="btn btn-error btn-xs"
										type="button"
										onClick={() => {
											void stopProcessHanlder();
										}}
									>
										中止
									</button>
								</div>
							) : (
								<span className="badge badge-ghost border-base-300 text-base-content/60">
									待機中
								</span>
							)}
						</div>
						<div className="flex shrink-0 items-center gap-2">
							<button
								className="btn btn-outline btn-sm h-8 min-h-8 rounded-md"
								type="button"
								onClick={openDirectory}
							>
								<FolderOpen size={16} />
								保存先
							</button>
							<label className="flex h-8 items-center gap-2 rounded-md border border-base-300 bg-base-100 px-3 text-sm">
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
					</div>
					<div className="grid grid-cols-[minmax(0,1fr)_minmax(240px,320px)_auto] gap-2">
						<input
							className="input input-bordered h-11 w-full rounded-md bg-base-100 text-sm placeholder:text-base-content/35 focus:outline-primary"
							value={urlInput}
							onChange={(event) => setUrlInput(event.target.value)}
							onKeyDown={(event) => {
								if (event.key === "Enter") {
									void executeFromPrimaryInput();
								}
							}}
							placeholder="https://www.youtube.com/watch?v=..."
							type="url"
						/>
						<select
							className="select select-bordered h-11 min-h-11 w-full rounded-md bg-base-100 text-sm focus:outline-primary"
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
						<div className="flex gap-2">
							<button
								aria-label="前のモード"
								className="btn btn-outline h-11 min-h-11 w-11 rounded-md"
								disabled={!isSettingLoaded}
								type="button"
								onClick={() => moveDownloadMode(-1)}
							>
								<ChevronLeft size={18} />
							</button>
							<button
								aria-label="次のモード"
								className="btn btn-outline h-11 min-h-11 w-11 rounded-md"
								disabled={!isSettingLoaded}
								type="button"
								onClick={() => moveDownloadMode(1)}
							>
								<ChevronRight size={18} />
							</button>
						</div>
					</div>
				</div>
				<button
					className="btn btn-primary h-full min-h-24 rounded-md text-base font-bold shadow-sm"
					type="button"
					disabled={isQueueRunning || pid !== null}
					onClick={() => {
						void executeFromPrimaryInput();
					}}
				>
					<Download size={20} />
					<span className="whitespace-nowrap">クリップボードから実行</span>
				</button>
			</section>

			<section className="grid h-[190px] min-h-0 grid-cols-[minmax(320px,0.75fr)_minmax(560px,1.25fr)] gap-3">
				<label className="grid min-h-0 gap-2 rounded-lg border border-base-300 bg-base-200 p-3 shadow-sm">
					<span className="flex items-center gap-2 text-xs font-semibold text-base-content/60">
						<ListPlus size={14} />
						一括URLリスト
					</span>
					<textarea
						className="textarea textarea-bordered h-full min-h-0 w-full resize-none rounded-md bg-base-100 text-sm leading-5 placeholder:text-base-content/35 focus:outline-primary"
						value={urlQueueText}
						onChange={(event) => setUrlQueueText(event.target.value)}
						placeholder="改行またはカンマ区切り"
					/>
				</label>

				<div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-2 rounded-lg border border-base-300 bg-base-200 p-3 shadow-sm">
					<div className="flex items-center gap-2 text-xs font-semibold text-base-content/60">
						<Terminal size={14} />
						詳細設定
					</div>
					<div className="grid min-h-0 grid-cols-4 gap-2">
						<label className="grid gap-1">
							<span className="text-xs text-base-content/60">開始</span>
							<input
								className="input input-bordered h-10 w-full rounded-md bg-base-100 text-sm placeholder:text-base-content/35 focus:outline-primary"
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
							<span className="text-xs text-base-content/60">終了</span>
							<input
								className="input input-bordered h-10 w-full rounded-md bg-base-100 text-sm placeholder:text-base-content/35 focus:outline-primary"
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
						<label className="col-span-2 grid gap-1">
							<span className="text-xs text-base-content/60">
								出力ファイル名
							</span>
							<input
								className="input input-bordered h-10 w-full rounded-md bg-base-100 text-sm placeholder:text-base-content/35 focus:outline-primary"
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

						{usesCodecId && (
							<label className="col-span-2 grid gap-1">
								<span className="text-xs text-base-content/60">
									コーデックID
								</span>
								<input
									className="input input-bordered h-10 w-full rounded-md bg-base-100 text-sm focus:outline-primary"
									value={param.codec_id || ""}
									onChange={(event) =>
										setParam({ ...param, codec_id: event.target.value })
									}
									type="text"
								/>
							</label>
						)}

						{usesSubtitleLang && (
							<label className="col-span-2 grid gap-1">
								<span className="text-xs text-base-content/60">字幕言語</span>
								<input
									className="input input-bordered h-10 w-full rounded-md bg-base-100 text-sm focus:outline-primary"
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
						)}

						{usesArbitraryCode && (
							<label className="col-span-4 grid gap-1">
								<span className="text-xs text-base-content/60">任意コード</span>
								<input
									className="input input-bordered h-10 w-full rounded-md bg-base-100 text-sm focus:outline-primary"
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
						)}
					</div>
				</div>
			</section>
			<div className="min-h-0 overflow-hidden">
				<BottomTab consoleText={consoleText} />
			</div>
		</div>
	);
}
