import type React from "react";
import ConsoleBox from "../ConsoleBox";
import CustomExplorer from "../CustomExplorer";

interface TabbedExplorerConsoleProps {
	consoleText: string;
}

const TabbedExplorerConsole: React.FC<TabbedExplorerConsoleProps> = ({
	consoleText,
}) => {
	return (
		<div className="grid h-full min-h-0 grid-cols-[minmax(0,1.45fr)_minmax(360px,0.55fr)] gap-3 overflow-hidden">
			<section className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-base-300 bg-base-200 shadow-sm">
				<div className="flex h-11 shrink-0 items-center border-b border-base-300 bg-base-100 px-4 text-sm font-semibold text-primary">
					エクスプローラー
				</div>
				<div className="min-h-0 flex-1 overflow-hidden">
					<CustomExplorer />
				</div>
			</section>
			<section className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-base-300 bg-base-200 shadow-sm">
				<div className="flex h-11 shrink-0 items-center border-b border-base-300 bg-base-100 px-4 text-sm font-semibold text-primary">
					コンソール
				</div>
				<div className="min-h-0 flex-1 overflow-hidden">
					<ConsoleBox consoleText={consoleText} />
				</div>
			</section>
		</div>
	);
};

export default TabbedExplorerConsole;
