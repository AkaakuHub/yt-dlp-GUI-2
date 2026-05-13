export type ToolDownloadProgressValue = {
	tool_name: string;
	progress: number;
	status: string;
};

type ToolDownloadProgressProps = {
	progress: ToolDownloadProgressValue;
	className?: string;
	tone?: "base" | "muted";
};

export default function ToolDownloadProgress({
	progress,
	className = "",
	tone = "base",
}: ToolDownloadProgressProps) {
	const backgroundClass = tone === "muted" ? "bg-base-200" : "bg-base-100";

	return (
		<div className={`rounded-md ${backgroundClass} p-3 ${className}`}>
			<div className="flex justify-between gap-3 text-sm">
				<span>{progress.tool_name}</span>
				<span>{progress.progress.toFixed(1)}%</span>
			</div>
			<progress
				className="progress progress-primary mt-2 w-full"
				value={progress.progress}
				max={100}
			/>
			<p className="mt-1 truncate text-xs text-base-content/55">
				{progress.status}
			</p>
		</div>
	);
}
