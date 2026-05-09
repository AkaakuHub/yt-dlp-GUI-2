import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/tauri";
import {
	CheckCircle2,
	Download,
	Loader2,
	Package,
	Play,
	RefreshCw,
	Terminal,
} from "lucide-react";
import { type ChangeEvent, useCallback, useEffect, useState } from "react";
import { toast } from "react-toastify";
import { useAppContext } from "../_components/AppContext";
import { checkToolAvailability } from "../_utils/toolAvailability";

interface ToolSetupProps {
	onComplete: () => void;
}

type ToolCheckResults = {
	ytDlp: boolean;
	ffmpeg: boolean;
	deno: boolean;
};

type DownloadProgress = {
	tool_name: string;
	progress: number;
	status: string;
};

const emptyToolResults: ToolCheckResults = {
	ytDlp: false,
	ffmpeg: false,
	deno: false,
};

const toolLabels = [
	["yt-dlp", "ytDlp"],
	["FFmpeg", "ffmpeg"],
	["Deno", "deno"],
] as const;

export default function ToolSetup({ onComplete }: ToolSetupProps) {
	const {
		useBundleTools,
		setUseBundleTools,
		ytDlpPath,
		setYtDlpPath,
		ffmpegPath,
		setFfmpegPath,
		denoPath,
		setDenoPath,
		isSettingLoaded,
		setIsSettingLoaded,
	} = useAppContext();

	const [isChecking, setIsChecking] = useState(false);
	const [checkResults, setCheckResults] =
		useState<ToolCheckResults>(emptyToolResults);
	const [isDownloading, setIsDownloading] = useState(false);
	const [downloadProgress, setDownloadProgress] =
		useState<DownloadProgress | null>(null);
	const [isLoading, setIsLoading] = useState(true);

	const checkInitialSetup = useCallback(async () => {
		const status = await checkToolAvailability(
			useBundleTools,
			ytDlpPath,
			ffmpegPath,
			denoPath,
		);
		if (status.ok) {
			setCheckResults({ ytDlp: true, ffmpeg: true, deno: true });
			setIsSettingLoaded(true);
			onComplete();
			return;
		}
		setIsLoading(false);
	}, [
		denoPath,
		ffmpegPath,
		onComplete,
		setIsSettingLoaded,
		useBundleTools,
		ytDlpPath,
	]);

	useEffect(() => {
		if (isSettingLoaded) {
			void checkInitialSetup();
		}

		const unlistenPromise = listen<DownloadProgress>(
			"download-progress",
			(event) => {
				setDownloadProgress(event.payload);
			},
		);

		return () => {
			unlistenPromise.then((unlisten) => unlisten());
		};
	}, [checkInitialSetup, isSettingLoaded]);

	const changeMode = (event: ChangeEvent<HTMLInputElement>) => {
		setUseBundleTools(event.target.value === "bundle");
		setCheckResults(emptyToolResults);
	};

	const checkTools = async () => {
		setIsChecking(true);
		try {
			const status = await checkToolAvailability(
				useBundleTools,
				ytDlpPath,
				ffmpegPath,
				denoPath,
			);
			setCheckResults({
				ytDlp: status.ytDlpFound,
				ffmpeg: status.ffmpegFound,
				deno: status.denoFound,
			});
			if (status.ok) {
				toast.success("すべてのツールが利用可能です");
				return;
			}
			toast.error(
				status.ytDlpError ||
					status.ffmpegError ||
					status.denoError ||
					"ツールが見つかりません。設定を確認してください。",
			);
		} catch (error) {
			toast.error(`ツールのチェックに失敗しました:${String(error)}`);
			setCheckResults(emptyToolResults);
		} finally {
			setIsChecking(false);
		}
	};

	const downloadBundleTools = async () => {
		setIsDownloading(true);
		setDownloadProgress(null);
		try {
			await invoke<string>("download_bundle_tools");
			toast.success("ツールのダウンロードが完了しました");
			await checkTools();
		} catch (error) {
			toast.error(`ツールのダウンロードに失敗しました:${String(error)}`);
		} finally {
			setIsDownloading(false);
			setDownloadProgress(null);
		}
	};

	const saveSettings = async () => {
		await invoke("set_use_bundle_tools", { useBundleTools });
		if (!useBundleTools) {
			await Promise.all([
				invoke("set_yt_dlp_path", { ytDlpPath }),
				invoke("set_ffmpeg_path", { ffmpegPath }),
				invoke("set_deno_path", { denoPath }),
			]);
		}
		onComplete();
	};

	if (isLoading) {
		return (
			<div className="grid h-screen place-items-center bg-base-100 p-4 text-base-content">
				<section className="grid w-full max-w-sm gap-3 rounded-lg border border-base-300 bg-base-200 p-6 text-center shadow-sm">
					<Loader2 className="mx-auto animate-spin text-primary" size={28} />
					<h1 className="text-lg font-bold">ツールを確認中</h1>
					<p className="text-sm text-base-content/60">
						yt-dlp、FFmpeg、Denoの状態を読み込んでいます。
					</p>
				</section>
			</div>
		);
	}

	const canStart =
		checkResults.ytDlp && checkResults.ffmpeg && checkResults.deno;

	return (
		<div className="h-screen overflow-auto bg-base-100 p-4 text-base-content">
			<main className="mx-auto grid min-h-full max-w-3xl place-items-center">
				<section className="grid w-full gap-4 rounded-lg border border-base-300 bg-base-200 p-5 shadow-sm">
					<header className="grid gap-1 text-center">
						<p className="text-xs font-semibold uppercase tracking-wide text-primary">
							Setup
						</p>
						<h1 className="text-2xl font-bold">初期設定</h1>
						<p className="text-sm text-base-content/60">
							動画処理に使うツールを選択します。
						</p>
					</header>

					<div className="grid gap-2 sm:grid-cols-2">
						<label
							className={`flex cursor-pointer gap-3 rounded-md border p-4 ${
								useBundleTools
									? "border-primary bg-primary text-primary-content"
									: "border-base-300 bg-base-100"
							}`}
						>
							<input
								className="radio radio-sm"
								type="radio"
								name="tool-mode"
								value="bundle"
								checked={useBundleTools}
								onChange={changeMode}
							/>
							<span className="grid gap-1">
								<span className="flex items-center gap-2 font-semibold">
									<Package size={18} />
									バンドル版
								</span>
								<span className="text-sm opacity-75">
									内蔵ツールを使用します。
								</span>
							</span>
						</label>

						<label
							className={`flex cursor-pointer gap-3 rounded-md border p-4 ${
								useBundleTools
									? "border-base-300 bg-base-100"
									: "border-primary bg-primary text-primary-content"
							}`}
						>
							<input
								className="radio radio-sm"
								type="radio"
								name="tool-mode"
								value="path"
								checked={!useBundleTools}
								onChange={changeMode}
							/>
							<span className="grid gap-1">
								<span className="flex items-center gap-2 font-semibold">
									<Terminal size={18} />
									カスタムパス
								</span>
								<span className="text-sm opacity-75">
									実行ファイルを直接指定します。
								</span>
							</span>
						</label>
					</div>

					{!useBundleTools ? (
						<div className="grid gap-3 rounded-md border border-base-300 bg-base-100 p-3">
							<label className="grid gap-1">
								<span className="label pb-1 text-xs font-semibold text-base-content/65">
									yt-dlpのパス
								</span>
								<input
									className="input input-bordered h-10 min-h-10 rounded-md"
									value={ytDlpPath}
									onChange={(event) => setYtDlpPath(event.target.value)}
									placeholder="yt-dlp"
								/>
							</label>
							<label className="grid gap-1">
								<span className="label pb-1 text-xs font-semibold text-base-content/65">
									FFmpegのパス
								</span>
								<input
									className="input input-bordered h-10 min-h-10 rounded-md"
									value={ffmpegPath}
									onChange={(event) => setFfmpegPath(event.target.value)}
									placeholder="ffmpeg"
								/>
							</label>
							<label className="grid gap-1">
								<span className="label pb-1 text-xs font-semibold text-base-content/65">
									Denoのパス
								</span>
								<input
									className="input input-bordered h-10 min-h-10 rounded-md"
									value={denoPath}
									onChange={(event) => setDenoPath(event.target.value)}
									placeholder="deno"
								/>
							</label>
						</div>
					) : null}

					{downloadProgress ? (
						<div className="rounded-md border border-base-300 bg-base-100 p-3">
							<div className="flex justify-between gap-3 text-sm">
								<span>{downloadProgress.tool_name}</span>
								<span>{downloadProgress.progress.toFixed(1)}%</span>
							</div>
							<progress
								className="progress progress-primary mt-2 w-full"
								value={downloadProgress.progress}
								max={100}
							/>
							<p className="mt-1 text-xs text-base-content/55">
								{downloadProgress.status}
							</p>
						</div>
					) : null}

					<div className="grid gap-2 sm:grid-cols-3">
						{toolLabels.map(([label, key]) => (
							<div
								key={key}
								className="flex items-center justify-between rounded-md border border-base-300 bg-base-100 px-3 py-2 text-sm"
							>
								<span>{label}</span>
								<span
									className={
										checkResults[key]
											? "inline-flex items-center gap-1 text-success"
											: "text-base-content/45"
									}
								>
									{checkResults[key] ? (
										<>
											<CheckCircle2 size={14} />
											OK
										</>
									) : (
										"未確認"
									)}
								</span>
							</div>
						))}
					</div>

					<footer className="grid gap-2 sm:grid-cols-[auto_auto_minmax(0,1fr)_auto]">
						{useBundleTools ? (
							<button
								className="btn btn-outline rounded-md"
								type="button"
								disabled={isDownloading || isChecking}
								onClick={() => void downloadBundleTools()}
							>
								{isDownloading ? (
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
							className="btn btn-outline rounded-md"
							type="button"
							disabled={isChecking || isDownloading}
							onClick={() => void checkTools()}
						>
							{isChecking ? (
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
							disabled={!canStart}
							onClick={() => void saveSettings()}
						>
							<Play size={16} />
							開始
						</button>
					</footer>
				</section>
			</main>
		</div>
	);
}
