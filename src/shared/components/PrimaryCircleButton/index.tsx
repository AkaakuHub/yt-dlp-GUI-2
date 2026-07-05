import type { ReactNode } from "react";
import { cn } from "../../utils/className";

interface PrimaryCircleButtonProps {
	label: string;
	icon: ReactNode;
	disabled?: boolean;
	tone?: "primary" | "danger";
	onClick: () => void;
}

export default function PrimaryCircleButton({
	label,
	icon,
	disabled = false,
	tone = "primary",
	onClick,
}: PrimaryCircleButtonProps) {
	const colorClass = disabled
		? "bg-base-300 text-base-content/45 shadow-base-300/25"
		: tone === "danger"
			? "bg-error text-error-content shadow-error/25 hover:bg-error/90"
			: "bg-primary text-primary-content shadow-primary/25 hover:bg-primary/90";

	const handleClick = () => {
		if (disabled) {
			return;
		}
		onClick();
	};

	return (
		<button
			aria-disabled={disabled}
			className={cn(
				"aspect-square h-32 min-h-0 scale-[1.02] rounded-full text-lg font-bold shadow-md ring-6 ring-base-200 transition-transform sm:h-36",
				colorClass,
				disabled ? "cursor-not-allowed" : "active:scale-95",
			)}
			type="button"
			onClick={handleClick}
		>
			<span className="grid place-items-center gap-2">
				{icon}
				{label}
			</span>
		</button>
	);
}
