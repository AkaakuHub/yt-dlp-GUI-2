import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
	getReservations,
	type ScheduledReservation,
} from "../../../shared/backend/runtime";

const formatDateTime = (timestampMs: number): string => {
	return new Intl.DateTimeFormat("ja-JP", {
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hour12: false,
	}).format(new Date(timestampMs));
};

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
			<div className="grid h-10 shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center border-b border-base-300 bg-base-200 px-3">
				<div className="text-sm font-semibold text-primary">予約一覧</div>
				<button
					className="btn btn-ghost h-8 min-h-8 w-8 rounded-md p-0"
					type="button"
					onClick={() => void refreshReservations()}
					aria-label="予約一覧を更新"
				>
					<RefreshCw size={16} />
				</button>
			</div>
			<div className="grid h-9 shrink-0 grid-cols-[10rem_7rem_minmax(0,1fr)_7rem_7rem] items-center gap-2 border-b border-base-300 bg-base-300/55 px-3 text-xs font-semibold text-base-content/55">
				<span>日時</span>
				<span>種別</span>
				<span>タイトル/URL</span>
				<span>状態</span>
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
					? reservations.map((reservation) => (
							<div
								key={reservation.id}
								className="grid h-11 grid-cols-[10rem_7rem_minmax(0,1fr)_7rem_7rem] items-center gap-2 border-b border-base-300 px-3 text-sm hover:bg-base-200"
							>
								<span className="font-mono text-xs">
									{formatDateTime(reservation.runAtMs)}
								</span>
								<span className="truncate">{reservation.kind}</span>
								<span className="min-w-0 truncate">
									{reservation.title || reservation.url}
								</span>
								<span>{reservation.status}</span>
								<span className="text-right font-mono text-xs">
									{reservation.id}
								</span>
							</div>
						))
					: null}
			</div>
		</section>
	);
}
