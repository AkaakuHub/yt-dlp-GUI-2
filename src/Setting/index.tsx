import { dialog } from "@tauri-apps/api";
import { open } from "@tauri-apps/api/dialog";
import { listen } from "@tauri-apps/api/event";
import {
	isPermissionGranted,
	requestPermission,
} from "@tauri-apps/api/notification";
import { relaunch } from "@tauri-apps/api/process";
import { invoke } from "@tauri-apps/api/tauri";
import { checkUpdate, installUpdate } from "@tauri-apps/api/updater";
import {
	Bell,
	Download,
	FolderOpen,
	HardDrive,
	Loader2,
	Package,
	RefreshCw,
	Save,
	Server,
	Settings2,
	Terminal,
	X,
} from "lucide-react";
import { type ChangeEvent, useCallback, useEffect, useState } from "react";
import { toast } from "react-toastify";
import { useAppContext } from "../_components/AppContext";
import ThemeSelector from "../_components/ThemeSelector";
import { checkToolAvailability } from "../_utils/toolAvailability";
import type { ConfigProps } from "../types";

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

const parseServerPort = (value: string): number | null => {
	const parsedPort = Number.parseInt(value, 10);
	if (Number.isNaN(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
		return null;
	}
	return parsedPort;
};

export default function Settings() {
	const {
		saveDir,
		setSaveDir,
		browser,
		setBrowser,
		serverPort,
		setServerPort,
		isSendNotification,
		setIsSendNotification,
		isServerEnabled,
		setIsServerEnabled,
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

	const [currentVersion, setCurrentVersion] = useState("");
	const [isUpdateAvailable, setIsUpdateAvailable] = useState(false);
	const [notificationPermission, setNotificationPermission] = useState<
		boolean | null
	>(null);
	const [osType, setOsType] = useState("");
	const [showToolsModal, setShowToolsModal] = useState(false);
	const [tempUseBundle, setTempUseBundle] = useState(useBundleTools);
	const [tempYtDlpPath, setTempYtDlpPath] = useState(ytDlpPath);
	const [tempFfmpegPath, setTempFfmpegPath] = useState(ffmpegPath);
	const [tempDenoPath, setTempDenoPath] = useState(denoPath);
	const [isCheckingTools, setIsCheckingTools] = useState(false);
	const [toolCheckResults, setToolCheckResults] =
		useState<ToolCheckResults>(emptyToolResults);
	const [isDownloadingTools, setIsDownloadingTools] = useState(false);
	const [downloadProgress, setDownloadProgress] =
		useState<DownloadProgress | null>(null);
	const [downloadedOnce, setDownloadedOnce] = useState(false);

	const updateSaveDir = async (nextSaveDir: string) => {
		setSaveDir(nextSaveDir);
		await invoke("set_save_dir", { newSaveDir: nextSaveDir });
	};

	const updateBrowser = async (nextBrowser: string) => {
		setBrowser(nextBrowser);
		await invoke("set_browser", { newBrowser: nextBrowser });
	};

	const updateServerPort = async (nextServerPort: number) => {
		setServerPort(nextServerPort);
		await invoke("set_server_port", { newServerPort: nextServerPort });
	};

	const updateNotification = async (nextIsSendNotification: boolean) => {
		setIsSendNotification(nextIsSendNotification);
		await invoke("set_is_send_notification", {
			newIsSendNotification: nextIsSendNotification,
		});
	};

	const updateServerEnabled = async (nextIsServerEnabled: boolean) => {
		setIsServerEnabled(nextIsServerEnabled);
		await invoke("set_is_server_enabled", {
			newIsServerEnabled: nextIsServerEnabled,
		});
	};

	const executeUpdate = useCallback(async () => {
		await installUpdate();
		await dialog.message(
			"アップデートが完了しました。アプリケーションを再起動します。",
		);
		await relaunch();
	}, []);

	useEffect(() => {
		const setupDownloadProgressListener = async () => {
			return listen<DownloadProgress>("download-progress", (event) => {
				setDownloadProgress(event.payload);
			});
		};

		const loadSettingsMetadata = async () => {
			const [version, os, granted, update] = await Promise.all([
				invoke<string>("get_current_version"),
				invoke<string>("get_os_type"),
				isPermissionGranted().catch(() => false),
				checkUpdate().catch(() => ({ shouldUpdate: false })),
			]);
			setCurrentVersion(version);
			setOsType(os);
			setNotificationPermission(granted);
			setIsUpdateAvailable(update.shouldUpdate);
		};

		const unlistenPromise = setupDownloadProgressListener();
		void loadSettingsMetadata();

		return () => {
			unlistenPromise.then((unlisten) => unlisten());
		};
	}, []);

	useEffect(() => {
		if (!isSettingLoaded || serverPort === 0 || Number.isNaN(serverPort)) {
			return;
		}
		void invoke("toggle_server", {
			enable: isServerEnabled,
			port: serverPort,
		});
	}, [isServerEnabled, isSettingLoaded, serverPort]);

	useEffect(() => {
		const unlistenPromise = listen<string>("start-server-output", (event) => {
			if (event.payload !== "失敗") {
				void invoke("set_is_server_enabled", {
					newIsServerEnabled: true,
				});
				return;
			}
			toast.error(
				"サーバーの起動に失敗しました。ポート番号が他のプログラムで使用されています。",
			);
			setIsServerEnabled(false);
			void invoke("set_is_server_enabled", {
				newIsServerEnabled: false,
			});
		});

		return () => {
			unlistenPromise.then((unlisten) => unlisten());
		};
	}, [setIsServerEnabled]);

	const requestNotificationAccess = async () => {
		const permission = await requestPermission();
		const granted = permission === "granted";
		setNotificationPermission(granted);
		if (granted) {
			toast.success("通知権限が許可されました");
			return;
		}
		toast.error("通知権限が拒否されました。システム設定で許可してください。");
	};

	const chooseSaveDirectory = async () => {
		const selectedDir = await open({
			directory: true,
			multiple: false,
		});
		if (typeof selectedDir === "string") {
			await updateSaveDir(selectedDir);
		}
	};

	const changeServerPort = async (event: ChangeEvent<HTMLInputElement>) => {
		const nextPort = parseServerPort(event.target.value);
		if (nextPort === null) {
			return;
		}
		await updateServerPort(nextPort);
	};

	const openToolsModal = () => {
		setTempUseBundle(useBundleTools);
		setTempYtDlpPath(ytDlpPath);
		setTempFfmpegPath(ffmpegPath);
		setTempDenoPath(denoPath);
		setToolCheckResults(emptyToolResults);
		setShowToolsModal(true);
	};

	const checkTools = async () => {
		setIsCheckingTools(true);
		try {
			const status = await checkToolAvailability(
				tempUseBundle,
				tempYtDlpPath,
				tempFfmpegPath,
				tempDenoPath,
			);
			setToolCheckResults({
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
			setToolCheckResults(emptyToolResults);
		} finally {
			setIsCheckingTools(false);
		}
	};

	const downloadBundleTools = async () => {
		setIsDownloadingTools(true);
		setDownloadProgress(null);
		try {
			await invoke<string>("download_bundle_tools");
			setDownloadedOnce(true);
			toast.success("ツールのダウンロードが完了しました");
			await checkTools();
		} catch (error) {
			toast.error(`ツールのダウンロードに失敗しました:${String(error)}`);
		} finally {
			setIsDownloadingTools(false);
			setDownloadProgress(null);
		}
	};

	const saveToolsSettings = async () => {
		await invoke("set_use_bundle_tools", { useBundleTools: tempUseBundle });
		if (!tempUseBundle) {
			await Promise.all([
				invoke("set_yt_dlp_path", { ytDlpPath: tempYtDlpPath }),
				invoke("set_ffmpeg_path", { ffmpegPath: tempFfmpegPath }),
				invoke("set_deno_path", { denoPath: tempDenoPath }),
			]);
		}

		const settings = await invoke<ConfigProps>("get_settings");
		setUseBundleTools(settings.use_bundle_tools);
		setYtDlpPath(settings.yt_dlp_path);
		setFfmpegPath(settings.ffmpeg_path);
		setDenoPath(settings.deno_path);
		setShowToolsModal(false);
		toast.success("ツール設定を保存しました");
	};

	return (
		<div className="h-full min-h-0 overflow-auto bg-base-100 p-4 text-base-content">
			<div className="mx-auto grid max-w-5xl gap-4">
				<section className="grid gap-3 rounded-lg border border-base-300 bg-base-200 p-4 shadow-sm">
					<div className="flex justify-end">
						<button
							className="btn btn-outline btn-sm rounded-md"
							type="button"
							onClick={openToolsModal}
						>
							<Settings2 size={16} />
							ツールを管理
						</button>
					</div>
					<ThemeSelector />
				</section>

				<section className="grid gap-3 rounded-lg border border-base-300 bg-base-200 p-4 shadow-sm">
					<div className="flex items-center gap-2 text-sm font-semibold">
						<HardDrive size={16} className="text-primary" />
						保存先
					</div>
					<div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
						<input
							className="input input-bordered h-11 min-h-11 rounded-md bg-base-100 text-sm"
							value={saveDir}
							onChange={(event) => void updateSaveDir(event.target.value)}
							placeholder="/Users/name/Movies/yt-dlp-data"
						/>
						<button
							className="btn btn-outline h-11 min-h-11 rounded-md"
							type="button"
							onClick={() => void chooseSaveDirectory()}
							aria-label="保存先を選択"
						>
							<FolderOpen size={18} />
						</button>
					</div>
				</section>

				<section className="grid gap-3 rounded-lg border border-base-300 bg-base-200 p-4 shadow-sm">
					<div className="grid gap-3 md:grid-cols-2">
						<label className="grid gap-1">
							<span className="label pb-1 text-xs font-semibold text-base-content/65">
								Cookie取得元のブラウザ
							</span>
							<input
								className="input input-bordered h-11 min-h-11 rounded-md bg-base-100"
								value={browser}
								onChange={(event) => void updateBrowser(event.target.value)}
								placeholder="firefox"
							/>
						</label>
						<label className="grid gap-1">
							<span className="label pb-1 text-xs font-semibold text-base-content/65">
								使用するポート番号
							</span>
							<input
								className="input input-bordered h-11 min-h-11 rounded-md bg-base-100"
								value={serverPort}
								disabled={isServerEnabled}
								inputMode="numeric"
								onChange={(event) => void changeServerPort(event)}
							/>
						</label>
					</div>
				</section>

				<section className="grid gap-2 rounded-lg border border-base-300 bg-base-200 p-4 shadow-sm">
					<label className="flex min-h-14 items-center justify-between gap-3 rounded-md border border-base-300 bg-base-100 px-3">
						<span className="flex min-w-0 items-center gap-3">
							<Bell size={18} className="shrink-0 text-primary" />
							<span className="min-w-0">
								<span className="block text-sm font-semibold">
									ダウンロード完了時に通知を受け取る
								</span>
								{osType === "macos" ? (
									<span className="block truncate text-xs text-base-content/55">
										macOSでは通知設定でバナー通知が表示されます
									</span>
								) : null}
							</span>
						</span>
						<input
							className="toggle toggle-primary"
							type="checkbox"
							checked={isSendNotification}
							onChange={(event) =>
								void updateNotification(event.target.checked)
							}
						/>
					</label>

					{isSendNotification && notificationPermission === false ? (
						<div className="alert border-warning/35 bg-warning/10 py-2 text-sm">
							<Bell size={16} />
							<span>通知権限が許可されていません。</span>
							<button
								className="btn btn-warning btn-sm rounded-md"
								type="button"
								onClick={() => void requestNotificationAccess()}
							>
								権限を要求
							</button>
						</div>
					) : null}

					<label className="flex min-h-14 items-center justify-between gap-3 rounded-md border border-base-300 bg-base-100 px-3">
						<span className="flex items-center gap-3 text-sm font-semibold">
							<Server size={18} className="text-primary" />
							ポート{serverPort}でサーバーを起動する
						</span>
						<input
							className="toggle toggle-primary"
							type="checkbox"
							checked={isServerEnabled}
							onChange={(event) =>
								void updateServerEnabled(event.target.checked)
							}
						/>
					</label>
				</section>

				<footer className="flex flex-wrap items-center justify-center gap-2 pb-3 text-sm text-base-content/60">
					<a
						className="link link-primary inline-flex items-center gap-1"
						href="https://github.com/AkaakuHub/yt-dlp-GUI-2"
						target="_blank"
						rel="noreferrer"
					>
						GitHub
					</a>
					<span>バージョン{currentVersion || "1.3.1"}</span>
					{isUpdateAvailable ? (
						<button
							className="btn btn-primary btn-xs rounded-md"
							type="button"
							onClick={() => void executeUpdate()}
						>
							更新する
						</button>
					) : (
						<span>最新です</span>
					)}
				</footer>
			</div>

			{showToolsModal ? (
				<div className="fixed inset-0 z-50 grid place-items-center bg-base-300/70 p-4">
					<section className="grid max-h-[calc(100vh-2rem)] w-full max-w-2xl grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-lg border border-base-300 bg-base-100 shadow-xl">
						<header className="flex items-center justify-between border-b border-base-300 p-4">
							<h2 className="text-lg font-bold">ツール</h2>
							<button
								className="btn btn-ghost btn-sm h-8 min-h-8 w-8 rounded-md p-0"
								type="button"
								onClick={() => setShowToolsModal(false)}
								aria-label="閉じる"
							>
								<X size={18} />
							</button>
						</header>

						<div className="min-h-0 overflow-auto p-4">
							<div className="grid gap-3">
								<div className="grid gap-2 sm:grid-cols-2">
									<button
										className={`btn h-auto min-h-20 justify-start rounded-md border p-3 ${
											tempUseBundle ? "btn-primary" : "btn-outline"
										}`}
										type="button"
										onClick={() => setTempUseBundle(true)}
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
										className={`btn h-auto min-h-20 justify-start rounded-md border p-3 ${
											tempUseBundle ? "btn-outline" : "btn-primary"
										}`}
										type="button"
										onClick={() => setTempUseBundle(false)}
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
											<input
												className="input input-bordered h-10 min-h-10 rounded-md bg-base-100"
												value={tempYtDlpPath}
												onChange={(event) =>
													setTempYtDlpPath(event.target.value)
												}
												placeholder="yt-dlp"
											/>
										</label>
										<label className="grid gap-1">
											<span className="label pb-1 text-xs font-semibold text-base-content/65">
												FFmpegのパス
											</span>
											<input
												className="input input-bordered h-10 min-h-10 rounded-md bg-base-100"
												value={tempFfmpegPath}
												onChange={(event) =>
													setTempFfmpegPath(event.target.value)
												}
												placeholder="ffmpeg"
											/>
										</label>
										<label className="grid gap-1">
											<span className="label pb-1 text-xs font-semibold text-base-content/65">
												Denoのパス
											</span>
											<input
												className="input input-bordered h-10 min-h-10 rounded-md bg-base-100"
												value={tempDenoPath}
												onChange={(event) =>
													setTempDenoPath(event.target.value)
												}
												placeholder="deno"
											/>
										</label>
									</div>
								) : null}

								{downloadProgress ? (
									<div className="rounded-md border border-base-300 bg-base-200 p-3">
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
											className="flex items-center justify-between rounded-md border border-base-300 bg-base-200 px-3 py-2 text-sm"
										>
											<span>{label}</span>
											<span
												className={
													toolCheckResults[key]
														? "text-success"
														: "text-base-content/40"
												}
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
									className="btn btn-outline rounded-md"
									type="button"
									disabled={isDownloadingTools || isCheckingTools}
									onClick={() => void downloadBundleTools()}
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
								className="btn btn-outline rounded-md"
								type="button"
								disabled={isDownloadingTools || isCheckingTools}
								onClick={() => void checkTools()}
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
								onClick={() => void saveToolsSettings()}
							>
								<Save size={16} />
								保存
							</button>
						</footer>
					</section>
				</div>
			) : null}
		</div>
	);
}
