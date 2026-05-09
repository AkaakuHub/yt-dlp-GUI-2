import type { ReactNode } from "react";

interface PrimaryCircleButtonProps {
	label: string;
	icon: ReactNode;
	disabled?: boolean;
	onClick: () => void;
}

export default function PrimaryCircleButton({
	label,
	icon,
	disabled = false,
	onClick,
}: PrimaryCircleButtonProps) {
	return (
		<button
			className="btn btn-primary aspect-square h-32 min-h-0 rounded-full text-lg font-bold shadow-md shadow-primary/25 ring-6 ring-base-200 transition-transform hover:scale-[1.02] active:scale-95 sm:h-36"
			type="button"
			disabled={disabled}
			onClick={onClick}
		>
			<span className="grid place-items-center gap-2">
				{icon}
				{label}
			</span>
		</button>
	);
}
