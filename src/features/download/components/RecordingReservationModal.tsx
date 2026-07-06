import {
	CalendarClock,
	RadioTower,
	RefreshCw,
	Satellite,
	X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
	type ChannelMonitorRule,
	getChannelMonitorRules,
} from "../../../shared/backend/runtime";
import { AppInput, AppTextarea } from "../../../shared/components/FormControls";
import { DownloadModeSelector } from "./DownloadModeSelector";

type ReservationKind = "youtube" | "scheduledUrl";
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
	weekdays: number[];
	checkTime: string;
	includeWords: string[];
	excludeWords: string[];
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
	const [title, setTitle] = useState("");
	const [channelUrl, setChannelUrl] = useState("");
	const [selectedWeekdays, setSelectedWeekdays] = useState<number[]>([1, 5]);
	const [checkTime, setCheckTime] = useState("19:00");
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

	const toggleWeekday = (weekday: number) => {
		setSelectedWeekdays((prev) =>
			prev.includes(weekday)
				? prev.filter((value) => value !== weekday)
				: [...prev, weekday].sort((a, b) => a - b),
		);
	};

	const createMonitor = async () => {
		await onCreateChannelMonitor({
			title,
			channelUrl,
			weekdays: selectedWeekdays,
			checkTime,
			includeWords: splitWords(includeWords),
			excludeWords: splitWords(excludeWords),
		});
		setTitle("");
		setChannelUrl("");
		setIncludeWords("");
		setExcludeWords("");
		await refreshMonitorRules();
	};

	return (
		<div className="fixed inset-2 z-[100] grid bg-base-content/25 p-0 backdrop-blur-sm">
			<section className="grid h-full min-h-0 w-full grid-rows-[2.75rem_minmax(0,1fr)] overflow-hidden rounded-lg border border-base-300 bg-base-100 shadow-xl">
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
				<div className="grid min-h-0 gap-3 overflow-hidden p-3 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
					<section className="grid min-h-0 content-start gap-2">
						<div className="text-xs font-semibold text-base-content/65">
							単発予約
						</div>
						<DownloadModeSelector
							disabled={modeDisabled}
							options={modeOptions}
							value={modeValue}
							onChange={onModeChange}
							onMove={onModeMove}
						/>
						<div className="grid grid-cols-2 gap-2">
							<button
								className={`btn h-9 min-h-9 rounded-md text-xs ${
									kind === "youtube"
										? "btn-primary"
										: "btn-ghost bg-base-200 hover:bg-base-300"
								}`}
								type="button"
								onClick={() => onKindChange("youtube")}
							>
								<RadioTower size={15} />
								YouTubeライブ
							</button>
							<button
								className={`btn h-9 min-h-9 rounded-md text-xs ${
									kind === "scheduledUrl"
										? "btn-primary"
										: "btn-ghost bg-base-200 hover:bg-base-300"
								}`}
								type="button"
								onClick={() => onKindChange("scheduledUrl")}
							>
								<CalendarClock size={15} />
								日時指定
							</button>
						</div>
						<div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_7rem]">
							{kind === "youtube" ? (
								<div className="grid h-9 min-h-9 items-center rounded-md border border-base-300 bg-base-200 px-3 text-sm text-base-content/60">
									URL解析
								</div>
							) : (
								<AppInput
									className="h-9 min-h-9 bg-base-200"
									value={scheduledAt}
									onChange={(event) => onScheduledAtChange(event.target.value)}
									type="datetime-local"
								/>
							)}
							<button
								className="btn btn-primary h-9 min-h-9 rounded-md text-sm"
								type="button"
								disabled={isBusy}
								onClick={kind === "youtube" ? onScheduleYoutube : onScheduleUrl}
							>
								予約
							</button>
						</div>

						<div className="mt-1 text-xs font-semibold text-base-content/65">
							チャンネル監視
						</div>
						<AppInput
							className="h-8 min-h-8"
							value={title}
							onChange={(event) => setTitle(event.target.value)}
							placeholder="監視名"
						/>
						<AppInput
							className="h-8 min-h-8"
							value={channelUrl}
							onChange={(event) => setChannelUrl(event.target.value)}
							placeholder="YouTubeチャンネルURL"
							type="url"
						/>
						<div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-2">
							<div className="grid grid-cols-7 gap-1">
								{weekdays.map((weekday) => (
									<button
										key={weekday.value}
										className={`btn h-9 min-h-9 rounded-md p-0 text-xs ${
											selectedWeekdays.includes(weekday.value)
												? "btn-primary"
												: "btn-ghost bg-base-200 hover:bg-base-300"
										}`}
										type="button"
										onClick={() => toggleWeekday(weekday.value)}
									>
										{weekday.label}
									</button>
								))}
							</div>
							<AppInput
								className="h-9 min-h-9 bg-base-200"
								value={checkTime}
								onChange={(event) => setCheckTime(event.target.value)}
								type="time"
							/>
						</div>
						<AppTextarea
							className="h-14 min-h-14"
							value={includeWords}
							onChange={(event) => setIncludeWords(event.target.value)}
							placeholder="含むワード。改行またはカンマ区切り"
						/>
						<AppTextarea
							className="h-14 min-h-14"
							value={excludeWords}
							onChange={(event) => setExcludeWords(event.target.value)}
							placeholder="含まないワード。改行またはカンマ区切り"
						/>
						<button
							className="btn btn-primary h-9 min-h-9 rounded-md text-sm"
							type="button"
							disabled={isBusy}
							onClick={() => void createMonitor()}
						>
							<Satellite size={16} />
							監視を追加
						</button>
					</section>

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
								<div className="grid h-24 place-items-center text-sm text-base-content/45">
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
											<span>{rule.checkTime}</span>
											<span>{rule.weekdays.join(",")}</span>
											<span>{rule.status}</span>
										</div>
									</div>
								))
							)}
						</div>
					</section>
				</div>
			</section>
		</div>
	);
}
