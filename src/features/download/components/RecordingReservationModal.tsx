import {
	CalendarClock,
	Plus,
	RadioTower,
	RefreshCw,
	Satellite,
	Trash2,
	X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	type ChannelMonitorRule,
	getChannelMonitorRules,
} from "../../../shared/backend/runtime";
import { AppInput, AppTextarea } from "../../../shared/components/FormControls";
import { cn } from "../../../shared/utils/className";
import { DownloadModeSelector } from "./DownloadModeSelector";

export type ReservationKind = "youtube" | "scheduledUrl" | "channelMonitor";

type DownloadModeOption = {
	value: number;
	label: string;
};

type RecordingReservationModalProps = {
	isOpen: boolean;
	isBusy: boolean;
	kind: ReservationKind;
	modeOptions: readonly DownloadModeOption[];
	modeValue: number;
	scheduledAt: string;
	modeDisabled: boolean;
	onClose: () => void;
	onKindChange: (kind: ReservationKind) => void;
	onModeChange: (value: number) => void;
	onModeMove: (direction: -1 | 1) => void;
	onScheduleYoutube: () => void;
	onScheduleUrl: () => void;
	onScheduledAtChange: (value: string) => void;
	onCreateChannelMonitor: (request: ChannelMonitorFormValue) => Promise<void>;
};

export type ChannelMonitorFormValue = {
	title: string;
	channelUrl: string;
	schedules: ChannelMonitorScheduleFormValue[];
	includeWords: string[];
	excludeWords: string[];
};

export type ChannelMonitorScheduleFormValue = {
	id: string;
	weekdays: number[];
	checkTime: string;
};

const weekdays = [
	{ value: 1, label: "月" },
	{ value: 2, label: "火" },
	{ value: 3, label: "水" },
	{ value: 4, label: "木" },
	{ value: 5, label: "金" },
	{ value: 6, label: "土" },
	{ value: 7, label: "日" },
] as const;

const tabs: { value: ReservationKind; label: string }[] = [
	{ value: "youtube", label: "YouTubeライブ" },
	{ value: "scheduledUrl", label: "日時指定" },
	{ value: "channelMonitor", label: "チャンネル監視" },
];

const splitWords = (value: string): string[] =>
	value
		.split(/[,\n]+/)
		.map((word) => word.trim())
		.filter((word) => word !== "");

const formatDateTime = (timestampMs: number): string =>
	new Intl.DateTimeFormat("ja-JP", {
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
	}).format(new Date(timestampMs));

const createScheduleRow = (id: string): ChannelMonitorScheduleFormValue => ({
	id,
	weekdays: [1, 5],
	checkTime: "19:00",
});

const formatSchedule = (schedule: {
	weekdays: number[];
	checkTime: string;
}) => {
	const weekdayLabels = weekdays
		.filter((weekday) => schedule.weekdays.includes(weekday.value))
		.map((weekday) => weekday.label)
		.join("");
	return `${weekdayLabels} ${schedule.checkTime}`;
};

