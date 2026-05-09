import clsx from "clsx";
import type React from "react";
import { useState } from "react";
import ConsoleBox from "../ConsoleBox";
import CustomExplorer from "../CustomExplorer";

interface TabbedExplorerConsoleProps {
	consoleText: string;
}

const TabbedExplorerConsole: React.FC<TabbedExplorerConsoleProps> = ({
	consoleText,
}) => {
	const [activeTab, setActiveTab] = useState<"explorer" | "console">(
		"explorer",
	);

	return (
		<div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-base-300 bg-base-200 shadow-sm">
			<div className="flex gap-1 border-b border-base-300 bg-base-100 px-3 pt-2">
				<button
					className={clsx(
						"rounded-t-md border border-b-0 px-4 py-2 text-sm font-semibold transition-colors",
						activeTab === "explorer"
							? "border-primary bg-base-200 text-primary"
							: "border-transparent text-base-content/55 hover:bg-base-200 hover:text-base-content",
					)}
					onClick={() => setActiveTab("explorer")}
					type="button"
				>
					エクスプローラー
				</button>
				<button
					className={clsx(
						"rounded-t-md border border-b-0 px-4 py-2 text-sm font-semibold transition-colors",
						activeTab === "console"
							? "border-primary bg-base-200 text-primary"
							: "border-transparent text-base-content/55 hover:bg-base-200 hover:text-base-content",
					)}
					onClick={() => setActiveTab("console")}
					type="button"
				>
					コンソール
				</button>
			</div>
			<div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-base-200">
				{activeTab === "explorer" ? (
					<CustomExplorer />
				) : (
					<ConsoleBox consoleText={consoleText} />
				)}
			</div>
		</div>
	);
};

export default TabbedExplorerConsole;
