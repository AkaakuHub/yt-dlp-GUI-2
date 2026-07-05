import {
	Download,
	Loader2,
	Package,
	RefreshCw,
	Save,
	Terminal,
	X,
} from "lucide-react";
import { AppInput } from "../../../shared/components/FormControls";
import ToolDownloadProgress, {
	type ToolDownloadProgressValue,
} from "../../../shared/components/ToolDownloadProgress";
import { cn } from "../../../shared/utils/className";

type ToolCheckResults = {
	ytDlp: boolean;
	ffmpeg: boolean;
	deno: boolean;
};

const toolLabels = [
	["yt-dlp", "ytDlp"],
	["FFmpeg", "ffmpeg"],
	["Deno", "deno"],
] as const;

type ToolsSettingsModalProps = {
	tempUseBundle: boolean;
	tempYtDlpPath: string;
	tempFfmpegPath: string;
	tempDenoPath: string;
	downloadProgress: ToolDownloadProgressValue | null;
	toolCheckResults: ToolCheckResults;
	isDownloadingTools: boolean;
	isCheckingTools: boolean;
	downloadedOnce: boolean;
	onClose: () => void;
	onTempUseBundleChange: (value: boolean) => void;
	onTempYtDlpPathChange: (value: string) => void;
	onTempFfmpegPathChange: (value: string) => void;
	onTempDenoPathChange: (value: string) => void;
	onDownloadBundleTools: () => void;
	onCheckTools: () => void;
	onSaveToolsSettings: () => void;
};

export function ToolsSettingsModal({
	tempUseBundle,
	tempYtDlpPath,
	tempFfmpegPath,
	tempDenoPath,
	downloadProgress,
	toolCheckResults,
	isDownloadingTools,
	isCheckingTools,
	downloadedOnce,
	onClose,
	onTempUseBundleChange,
	onTempYtDlpPathChange,
	onTempFfmpegPathChange,
	onTempDenoPathChange,
	onDownloadBundleTools,
	onCheckTools,
	onSaveToolsSettings,
}: ToolsSettingsModalProps) {
	return (
		<div className="fixed inset-0 z-50 grid place-items-center bg-base-content/25 p-4 backdrop-blur-sm">
			<section className="grid max-h-[calc(100vh-2rem)] w-full max-w-2xl grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-lg border border-base-300 bg-base-100 shadow-xl">
				<header className="flex items-center justify-between border-b border-base-300 p-4">
					<h2 className="text-lg font-bold">ツール</h2>
					<button
						className="btn btn-ghost btn-sm h-8 min-h-8 w-8 rounded-md p-0"
						type="button"
						onClick={onClose}
						aria-label="閉じる"
					>
						<X size={18} />
					</button>
				</header>

				<div className="min-h-0 overflow-auto p-4">
					<div className="grid gap-3">
						<div className="grid gap-2 sm:grid-cols-2">
							<button
								className={cn(
									"btn h-auto min-h-20 justify-start rounded-md p-3",
									tempUseBundle
										? "btn-primary"
										: "btn-ghost bg-base-200 hover:bg-base-300",
								)}
								type="button"
								onClick={() => onTempUseBundleChange(true)}
							>
								<Package size={18} />
								<span className="text-left">
									<span className="block">バンドル版</span>
									<span className="block text-xs font-normal opacity-75">
										内蔵ツールを使用
									</span>
								</span>
							</button>
							<button
								className={cn(
									"btn h-auto min-h-20 justify-start rounded-md p-3",
									tempUseBundle
										? "btn-ghost bg-base-200 hover:bg-base-300"
										: "btn-primary",
								)}
								type="button"
								onClick={() => onTempUseBundleChange(false)}
							>
								<Terminal size={18} />
								<span className="text-left">
									<span className="block">カスタムパス</span>
									<span className="block text-xs font-normal opacity-75">
										実行ファイルを指定
									</span>
								</span>
							</button>
						</div>

						{!tempUseBundle ? (
							<div className="grid gap-3 rounded-md border border-base-300 bg-base-200 p-3">
								<label className="grid gap-1">
									<span className="label pb-1 text-xs font-semibold text-base-content/65">
										yt-dlpのパス
									</span>
									<AppInput
										value={tempYtDlpPath}
										onChange={(event) =>
											onTempYtDlpPathChange(event.target.value)
										}
										placeholder="yt-dlp"
									/>
								</label>
								<label className="grid gap-1">
									<span className="label pb-1 text-xs font-semibold text-base-content/65">
										FFmpegのパス
									</span>
									<AppInput
										value={tempFfmpegPath}
										onChange={(event) =>
											onTempFfmpegPathChange(event.target.value)
										}
										placeholder="ffmpeg"
									/>
								</label>
								<label className="grid gap-1">
									<span className="label pb-1 text-xs font-semibold text-base-content/65">
										Denoのパス
									</span>
									<AppInput
										value={tempDenoPath}
										onChange={(event) =>
											onTempDenoPathChange(event.target.value)
										}
										placeholder="deno"
									/>
								</label>
							</div>
						) : null}

						{downloadProgress ? (
							<ToolDownloadProgress
								className="border border-base-300"
								progress={downloadProgress}
								tone="muted"
							/>
						) : null}

						<div className="grid gap-2 sm:grid-cols-3">
							{toolLabels.map(([label, key]) => (
								<div
									key={key}
									className="flex items-center justify-between rounded-md border border-base-300 bg-base-200 px-3 py-2 text-sm"
								>
									<span>{label}</span>
									<span
										className={cn(
											toolCheckResults[key]
												? "text-success"
												: "text-base-content/40",
										)}
									>
										{toolCheckResults[key] ? "OK" : "未確認"}
									</span>
								</div>
							))}
						</div>
					</div>
				</div>

				<footer className="grid gap-2 border-t border-base-300 p-4 sm:grid-cols-[auto_auto_minmax(0,1fr)_auto]">
					{tempUseBundle ? (
						<button
							className="btn btn-ghost rounded-md bg-base-200 hover:bg-base-300"
							type="button"
							disabled={isDownloadingTools || isCheckingTools}
							onClick={onDownloadBundleTools}
						>
							{isDownloadingTools ? (
								<Loader2 size={16} className="animate-spin" />
							) : (
								<Download size={16} />
							)}
							ダウンロード
						</button>
					) : (
						<span />
					)}
					<button
						className="btn btn-ghost rounded-md bg-base-200 hover:bg-base-300"
						type="button"
						disabled={isDownloadingTools || isCheckingTools}
						onClick={onCheckTools}
					>
						{isCheckingTools ? (
							<Loader2 size={16} className="animate-spin" />
						) : (
							<RefreshCw size={16} />
						)}
						確認
					</button>
					<span />
					<button
						className="btn btn-primary rounded-md"
						type="button"
						disabled={
							!toolCheckResults.ytDlp ||
							!toolCheckResults.ffmpeg ||
							!toolCheckResults.deno ||
							(downloadedOnce && isDownloadingTools)
						}
						onClick={onSaveToolsSettings}
					>
						<Save size={16} />
						保存
					</button>
				</footer>
			</section>
		</div>
	);
}
