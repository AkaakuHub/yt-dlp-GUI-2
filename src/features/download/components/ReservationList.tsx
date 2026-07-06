import {
	AlertTriangle,
	CheckCircle2,
	CircleDashed,
	Clock3,
	RefreshCw,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
	getReservations,
	type ScheduledReservation,
} from "../../../shared/backend/runtime";
import { cn } from "../../../shared/utils/className";

const formatDate = (timestampMs: number): string => {
	return new Intl.DateTimeFormat("ja-JP", {
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		weekday: "short",
	}).format(new Date(timestampMs));
};

const formatTime = (timestampMs: number): string => {
	return new Intl.DateTimeFormat("ja-JP", {
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hour12: false,
	}).format(new Date(timestampMs));
};

type BadgeView = {
	icon: typeof CircleDashed;
	className: string;
	label: string;
};

const statusView = (status: string): BadgeView => {
	switch (status) {
		case "予約中":
			return {
				icon: Clock3,
				className: "border-info/45 bg-info/10 text-info",
				label: status,
			};
		case "実行中":
			return {
				icon: CircleDashed,
				className: "border-warning/45 bg-warning/15 text-warning",
				label: status,
			};
		case "完了":
		case "実行済み":
			return {
				icon: CheckCircle2,
				className: "border-base-content/20 bg-base-200 text-base-content/70",
				label: status,
			};
		default:
			return {
				icon: CircleDashed,
				className: "border-base-content/20 bg-base-200 text-base-content/65",
				label: status,
			};
	}
};

const resultView = (reservation: ScheduledReservation): BadgeView => {
	switch (reservation.result) {
		case "成功":
			return {
				icon: CheckCircle2,
				className: "border-success/45 bg-success/15 text-success",
				label: "成功",
			};
		case "失敗":
			return {
				icon: AlertTriangle,
				className: "border-error/50 bg-error/15 text-error",
				label: "失敗",
			};
		default:
			return {
				icon: CircleDashed,
				className: "border-base-content/20 bg-base-200 text-base-content/55",
				label: reservation.result,
			};
	}
};

const reservationToneClass = (reservation: ScheduledReservation): string => {
	if (reservation.result === "失敗") {
		return "border-l-error bg-error/5";
	}
	if (reservation.result === "成功") {
		return "border-l-success bg-success/5";
	}
	if (reservation.status === "実行中") {
		return "border-l-warning bg-warning/5";
	}
	if (reservation.status === "予約中") {
		return "border-l-info bg-info/5";
	}
	return "border-l-base-300";
};

function StatusBadge({ view }: { view: BadgeView }) {
	const Icon = view.icon;
	return (
		<span
			className={cn(
				"inline-flex h-7 min-w-0 items-center justify-center gap-1 rounded-md border px-2 text-xs font-semibold",
				view.className,
			)}
		>
			<Icon size={13} className="shrink-0" />
			<span className="truncate">{view.label}</span>
		</span>
	);
}

export function ReservationList() {
	const [reservations, setReservations] = useState<ScheduledReservation[]>([]);
	const [errorText, setErrorText] = useState("");

	const refreshReservations = useCallback(async () => {
		try {
			setErrorText("");
			const nextReservations = await getReservations();
			setReservations(
				[...nextReservations].sort((a, b) => a.runAtMs - b.runAtMs),
			);
		} catch (error) {
			setErrorText(`予約一覧を取得できません:${String(error)}`);
		}
	}, []);

	useEffect(() => {
		void refreshReservations();
		const intervalId = window.setInterval(() => {
			void refreshReservations();
		}, 5000);
		return () => window.clearInterval(intervalId);
	}, [refreshReservations]);

	return (
		<section className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-base-300 bg-base-100">
			<div className="grid h-11 shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center border-b border-base-300 bg-base-200 px-3">
				<div className="grid gap-0.5">
					<div className="text-sm font-semibold text-primary">予約一覧</div>
					<div className="text-[11px] text-base-content/45">
						{reservations.length}件
					</div>
				</div>
				<button
					className="btn btn-ghost h-8 min-h-8 w-8 rounded-md p-0"
					type="button"
					onClick={() => void refreshReservations()}
					aria-label="予約一覧を更新"
				>
					<RefreshCw size={16} />
				</button>
			</div>
			<div className="grid h-9 shrink-0 grid-cols-[11rem_8rem_minmax(0,1fr)_7rem_7rem_4rem] items-center gap-2 border-b border-base-300 bg-base-300/70 px-3 text-xs font-semibold text-base-content/65">
				<span>予約時刻</span>
				<span>種別</span>
				<span>タイトル/URL</span>
				<span>状態</span>
				<span>結果</span>
				<span className="text-right">ID</span>
			</div>
			<div className="min-h-0 flex-1 overflow-auto">
				{errorText ? (
					<div className="grid h-full place-items-center text-sm text-error">
						{errorText}
					</div>
				) : null}
				{!errorText && reservations.length === 0 ? (
					<div className="grid h-full place-items-center text-sm text-base-content/45">
						予約なし
					</div>
				) : null}
				{!errorText
					? reservations.map((reservation) => {
							const currentStatusView = statusView(reservation.status);
							const currentResultView = resultView(reservation);
							const title = reservation.title || reservation.url;
							return (
								<div
									key={reservation.id}
									className={cn(
										"grid min-h-[4.25rem] grid-cols-[11rem_8rem_minmax(0,1fr)_7rem_7rem_4rem] items-center gap-2 border-b border-l-4 border-base-300 px-3 py-2 text-sm hover:bg-base-200/70",
										reservationToneClass(reservation),
									)}
								>
									<div className="grid gap-0.5 font-mono">
										<span className="text-xs text-base-content/60">
											{formatDate(reservation.runAtMs)}
										</span>
										<span className="text-sm font-semibold text-base-content">
											{formatTime(reservation.runAtMs)}
										</span>
									</div>
									<span className="inline-flex h-7 min-w-0 items-center rounded-md bg-base-200 px-2 text-xs font-semibold text-base-content/70">
										<span className="truncate">{reservation.kind}</span>
									</span>
									<div className="min-w-0">
										<div className="truncate text-sm font-semibold text-base-content">
											{title}
										</div>
										{reservation.url !== "" && title !== reservation.url ? (
											<div className="truncate text-xs text-base-content/45">
												{reservation.url}
											</div>
										) : null}
									</div>
									<StatusBadge view={currentStatusView} />
									<StatusBadge view={currentResultView} />
									<span className="text-right font-mono text-xs text-base-content/45">
										{reservation.id}
									</span>
									{reservation.result === "失敗" &&
									reservation.errorMessage !== "" ? (
										<div className="col-span-6 min-w-0 rounded-md border border-error/30 bg-error/10 px-2 py-1 text-xs font-medium text-error">
											{reservation.errorMessage}
										</div>
									) : null}
								</div>
							);
						})
					: null}
			</div>
		</section>
	);
}
