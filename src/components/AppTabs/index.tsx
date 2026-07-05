import type React from "react";
import { cn } from "../../utils/className";

interface Props {
	tabNames: string[];
	setActiveIndex: React.Dispatch<React.SetStateAction<number>>;
	activeIndex: number;
}

export function AppTabs({ tabNames, setActiveIndex, activeIndex }: Props) {
	const handleChange = (newValue: number): void => {
		setActiveIndex(newValue);
	};

	return (
		<div className="border-b border-base-300 bg-base-200">
			<div className="grid grid-cols-2">
				{tabNames.map((tabName, index) => (
					<button
						key={tabName}
						className={cn(
							"h-14 border-b-2 text-sm font-semibold transition-colors",
							activeIndex === index
								? "border-primary bg-base-100 text-primary"
								: "border-transparent text-base-content/55 hover:bg-base-300/70 hover:text-base-content",
						)}
						onClick={() => handleChange(index)}
						type="button"
					>
						{tabName}
					</button>
				))}
			</div>
		</div>
	);
}
