import { readText } from "@tauri-apps/plugin-clipboard-manager";
import { Cookie, Download, FolderOpen, Square } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "react-toastify";
import { useAppContext } from "../../app/contexts/AppContext";
import {
	isTauriRuntime,
	openDownloadDirectory,
	scheduleDownload,
	scheduleYoutubeLiveFromStart,
	setDownloadModeSetting,
	setUseCookieSetting,
	startDownload,
	stopDownload,
	subscribeProcessEvents,
} from "../../shared/backend/runtime";
import ConsoleBox from "../../shared/components/ConsoleBox";
import {
	appendConsoleOutput,
	createConsoleLogState,
} from "../../shared/components/ConsoleBox/consoleLog";
import FileExplorer from "../../shared/components/FileExplorer";
import { AppInput } from "../../shared/components/FormControls";
import PrimaryCircleButton from "../../shared/components/PrimaryCircleButton";
import { SurfaceIsland, SurfacePanel } from "../../shared/components/Surface";
import { cn } from "../../shared/utils/className";
import { AdvancedDownloadPanel } from "./components/AdvancedDownloadPanel";
import { DownloadModeSelector } from "./components/DownloadModeSelector";
import { QueueUrlPanel } from "./components/QueueUrlPanel";
import { ReservationList } from "./components/ReservationList";
import { ReservationPanel } from "./components/ReservationPanel";
import {
	cleanDownloadUrl,
	DOWNLOAD_MODE,
	type DownloadParam,
	downloadModeOptions,
	isDownloadModeValue,
	isValidTimestamp,
	normalizeTimestamp,
	parseQueueItems,
	type RunCommandParam,
	resolveOutputName,
	shortenText,
	type TimestampField,
} from "./domain/downloadForm";
import { buildExecutionTargetPreview } from "./domain/executionTargetPreview";

