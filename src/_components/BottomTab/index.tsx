import ConsoleBox from "../ConsoleBox";
import CustomExplorer from "../CustomExplorer";

interface WorkspaceProps {
	consoleText: string;
}

export default function Workspace({ consoleText }: WorkspaceProps) {
	return (
		<div className="grid h-full min-h-0 gap-2 overflow-hidden md:grid-cols-[minmax(0,1fr)_minmax(260px,34%)]">
			<section className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-base-300 bg-base-200">
				<header className="flex h-10 shrink-0 items-center border-b border-base-300 bg-base-100 px-3 text-sm font-semibold text-primary">
					エクスプローラー
				</header>
				<div className="min-h-0 flex-1 overflow-hidden">
					<CustomExplorer />
				</div>
			</section>
			<section className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-base-300 bg-base-200">
				<header className="flex h-10 shrink-0 items-center border-b border-base-300 bg-base-100 px-3 text-sm font-semibold text-primary">
					コンソール
				</header>
				<div className="min-h-0 flex-1 overflow-hidden">
					<ConsoleBox consoleText={consoleText} />
				</div>
			</section>
		</div>
	);
}
