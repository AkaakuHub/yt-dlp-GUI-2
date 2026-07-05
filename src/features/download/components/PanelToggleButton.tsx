import type { ReactNode } from "react";
import { cn } from "../../../shared/utils/className";

type PanelToggleButtonProps = {
	isOpen: boolean;
	icon: ReactNode;
	label: string;
	className: string;
	onClick: () => void;
};

export function PanelToggleButton({
	isOpen,
	icon,
	label,
	className,
	onClick,
}: PanelToggleButtonProps) {
	return (
		<button
			className={cn(
				className,
				isOpen
					? "text-primary ring-primary/40"
					: "dark-control-ring text-base-content/65 ring-transparent hover:bg-base-300",
			)}
			type="button"
			onClick={onClick}
		>
			{icon}
			{label}
		</button>
	);
}
