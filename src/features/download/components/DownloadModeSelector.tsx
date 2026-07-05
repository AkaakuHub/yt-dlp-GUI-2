import { ChevronLeft, ChevronRight } from "lucide-react";
import { AppSelect } from "../../../shared/components/FormControls";

type DownloadModeOption = {
	value: number;
	label: string;
};

type DownloadModeSelectorProps = {
	options: readonly DownloadModeOption[];
	value: number;
	disabled: boolean;
	onChange: (value: number) => void;
	onMove: (direction: -1 | 1) => void;
};

export function DownloadModeSelector({
	options,
	value,
	disabled,
	onChange,
	onMove,
}: DownloadModeSelectorProps) {
	return (
		<div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-2">
			<AppSelect
				className="h-10 min-h-10 w-full bg-base-200"
				disabled={disabled}
				value={value}
				onChange={(event) => onChange(Number(event.target.value))}
			>
				{options.map((mode) => (
					<option key={mode.value} value={mode.value}>
						{mode.label}
					</option>
				))}
			</AppSelect>
			<button
				aria-label="前のモード"
				className="btn btn-ghost h-10 min-h-10 w-10 rounded-md border border-base-300 bg-base-200 p-0 hover:border-base-content/25 hover:bg-base-300 focus:border-primary focus:outline-none"
				disabled={disabled}
				type="button"
				onClick={() => onMove(-1)}
			>
				<ChevronLeft size={18} />
			</button>
			<button
				aria-label="次のモード"
				className="btn btn-ghost h-10 min-h-10 w-10 rounded-md border border-base-300 bg-base-200 p-0 hover:border-base-content/25 hover:bg-base-300 focus:border-primary focus:outline-none"
				disabled={disabled}
				type="button"
				onClick={() => onMove(1)}
			>
				<ChevronRight size={18} />
			</button>
		</div>
	);
}
