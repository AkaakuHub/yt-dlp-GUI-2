import { CalendarClock, RadioTower } from "lucide-react";
import { AppInput } from "../../../shared/components/FormControls";
import { PanelToggleButton } from "./PanelToggleButton";

type ReservationKind = "youtube" | "scheduledUrl";

type ReservationPanelProps = {
	isOpen: boolean;
	kind: ReservationKind;
	scheduledAt: string;
	isBusy: boolean;
	onToggle: () => void;
	onKindChange: (kind: ReservationKind) => void;
	onScheduledAtChange: (value: string) => void;
	onScheduleYoutube: () => void;
	onScheduleUrl: () => void;
};

export function ReservationPanel({
	isOpen,
	kind,
	scheduledAt,
	isBusy,
	onToggle,
	onKindChange,
	onScheduledAtChange,
	onScheduleYoutube,
	onScheduleUrl,
}: ReservationPanelProps) {
	return (
		<div className="relative">
			<PanelToggleButton
				className="flex h-10 w-full items-center gap-2 rounded-md bg-base-100 px-3 text-left text-xs font-semibold ring-1 transition"
				icon={<CalendarClock size={14} />}
				isOpen={isOpen}
				label="録画予約"
				onClick={onToggle}
			/>
			{isOpen ? (
				<div className="absolute top-12 right-0 left-0 z-50 grid gap-3 rounded-lg border border-primary/20 bg-base-100 p-3 shadow-xl ring-1 ring-base-300">
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
					{kind === "scheduledUrl" ? (
						<AppInput
							className="h-10 min-h-10 bg-base-200"
							value={scheduledAt}
							onChange={(event) => onScheduledAtChange(event.target.value)}
							type="datetime-local"
						/>
					) : null}
					<button
						className="btn btn-primary h-10 min-h-10 rounded-md text-sm"
						type="button"
						disabled={isBusy}
						onClick={kind === "youtube" ? onScheduleYoutube : onScheduleUrl}
					>
						予約
					</button>
				</div>
			) : null}
		</div>
	);
}