const DOWNLOAD_STOPPED_MESSAGE = "プロセスを停止しました";
const downloadModes = downloadModeOptions;
const workspaceTabs = [
	"実行",
	"予約一覧",
	"エクスプローラー",
	"コンソール",
] as const;
type WorkspaceTab = (typeof workspaceTabs)[number];

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
	const [reservationKind, setReservationKind] = useState<
		"youtube" | "scheduledUrl"
	>("youtube");
	const [scheduledAt, setScheduledAt] = useState("");
	const [isScheduling, setIsScheduling] = useState(false);
	const [urlQueueText, setUrlQueueText] = useState("");
	const [showQueuePanel, setShowQueuePanel] = useState(false);
	const [activeWorkspaceTab, setActiveWorkspaceTab] =
		useState<WorkspaceTab>("実行");
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
		await setUseCookieSetting(nextUseCookie);
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

	const hasInvalidModeOption = useCallback((): boolean => {
		const currentSelectedIndex = selectedIndexRef.current;
		if (
			currentSelectedIndex === DOWNLOAD_MODE.codecId &&
			(param.codec_id || "").trim() === ""
		) {
			toast.error("IDを指定するモードではコーデックIDが必要です。");
			return true;
		}
		if (
			currentSelectedIndex === DOWNLOAD_MODE.subtitle &&
			(param.subtitle_lang || "").trim() === ""
		) {
			toast.error("字幕モードでは字幕言語が必要です。");
			return true;
		}
		return false;
	}, [param.codec_id, param.subtitle_lang]);

	const runArbitraryCommand = useCallback(async () => {
		const currentSelectedIndex = selectedIndexRef.current;
		if (!isDownloadModeValue(currentSelectedIndex)) {
			toast.error("不正なモードです。");
			return;
		}
		if (hasInvalidTimestamp()) {
			return;
		}
		if (hasInvalidModeOption()) {
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
		const processId = await startDownload(runParam);
		setPid(processId);
	}, [arbitraryCode, hasInvalidModeOption, hasInvalidTimestamp, param]);

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
			if (hasInvalidModeOption()) {
				throw new Error("invalid_mode_option");
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
			const processId = await startDownload(runParam);
			setPid(processId);
		},
		[hasInvalidModeOption, param],
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
			if (hasInvalidModeOption()) {
				return;
			}
			if (currentSelectedIndex === DOWNLOAD_MODE.arbitraryCode) {
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
			hasInvalidModeOption,
			resetQueueState,
			runArbitraryCommand,
			runCommandFromUrl,
			urlQueueText,
		],
	);

	const buildScheduledRunParam = useCallback((): RunCommandParam | null => {
		const currentSelectedIndex = selectedIndexRef.current;
		if (!isDownloadModeValue(currentSelectedIndex)) {
			toast.error("不正なモードです。");
			return null;
		}
		if (currentSelectedIndex === DOWNLOAD_MODE.arbitraryCode) {
			toast.error("任意コードは予約できません。");
			return null;
		}
		if (hasInvalidModeOption()) {
			return null;
		}
		const startTime = normalizeTimestamp(param.start_time || "");
		const endTime = normalizeTimestamp(param.end_time || "");
		if (startTime === null || endTime === null) {
			toast.error("開始時間/終了時間の形式が不正です。");
			return null;
		}
		const url = cleanDownloadUrl(urlInput);
		if (url === null) {
			toast.error("URLが空、または不正です。");
			return null;
		}
		return {
			...param,
			start_time: startTime,
			end_time: endTime,
			url,
			kind: currentSelectedIndex,
		};
	}, [hasInvalidModeOption, param, urlInput]);

	const scheduleCurrentDownload = useCallback(async () => {
		const runParam = buildScheduledRunParam();
		if (runParam === null) {
			return;
		}
		if (scheduledAt === "") {
			toast.error("予約時刻を入力してください。");
			return;
		}
		const runAtMs = new Date(scheduledAt).getTime();
		if (!Number.isFinite(runAtMs) || runAtMs <= Date.now()) {
			toast.error("予約時刻は現在より後にしてください。");
			return;
		}
		try {
			setIsScheduling(true);
			await scheduleDownload(runParam, runAtMs);
			toast.success("録画予約を追加しました。");
		} catch (err) {
			toast.error(`予約に失敗しました:${stringifyError(err)}`);
		} finally {
			setIsScheduling(false);
		}
	}, [buildScheduledRunParam, scheduledAt]);

	const scheduleYoutubeReservation = useCallback(async () => {
		const runParam = buildScheduledRunParam();
		if (runParam === null) {
			return;
		}
		const url = runParam.url || "";
		if (!/https?:\/\/([^/]+\.)?(youtube\.com|youtu\.be)\//.test(url)) {
			toast.error("YouTubeライブ予約にはYouTubeのURLが必要です。");
			return;
		}
		try {
			setIsScheduling(true);
			const reservation = await scheduleYoutubeLiveFromStart(runParam);
			const startsAt = new Date(reservation.runAtMs).toLocaleString();
			toast.success(`${reservation.title}を${startsAt}に予約しました。`);
		} catch (err) {
			toast.error(`YouTubeライブ予約に失敗しました:${stringifyError(err)}`);
		} finally {
			setIsScheduling(false);
		}
	}, [buildScheduledRunParam]);

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
		let unlisten: (() => void) | null = null;
		void subscribeProcessEvents({
			onOutput: (payload) => {
				if (payload === "") {
					return;
				}
				if (payload.includes("Destination:")) {
					latestDownloadDestinationRef.current = payload;
				}
				if (
					payload.startsWith("[download]") ||
					payload.startsWith("[Merger]") ||
					payload.startsWith("[Fixup")
				) {
					const progressPayload =
						latestDownloadDestinationRef.current &&
						payload.startsWith("[download]") &&
						!payload.includes("Destination:")
							? `${payload}\n${latestDownloadDestinationRef.current}`
							: payload;
					setLatestConsoleText(progressPayload);
				}
				setConsoleLog((prev) => appendConsoleOutput(prev, payload));
			},
			onExit: () => {
				const wasStopped = stopRequestedRef.current;
				stopRequestedRef.current = false;
				latestDownloadDestinationRef.current = "";
				setLatestConsoleText(wasStopped ? DOWNLOAD_STOPPED_MESSAGE : "");
				setPid(null);
				if (wasStopped) {
					return;
				}
				runQueueNext();
			},
		}).then((nextUnlisten) => {
			unlisten = nextUnlisten;
		});

		return () => {
			unlisten?.();
		};
	}, [runQueueNext, setLatestConsoleText]);

	const executeFromPrimaryInput = async () => {
		const inputUrl = urlInput.trim();
		let clipboardText = "";
		if (isTauriRuntime()) {
			try {
				clipboardText = (await readText()) || "";
			} catch (err) {
				toast.error(
					`クリップボードの読み取りに失敗しました:${stringifyError(err)}`,
				);
			}
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
			await stopDownload();
		} catch (error) {
			stopRequestedRef.current = false;
			toast.error(`停止に失敗しました:${stringifyError(error)}`);
			return;
		}
		setPid(null);
	};

	const openDirectory = async () => {
		await openDownloadDirectory(saveDir);
	};

	const persistDownloadMode = async (nextMode: number) => {
		if (!isSettingLoaded) {
			return;
		}
		setSelectedIndexNumber(nextMode);
		await setDownloadModeSetting(nextMode);
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
	const usesCodecId = selectedIndexNumber === DOWNLOAD_MODE.codecId;
	const usesSubtitleLang = selectedIndexNumber === DOWNLOAD_MODE.subtitle;
	const usesArbitraryCode = selectedIndexNumber === DOWNLOAD_MODE.arbitraryCode;
	const queueLabel =
		queueProgress.total > 0
			? `${queueProgress.current}/${queueProgress.total}`
			: "";
	const selectedModeLabel =
		downloadModes.find((mode) => mode.value === selectedIndexNumber)?.label ||
		"未選択";
	const executionTargetRows = buildExecutionTargetPreview(
		urlInput,
		urlQueueText,
	);
	const outputNameLabel = (param.output_name || "").trim() || "既定";
	const cookieLabel = param.is_cookie ? "使用" : "未使用";

	return (
		<div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-2 overflow-hidden bg-base-100 p-2 text-base-content">
			<div className="grid h-10 grid-cols-4 overflow-hidden rounded-lg border border-base-300 bg-base-200">
				{workspaceTabs.map((tab) => (
					<button
						key={tab}
						className={cn(
							"h-10 border-b-2 text-sm font-semibold transition-colors",
							activeWorkspaceTab === tab
								? "border-primary bg-base-100 text-primary"
								: "border-transparent text-base-content/55 hover:bg-base-300/70 hover:text-base-content",
						)}
						type="button"
						onClick={() => setActiveWorkspaceTab(tab)}
					>
						{tab}
					</button>
				))}
			</div>

			<div className="min-h-0 overflow-hidden">
				<div
					className={cn(
						activeWorkspaceTab === "実行"
							? "grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-2"
							: "hidden",
					)}
				>
					<SurfaceIsland>
						<div className="grid gap-2">
							<div className="relative grid gap-2 sm:min-h-40">
								<SurfacePanel className="z-10 grid gap-2 sm:absolute sm:top-0 sm:bottom-0 sm:left-0 sm:right-1/2 sm:pr-28">
									<div className="flex min-w-0 items-center justify-between gap-2">
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

								<SurfacePanel className="z-10 grid content-start gap-2 sm:absolute sm:top-0 sm:right-0 sm:left-1/2 sm:pl-28">
									<div className="grid grid-cols-2 gap-2">
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
												onChange={(event) =>
													void updateCookie(event.target.checked)
												}
											/>
											<Cookie size={15} />
											<span className="hidden lg:inline">クッキー</span>
										</label>
									</div>
								</SurfacePanel>

								<div className="z-30 sm:absolute sm:right-0 sm:bottom-0 sm:left-1/2 sm:pl-28">
									<QueueUrlPanel
										isOpen={showQueuePanel}
										value={urlQueueText}
										onChange={setUrlQueueText}
										onToggle={() => setShowQueuePanel((prev) => !prev)}
									/>
								</div>

								<div className="z-[60] grid place-items-center sm:absolute sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2">
									<PrimaryCircleButton
										label={pid === null ? "実行" : "中止"}
										icon={
											pid === null ? (
												<Download size={30} />
											) : (
												<Square size={26} />
											)
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

							<div className="grid gap-2 md:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)]">
								<AdvancedDownloadPanel
									arbitraryCode={arbitraryCode}
									param={param}
									usesArbitraryCode={usesArbitraryCode}
									usesCodecId={usesCodecId}
									usesSubtitleLang={usesSubtitleLang}
									onArbitraryCodeChange={setArbitraryCode}
									onExecuteArbitraryCode={() => void executeButtonOnClick("")}
									onParamChange={setParam}
									onValidateTimestamp={validateTimestamp}
								/>
								<ReservationPanel
									isBusy={isScheduling}
									kind={reservationKind}
									scheduledAt={scheduledAt}
									onKindChange={setReservationKind}
									onScheduleUrl={() => void scheduleCurrentDownload()}
									onScheduleYoutube={() => void scheduleYoutubeReservation()}
									onScheduledAtChange={setScheduledAt}
								/>
							</div>
						</div>
					</SurfaceIsland>
					<SurfaceIsland className="min-h-0 overflow-hidden p-0">
						<div className="grid h-full min-h-0 grid-rows-[auto_auto_minmax(0,1fr)] overflow-hidden">
							<div className="grid h-10 grid-cols-[5rem_11rem_minmax(0,1fr)_8rem_8rem] items-center border-b border-base-300 bg-base-200 px-3 text-xs font-semibold text-base-content/60">
								<span>状態</span>
								<span>種別</span>
								<span>URL</span>
								<span>Cookie</span>
								<span>出力</span>
							</div>
							<div className="grid h-9 grid-cols-[5rem_11rem_minmax(0,1fr)_8rem_8rem] items-center border-b border-base-300 bg-base-100 px-3 text-xs text-base-content/70">
								<span>{pid === null ? "未開始" : "実行中"}</span>
								<span className="truncate">{selectedModeLabel}</span>
								<span className="truncate text-base-content/45">
									{executionTargetRows.length}件
								</span>
								<span>{cookieLabel}</span>
								<span className="truncate">{outputNameLabel}</span>
							</div>
							<div className="min-h-0 overflow-auto">
								{executionTargetRows.map((row) => {
									const isCurrentQueueRow =
										pid !== null &&
										queueProgress.total > 0 &&
										queueProgress.current === row.index + 1;
									return (
										<div
											key={row.id}
											className="grid h-9 grid-cols-[5rem_11rem_minmax(0,1fr)_8rem_8rem] items-center border-b border-base-300 px-3 text-xs hover:bg-base-200/60"
										>
											<span>{isCurrentQueueRow ? "実行中" : "未開始"}</span>
											<span className="truncate">
												{row.source === "queue"
													? `一括 ${row.index + 1}`
													: "単発"}
											</span>
											<span className="truncate text-base-content/80">
												{row.url}
											</span>
											<span>{cookieLabel}</span>
											<span className="truncate">{outputNameLabel}</span>
										</div>
									);
								})}
							</div>
						</div>
					</SurfaceIsland>
				</div>
				<div
					className={cn(
						activeWorkspaceTab === "予約一覧" ? "h-full min-h-0" : "hidden",
					)}
				>
					<ReservationList />
				</div>
				<div
					className={cn(
						activeWorkspaceTab === "エクスプローラー"
							? "h-full min-h-0"
							: "hidden",
					)}
				>
					<FileExplorer />
				</div>
				<div
					className={cn(
						activeWorkspaceTab === "コンソール" ? "h-full min-h-0" : "hidden",
					)}
				>
					<ConsoleBox consoleLog={consoleLog} />
				</div>
			</div>
		</div>
	);
}
