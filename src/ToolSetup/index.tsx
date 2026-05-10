import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
	CheckCircle2,
	Download,
	Loader2,
	Package,
	Play,
	Terminal,
} from "lucide-react";
import { type ChangeEvent, useCallback, useEffect, useState } from "react";
import { toast } from "react-toastify";
import { useAppContext } from "../_components/AppContext";
import { AppInput } from "../_components/FormControls";
import PrimaryCircleButton from "../_components/PrimaryCircleButton";
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

	const checkTools = async (): Promise<boolean> => {
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
				return true;
			}
			toast.error(
				status.ytDlpError ||
					status.ffmpegError ||
					status.denoError ||
					"ツールが見つかりません。設定を確認してください。",
			);
			return false;
		} catch (error) {
			toast.error(`ツールのチェックに失敗しました:${String(error)}`);
			setCheckResults(emptyToolResults);
			return false;
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

	const verifyAndStart = async () => {
		const isReady = canStart || (await checkTools());
		if (isReady) {
			await saveSettings();
		}
	};

	if (isLoading) {
		return (
			<div className="grid h-screen overflow-hidden bg-base-100 p-3 text-base-content">
				<section className="m-auto grid w-full max-w-sm gap-3 rounded-lg bg-base-200 p-5 text-center shadow-sm ring-1 ring-base-300">
					<Loader2 className="mx-auto animate-spin text-primary" size={28} />
					<h1 className="text-lg font-bold">ツール確認中</h1>
				</section>
			</div>
		);
	}

	const canStart =
		checkResults.ytDlp && checkResults.ffmpeg && checkResults.deno;

	return (
		<div className="h-screen overflow-hidden bg-base-100 p-3 text-base-content">
			<main className="mx-auto grid h-full max-w-5xl grid-rows-[auto_minmax(0,1fr)_auto] gap-2">
				<section className="grid gap-2 rounded-lg bg-base-200 p-2 shadow-sm ring-1 ring-base-300 sm:grid-cols-2">
					<div className="contents">
						<label
							className={`flex h-14 cursor-pointer items-center gap-3 rounded-md px-3 ${
								useBundleTools
									? "bg-primary text-primary-content"
									: "bg-base-100 hover:bg-base-300"
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
							</span>
						</label>

						<label
							className={`flex h-14 cursor-pointer items-center gap-3 rounded-md px-3 ${
								useBundleTools
									? "bg-base-100 hover:bg-base-300"
									: "bg-primary text-primary-content"
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
							</span>
						</label>
					</div>
				</section>

				<section className="relative grid min-h-0 gap-3 overflow-hidden rounded-lg bg-base-200 p-3 shadow-sm ring-1 ring-base-300 md:grid-cols-[minmax(0,1fr)_10rem_minmax(0,1fr)]">
					<div className="grid min-h-0 content-start gap-2">
						{!useBundleTools ? (
							<label className="grid gap-1">
								<span className="label pb-1 text-xs font-semibold text-base-content/65">
									yt-dlpのパス
								</span>
								<AppInput
									className="h-10 min-h-10"
									value={ytDlpPath}
									onChange={(event) => setYtDlpPath(event.target.value)}
									placeholder="yt-dlp"
								/>
							</label>
						) : (
							<div className="grid h-12 content-center rounded-lg bg-base-100 px-4">
								<div className="flex items-center gap-2 text-sm font-semibold">
									<Package size={17} className="text-primary" />
									バンドル版
								</div>
							</div>
						)}
						{!useBundleTools ? (
							<>
								<label className="grid gap-1">
									<span className="label pb-1 text-xs font-semibold text-base-content/65">
										FFmpegのパス
									</span>
									<AppInput
										className="h-10 min-h-10"
										value={ffmpegPath}
										onChange={(event) => setFfmpegPath(event.target.value)}
										placeholder="ffmpeg"
									/>
								</label>
								<label className="grid gap-1">
									<span className="label pb-1 text-xs font-semibold text-base-content/65">
										Denoのパス
									</span>
									<AppInput
										className="h-10 min-h-10"
										value={denoPath}
										onChange={(event) => setDenoPath(event.target.value)}
										placeholder="deno"
									/>
								</label>
							</>
						) : null}
					</div>

					<div className="grid content-center justify-items-center gap-2">
						<PrimaryCircleButton
							label="開始"
							icon={
								isChecking ? (
									<Loader2 size={30} className="animate-spin" />
								) : (
									<Play size={30} />
								)
							}
							disabled={isChecking || isDownloading}
							onClick={() => void verifyAndStart()}
						/>
					</div>

					<div className="grid min-h-0 content-start gap-2">
						<div className="grid gap-2">
							{toolLabels.map(([label, key]) => (
								<div
									key={key}
									className="flex h-11 items-center justify-between rounded-md bg-base-100 px-3 text-sm"
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

						{downloadProgress ? (
							<div className="rounded-md bg-base-100 p-3">
								<div className="flex justify-between gap-3 text-sm">
									<span>{downloadProgress.tool_name}</span>
									<span>{downloadProgress.progress.toFixed(1)}%</span>
								</div>
								<progress
									className="progress progress-primary mt-2 w-full"
									value={downloadProgress.progress}
									max={100}
								/>
								<p className="mt-1 truncate text-xs text-base-content/55">
									{downloadProgress.status}
								</p>
							</div>
						) : null}
					</div>
				</section>

				{useBundleTools ? (
					<footer className="grid gap-2 rounded-lg bg-base-200 p-2 shadow-sm ring-1 ring-base-300 sm:grid-cols-[auto_minmax(0,1fr)]">
						<button
							className="btn btn-ghost rounded-md bg-base-100 hover:bg-base-300"
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
					</footer>
				) : null}
			</main>
		</div>
	);
}
