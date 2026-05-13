import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { CheckCircle2, Loader2, Package, Play, Terminal } from "lucide-react";
import { type ChangeEvent, useEffect, useState } from "react";
import { toast } from "react-toastify";
import { useAppContext } from "../_components/AppContext";
import { AppInput } from "../_components/FormControls";
import PrimaryCircleButton from "../_components/PrimaryCircleButton";
import ToolDownloadProgress, {
	type ToolDownloadProgressValue,
} from "../_components/ToolDownloadProgress";
import { checkToolAvailability } from "../_utils/toolAvailability";

interface ToolSetupProps {
	onComplete: () => void;
}

type ToolCheckResults = {
	ytDlp: boolean;
	ffmpeg: boolean;
	deno: boolean;
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
	} = useAppContext();

	const [isChecking, setIsChecking] = useState(false);
	const [checkResults, setCheckResults] =
		useState<ToolCheckResults>(emptyToolResults);
	const [isDownloading, setIsDownloading] = useState(false);
	const [downloadProgress, setDownloadProgress] =
		useState<ToolDownloadProgressValue | null>(null);
	const [isLoading, setIsLoading] = useState(true);

	useEffect(() => {
		if (isSettingLoaded) {
			setIsLoading(false);
		}

		const unlistenPromise = listen<ToolDownloadProgressValue>(
			"download-progress",
			(event) => {
				setDownloadProgress(event.payload);
			},
		);

		return () => {
			unlistenPromise.then((unlisten) => unlisten());
		};
	}, [isSettingLoaded]);

	const detectCustomPathTools = async () => {
		try {
			const status = await checkToolAvailability(false, "", "", "");
			setCheckResults({
				ytDlp: status.ytDlpFound,
				ffmpeg: status.ffmpegFound,
				deno: status.denoFound,
			});
			if (status.ok) {
				setYtDlpPath(status.ytDlpPath);
				setFfmpegPath(status.ffmpegPath);
				setDenoPath(status.denoPath);
			}
		} catch {
			setCheckResults(emptyToolResults);
		}
	};

	const changeMode = (event: ChangeEvent<HTMLInputElement>) => {
		const nextUseBundleTools = event.target.value === "bundle";
		setUseBundleTools(nextUseBundleTools);
		setCheckResults(emptyToolResults);
		if (!nextUseBundleTools) {
			void detectCustomPathTools();
		}
	};

	const checkTools = async (
		targetUseBundleTools = useBundleTools,
	): Promise<boolean> => {
		setIsChecking(true);
		try {
			const status = await checkToolAvailability(
				targetUseBundleTools,
				ytDlpPath,
				ffmpegPath,
				denoPath,
			);
			if (!targetUseBundleTools && status.ok) {
				setYtDlpPath(status.ytDlpPath);
				setFfmpegPath(status.ffmpegPath);
				setDenoPath(status.denoPath);
			}
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

	const downloadBundleTools = async (): Promise<boolean> => {
		setIsDownloading(true);
		setDownloadProgress(null);
		try {
			await invoke<string>("download_bundle_tools");
			toast.success("ツールのダウンロードが完了しました");
			return await checkTools(true);
		} catch (error) {
			toast.error(`ツールのダウンロードに失敗しました:${String(error)}`);
			return false;
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
		const isReady =
			canStart ||
			(useBundleTools ? await downloadBundleTools() : await checkTools(false));
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
					{downloadProgress ? (
						<ToolDownloadProgress progress={downloadProgress} />
					) : null}
				</section>
			</div>
		);
	}

	const canStart =
		checkResults.ytDlp && checkResults.ffmpeg && checkResults.deno;

	return (
		<div className="h-screen overflow-hidden bg-base-100 p-3 text-base-content">
			<main className="mx-auto grid h-full max-w-5xl grid-rows-[auto_minmax(0,1fr)] gap-2">
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
									<span className="rounded bg-primary-content/20 px-2 py-0.5 text-xs">
										初心者向け
									</span>
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
									<span className="rounded bg-primary/10 px-2 py-0.5 text-xs text-primary">
										技術者向け
									</span>
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
									<span className="rounded bg-primary/10 px-2 py-0.5 text-xs text-primary">
										初心者向け
									</span>
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
								isChecking || isDownloading ? (
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
							<ToolDownloadProgress progress={downloadProgress} />
						) : null}
					</div>
				</section>
			</main>
		</div>
	);
}
