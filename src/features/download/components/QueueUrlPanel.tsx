import { ListPlus } from "lucide-react";
import { AppTextarea } from "../../../shared/components/FormControls";
import { PanelToggleButton } from "./PanelToggleButton";

type QueueUrlPanelProps = {
	isOpen: boolean;
	value: string;
	onToggle: () => void;
	onChange: (value: string) => void;
};

export function QueueUrlPanel({
	isOpen,
	value,
	onToggle,
	onChange,
}: QueueUrlPanelProps) {
	return (
		<div className="relative z-30">
			<PanelToggleButton
				className="flex h-10 w-full items-center gap-2 rounded-md bg-base-200 p-3 text-left text-xs font-semibold ring-1 transition"
				icon={<ListPlus size={14} />}
				isOpen={isOpen}
				label="一括URLリスト"
				onClick={onToggle}
			/>
			{isOpen ? (
				<div className="absolute top-12 right-0 left-0 z-50 grid gap-2 rounded-lg border border-primary/20 bg-base-100 p-3 shadow-xl ring-1 ring-base-300">
					<div className="flex items-center justify-between gap-3">
						<span className="text-xs text-base-content/50">
							改行またはカンマ区切り
						</span>
					</div>
					<AppTextarea
						className="h-28 min-h-28 w-full text-sm leading-5 break-normal"
						value={value}
						onChange={(event) => onChange(event.target.value)}
						placeholder="https://example.com/video1&#10;https://example.com/video2"
					/>
				</div>
			) : null}
		</div>
	);
}