export function RecordingReservationModal({
	isOpen,
	isBusy,
	kind,
	modeOptions,
	modeValue,
	scheduledAt,
	modeDisabled,
	onClose,
	onKindChange,
	onModeChange,
	onModeMove,
	onScheduleYoutube,
	onScheduleUrl,
	onScheduledAtChange,
	onCreateChannelMonitor,
}: RecordingReservationModalProps) {
	const nextScheduleIdRef = useRef(1);
	const buildScheduleRow = useCallback((): ChannelMonitorScheduleFormValue => {
		const scheduleId = `schedule-${nextScheduleIdRef.current}`;
		nextScheduleIdRef.current += 1;
		return createScheduleRow(scheduleId);
	}, []);
	const [title, setTitle] = useState("");
	const [channelUrl, setChannelUrl] = useState("");
	const [schedules, setSchedules] = useState<ChannelMonitorScheduleFormValue[]>(
		() => [buildScheduleRow()],
	);
	const [includeWords, setIncludeWords] = useState("");
	const [excludeWords, setExcludeWords] = useState("");
	const [monitorRules, setMonitorRules] = useState<ChannelMonitorRule[]>([]);
	const [isLoadingRules, setIsLoadingRules] = useState(false);

	const refreshMonitorRules = useCallback(async () => {
		setIsLoadingRules(true);
		try {
			setMonitorRules(await getChannelMonitorRules());
		} finally {
			setIsLoadingRules(false);
		}
	}, []);

	useEffect(() => {
		if (isOpen) {
			void refreshMonitorRules();
		}
	}, [isOpen, refreshMonitorRules]);

	if (!isOpen) {
		return null;
	}

	const toggleWeekday = (scheduleId: string, weekday: number) => {
		setSchedules((prev) =>
			prev.map((schedule) =>
				schedule.id === scheduleId
					? {
							...schedule,
							weekdays: schedule.weekdays.includes(weekday)
								? schedule.weekdays.filter((value) => value !== weekday)
								: [...schedule.weekdays, weekday].sort((a, b) => a - b),
						}
					: schedule,
			),
		);
	};

	const updateScheduleTime = (scheduleId: string, checkTime: string) => {
		setSchedules((prev) =>
			prev.map((schedule) =>
				schedule.id === scheduleId ? { ...schedule, checkTime } : schedule,
			),
		);
	};

	const addSchedule = () => {
		setSchedules((prev) => [...prev, buildScheduleRow()]);
	};

	const deleteSchedule = (scheduleId: string) => {
		setSchedules((prev) => {
			if (prev.length === 1) {
				return prev;
			}
			return prev.filter((schedule) => schedule.id !== scheduleId);
		});
	};

	const createMonitor = async () => {
		await onCreateChannelMonitor({
			title,
			channelUrl,
			schedules,
			includeWords: splitWords(includeWords),
			excludeWords: splitWords(excludeWords),
		});
		setTitle("");
		setChannelUrl("");
		setSchedules([buildScheduleRow()]);
		setIncludeWords("");
		setExcludeWords("");
		await refreshMonitorRules();
	};

	return (
		<div className="fixed inset-2 z-[100] grid bg-base-content/25 backdrop-blur-sm">
			<section className="grid h-full min-h-0 grid-rows-[2.75rem_2.75rem_minmax(0,1fr)] overflow-hidden rounded-lg border border-base-300 bg-base-100 shadow-xl">
				<header className="flex h-11 items-center justify-between border-b border-base-300 px-4">
					<div className="flex items-center gap-2 text-sm font-bold">
						<CalendarClock size={18} className="text-primary" />
						録画予約
					</div>
					<button
						className="btn btn-ghost h-8 min-h-8 w-8 rounded-md p-0"
						type="button"
						onClick={onClose}
						aria-label="閉じる"
					>
						<X size={18} />
					</button>
				</header>

				<nav className="grid h-11 grid-cols-3 border-b border-base-300 bg-base-200">
					{tabs.map((tab) => (
						<button
							key={tab.value}
							className={cn(
								"border-b-2 text-sm font-semibold",
								kind === tab.value
									? "border-primary bg-base-100 text-primary"
									: "border-transparent text-base-content/60 hover:bg-base-300/60 hover:text-base-content",
							)}
							type="button"
							onClick={() => onKindChange(tab.value)}
						>
							{tab.label}
						</button>
					))}
				</nav>

				<div className="min-h-0 overflow-hidden p-3">
					{kind === "youtube" ? (
						<section className="grid h-full min-h-0 place-items-center">
							<button
								className="btn btn-primary h-12 min-h-12 w-full max-w-xl rounded-md text-base"
								type="button"
								disabled={isBusy}
								onClick={onScheduleYoutube}
							>
								<RadioTower size={18} />
								開始時刻を解析して予約
							</button>
						</section>
					) : null}

					{kind === "scheduledUrl" ? (
						<section className="mx-auto grid h-full min-h-0 max-w-2xl content-center gap-3">
							<DownloadModeSelector
								disabled={modeDisabled}
								options={modeOptions}
								value={modeValue}
								onChange={onModeChange}
								onMove={onModeMove}
							/>
							<div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_8rem]">
								<AppInput
									className="h-10 min-h-10 bg-base-200"
									value={scheduledAt}
									onChange={(event) => onScheduledAtChange(event.target.value)}
									type="datetime-local"
								/>
								<button
									className="btn btn-primary h-10 min-h-10 rounded-md text-sm"
									type="button"
									disabled={isBusy}
									onClick={onScheduleUrl}
								>
									予約
								</button>
							</div>
						</section>
					) : null}

					{kind === "channelMonitor" ? (
						<section className="grid h-full min-h-0 gap-3 overflow-hidden lg:grid-cols-[minmax(0,0.56fr)_minmax(0,0.44fr)]">
							<div className="grid min-h-0 content-start gap-2">
								<DownloadModeSelector
									disabled={modeDisabled}
									options={modeOptions}
									value={modeValue}
									onChange={onModeChange}
									onMove={onModeMove}
								/>
								<AppInput
									className="h-9 min-h-9"
									value={title}
									onChange={(event) => setTitle(event.target.value)}
									placeholder="監視名"
								/>
								<AppInput
									className="h-9 min-h-9"
									value={channelUrl}
									onChange={(event) => setChannelUrl(event.target.value)}
									placeholder="YouTubeチャンネルURL"
									type="url"
								/>

								<div className="rounded-md border border-base-300">
									<div className="grid h-10 grid-cols-[minmax(0,1fr)_auto] items-center border-b border-base-300 bg-base-200 px-3">
										<div className="text-xs font-semibold text-base-content/65">
											監視スケジュール
										</div>
										<button
											className="btn btn-ghost h-8 min-h-8 rounded-md bg-base-100 px-2 text-xs hover:bg-base-300"
											type="button"
											onClick={addSchedule}
										>
											<Plus size={14} />
											追加
										</button>
									</div>
									<div className="max-h-44 overflow-auto p-2">
										{schedules.map((schedule) => (
											<div
												key={schedule.id}
												className="mb-2 grid grid-cols-[minmax(0,1fr)_5.75rem_2rem] items-center gap-1 last:mb-0"
											>
												<div className="grid grid-cols-7 gap-1">
													{weekdays.map((weekday) => (
														<button
															key={weekday.value}
															className={cn(
																"btn h-8 min-h-8 rounded-md p-0 text-xs leading-none",
																schedule.weekdays.includes(weekday.value)
																	? "btn-primary"
																	: "btn-ghost bg-base-200 hover:bg-base-300",
															)}
															type="button"
															onClick={() =>
																toggleWeekday(schedule.id, weekday.value)
															}
														>
															{weekday.label}
														</button>
													))}
												</div>
												<AppInput
													className="h-8 min-h-8 bg-base-200"
													value={schedule.checkTime}
													onChange={(event) =>
														updateScheduleTime(schedule.id, event.target.value)
													}
													type="time"
												/>
												<button
													className="btn btn-ghost h-8 min-h-8 w-8 rounded-md bg-base-200 p-0 hover:bg-base-300"
													type="button"
													disabled={schedules.length === 1}
													onClick={() => deleteSchedule(schedule.id)}
													aria-label="監視スケジュールを削除"
												>
													<Trash2 size={14} />
												</button>
											</div>
										))}
									</div>
								</div>

								<div className="grid gap-2 sm:grid-cols-2">
									<AppTextarea
										className="h-16 min-h-16"
										value={includeWords}
										onChange={(event) => setIncludeWords(event.target.value)}
										placeholder="含むワード。改行またはカンマ区切り"
									/>
									<AppTextarea
										className="h-16 min-h-16"
										value={excludeWords}
										onChange={(event) => setExcludeWords(event.target.value)}
										placeholder="含まないワード。改行またはカンマ区切り"
									/>
								</div>
								<button
									className="btn btn-primary h-10 min-h-10 rounded-md text-sm"
									type="button"
									disabled={isBusy}
									onClick={() => void createMonitor()}
								>
									<Satellite size={16} />
									監視を追加
								</button>
							</div>

							<section className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-md border border-base-300">
								<div className="flex h-10 items-center justify-between border-b border-base-300 bg-base-200 px-3">
									<div className="text-xs font-semibold text-base-content/65">
										監視ルール
									</div>
									<button
										className="btn btn-ghost h-8 min-h-8 w-8 rounded-md p-0"
										type="button"
										onClick={() => void refreshMonitorRules()}
										aria-label="監視ルールを更新"
									>
										<RefreshCw
											size={15}
											className={isLoadingRules ? "animate-spin" : ""}
										/>
									</button>
								</div>
								<div className="min-h-0 overflow-auto">
									{monitorRules.length === 0 ? (
										<div className="grid h-full min-h-24 place-items-center text-sm text-base-content/45">
											監視なし
										</div>
									) : (
										monitorRules.map((rule) => (
											<div
												key={rule.id}
												className="grid gap-1 border-b border-base-300 px-3 py-2 text-sm"
											>
												<div className="flex min-w-0 items-center justify-between gap-3">
													<span className="min-w-0 truncate font-semibold">
														{rule.title}
													</span>
													<span className="shrink-0 text-xs text-base-content/55">
														{formatDateTime(rule.nextCheckAtMs)}
													</span>
												</div>
												<div className="truncate text-xs text-base-content/60">
													{rule.channelUrl}
												</div>
												<div className="flex flex-wrap gap-1 text-[11px] text-base-content/60">
													<span>
														{rule.schedules.map(formatSchedule).join(" / ")}
													</span>
													<span>{rule.status}</span>
												</div>
											</div>
										))
									)}
								</div>
							</section>
						</section>
					) : null}
				</div>
			</section>
		</div>
	);
}
