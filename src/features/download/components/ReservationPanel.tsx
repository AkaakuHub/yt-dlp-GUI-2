import { CalendarClock, RadioTower } from "lucide-react";
import { AppInput } from "../../../shared/components/FormControls";

type ReservationKind = "youtube" | "scheduledUrl";

type ReservationPanelProps = {
	kind: ReservationKind;
	scheduledAt: string;
	isBusy: boolean;
	onKindChange: (kind: ReservationKind) => void;
	onScheduledAtChange: (value: string) => void;
	onScheduleYoutube: () => void;
	onScheduleUrl: () => void;
};

export function ReservationPanel({
	kind,
	scheduledAt,
	isBusy,
	onKindChange,
	onScheduledAtChange,
	onScheduleYoutube,
	onScheduleUrl,
}: ReservationPanelProps) {
	return (
		<section className="grid gap-2 rounded-lg border border-base-300 bg-base-100 p-3">
			<div className="flex items-center gap-2 text-xs font-semibold text-base-content/65">
				<CalendarClock size={14} />
				録画予約
			</div>
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
					<span className="whitespace-nowrap text-[11px]">YouTubeライブ</span>
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
		</section>
	);
}
