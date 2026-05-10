import type { ReactNode } from "react";

type SurfaceIslandProps = {
	children: ReactNode;
	className?: string;
};

export function SurfaceIsland({
	children,
	className = "",
}: SurfaceIslandProps) {
	return (
		<section
			className={`min-w-0 overflow-hidden rounded-lg border border-base-300 bg-base-200 p-2 shadow-sm ${className}`}
		>
			{children}
		</section>
	);
}

type SurfacePanelProps = {
	children: ReactNode;
	className?: string;
};

export function SurfacePanel({ children, className = "" }: SurfacePanelProps) {
	return (
		<div className={`min-w-0 rounded-lg bg-base-100 p-3 ${className}`}>
			{children}
		</div>
	);
}
