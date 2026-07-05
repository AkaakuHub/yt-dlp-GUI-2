import { useState } from "react";
import { cn } from "../../utils/className";
import ConsoleBox from "../ConsoleBox";
import type { ConsoleLogState } from "../ConsoleBox/consoleLog";
import FileExplorer from "../FileExplorer";

interface WorkspaceProps {
	consoleLog: ConsoleLogState;
}

export default function Workspace({ consoleLog }: WorkspaceProps) {
	const [activeTab, setActiveTab] = useState<"explorer" | "console">(
		"explorer",
	);

	return (
		<section className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-base-300 bg-base-200">
			<div className="grid h-10 shrink-0 grid-cols-2 border-b border-base-300 bg-base-100">
				<button
					className={cn(
						"text-sm font-semibold transition-colors",
						activeTab === "explorer"
							? "bg-base-200 text-primary"
							: "text-base-content/55 hover:bg-base-300",
					)}
					type="button"
					onClick={() => setActiveTab("explorer")}
				>
					エクスプローラー
				</button>
				<button
					className={cn(
						"text-sm font-semibold transition-colors",
						activeTab === "console"
							? "bg-base-200 text-primary"
							: "text-base-content/55 hover:bg-base-300",
					)}
					type="button"
					onClick={() => setActiveTab("console")}
				>
					コンソール
				</button>
			</div>
			<div className="min-h-0 flex-1 overflow-hidden">
				{activeTab === "explorer" ? (
					<FileExplorer />
				) : (
					<ConsoleBox consoleLog={consoleLog} />
				)}
			</div>
		</section>
	);
}
