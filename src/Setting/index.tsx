import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { message, open } from "@tauri-apps/plugin-dialog";
import {
	isPermissionGranted,
	requestPermission,
} from "@tauri-apps/plugin-notification";
import { relaunch } from "@tauri-apps/plugin-process";
import { check } from "@tauri-apps/plugin-updater";
import {
	Bell,
	CheckCircle2,
	Cookie,
	Copy,
	Download,
	FolderOpen,
	HardDrive,
	Hash,
	KeyRound,
	Loader2,
	Network,
	Package,
	Play,
	RefreshCw,
	Save,
	Server,
	Settings2,
	StopCircle,
	Terminal,
	X,
} from "lucide-react";
import { type ChangeEvent, useCallback, useEffect, useState } from "react";
import { toast } from "react-toastify";
import { useAppContext } from "../_components/AppContext";
import { AppInput, AppTextarea } from "../_components/FormControls";
import { SurfaceIsland, SurfacePanel } from "../_components/Surface";
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

type ServerCliStatus = {
	registered: boolean;
	running: boolean;
	pathExists: boolean;
	path: string;
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
		useBundleTools,
		setUseBundleTools,
		ytDlpPath,
		setYtDlpPath,
		ffmpegPath,
		setFfmpegPath,
		denoPath,
		setDenoPath,
		executionTarget,
		setExecutionTarget,
		remoteServerUrl,
		setRemoteServerUrl,
		remoteAuthToken,
		setRemoteAuthToken,
		serverAuthToken,
		setServerAuthToken,
	} = useAppContext();

	const [currentVersion, setCurrentVersion] = useState("");
	const [isUpdateAvailable, setIsUpdateAvailable] = useState(false);
	const [notificationPermission, setNotificationPermission] = useState<
		boolean | null
	>(null);
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
	const [isRegisteringServerCli, setIsRegisteringServerCli] = useState(false);
	const [isOperatingServerCli, setIsOperatingServerCli] = useState(false);
	const [isTestingRemoteServer, setIsTestingRemoteServer] = useState(false);
	const [serverCliStatus, setServerCliStatus] =
		useState<ServerCliStatus | null>(null);
	const [generatedToken, setGeneratedToken] = useState("");
	const [showTokenModal, setShowTokenModal] = useState(false);
	const [showRemoteSettingsModal, setShowRemoteSettingsModal] = useState(false);

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

	const updateExecutionTarget = async (
		nextExecutionTarget: "local" | "remote",
	) => {
		setExecutionTarget(nextExecutionTarget);
		await invoke("set_execution_target", {
			executionTarget: nextExecutionTarget,
		});
	};

	const updateRemoteServerUrl = async (nextRemoteServerUrl: string) => {
		setRemoteServerUrl(nextRemoteServerUrl);
		await invoke("set_remote_server_url", {
			remoteServerUrl: nextRemoteServerUrl,
		});
	};

	const updateRemoteAuthToken = async (nextRemoteAuthToken: string) => {
		setRemoteAuthToken(nextRemoteAuthToken);
		await invoke("set_remote_auth_token", {
			remoteAuthToken: nextRemoteAuthToken,
		});
	};

	const updateServerAuthToken = async (nextServerAuthToken: string) => {
		setServerAuthToken(nextServerAuthToken);
		await invoke("set_server_auth_token", {
			serverAuthToken: nextServerAuthToken,
		});
	};

	const refreshServerCliStatus = useCallback(async () => {
		const status = await invoke<ServerCliStatus>("get_server_cli_status");
		setServerCliStatus(status);
	}, []);

	const executeUpdate = useCallback(async () => {
		const update = await check();
		if (update === null) {
			return;
		}
		await update.downloadAndInstall();
		await message(
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
			const [version, granted, update] = await Promise.all([
				invoke<string>("get_current_version"),
				isPermissionGranted().catch(() => false),
				check().catch(() => null),
			]);
			setCurrentVersion(version);
			setNotificationPermission(granted);
			setIsUpdateAvailable(update !== null);
		};

		const unlistenPromise = setupDownloadProgressListener();
		void loadSettingsMetadata();
		void refreshServerCliStatus();

		return () => {
			unlistenPromise.then((unlisten) => unlisten());
		};
	}, [refreshServerCliStatus]);

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

	const updateServerCliRegistration = async (registered: boolean) => {
		setIsRegisteringServerCli(true);
		try {
			await invoke(
				registered ? "register_server_cli" : "unregister_server_cli",
			);
			await refreshServerCliStatus();
			toast.success(
				registered
					? "このPCのサーバーを常駐登録しました"
					: "このPCのサーバーの常駐登録を解除しました",
			);
		} catch (error) {
			toast.error(`常駐設定の更新に失敗しました:${String(error)}`);
		} finally {
			setIsRegisteringServerCli(false);
		}
	};

	const startServerCli = async () => {
		setIsOperatingServerCli(true);
		try {
			await invoke("start_server_cli");
			await refreshServerCliStatus();
			toast.success("このPCのサーバーを起動しました");
		} catch (error) {
			toast.error(`このPCのサーバーの起動に失敗しました:${String(error)}`);
		} finally {
			setIsOperatingServerCli(false);
		}
	};

	const stopServerCli = async () => {
		setIsOperatingServerCli(true);
		try {
			await invoke("stop_server_cli");
			await refreshServerCliStatus();
			toast.success("このPCのサーバーを停止しました");
		} catch (error) {
			toast.error(`このPCのサーバーの停止に失敗しました:${String(error)}`);
		} finally {
			setIsOperatingServerCli(false);
		}
	};

	const generateServerToken = async () => {
		const token = await invoke<string>("generate_remote_auth_token");
		await updateServerAuthToken(token);
		setGeneratedToken(token);
		setShowTokenModal(true);
	};

	const copyGeneratedToken = async () => {
		const token = generatedToken || serverAuthToken;
		if (token.trim() === "") {
			toast.error("コピーするトークンがありません");
			return;
		}
		try {
			await writeText(token);
			toast.success("トークンをコピーしました");
			setShowTokenModal(false);
		} catch (error) {
			toast.error(`トークンのコピーに失敗しました:${String(error)}`);
		}
	};

	const copyRemoteAuthToken = async () => {
		if (remoteAuthToken.trim() === "") {
			toast.error("コピーするトークンがありません");
			return;
		}
		try {
			await writeText(remoteAuthToken);
			toast.success("トークンをコピーしました");
			setShowRemoteSettingsModal(false);
		} catch (error) {
			toast.error(`トークンのコピーに失敗しました:${String(error)}`);
		}
	};

	const deleteRemoteAuthToken = async () => {
		await updateRemoteAuthToken("");
		toast.success("接続トークンを削除しました");
	};

	const deleteServerAuthToken = async () => {
		await updateServerAuthToken("");
		setGeneratedToken("");
		setShowTokenModal(false);
		toast.success("トークンを削除しました");
	};

	const testRemoteServer = async () => {
		setIsTestingRemoteServer(true);
		try {
			await invoke("test_remote_server", {
				serverUrl: remoteServerUrl,
				authToken: remoteAuthToken,
			});
			toast.success("リモートサーバーに接続できました");
		} catch (error) {
			toast.error(`リモートサーバーに接続できません:${String(error)}`);
		} finally {
			setIsTestingRemoteServer(false);
		}
	};

	const visibleToken = generatedToken || serverAuthToken;
	const serverTokenStatus =
		serverAuthToken.trim() === "" ? "未登録" : "登録済み";
	const remoteTokenStatus =
		remoteAuthToken.trim() === "" ? "未登録" : "登録済み";

	return (
		<div className="h-full min-h-0 overflow-hidden bg-base-100 p-2 text-base-content">
			<div className="mx-auto grid h-full min-w-0 max-w-5xl grid-rows-[minmax(0,1fr)_auto] gap-2">
				<div className="grid min-h-0 min-w-0 grid-rows-[5.125rem_4.625rem_7rem_8.5rem_3.625rem] gap-2 overflow-hidden">
					<SurfaceIsland className="grid min-h-0 gap-2 md:grid-cols-[minmax(0,1fr)_7rem] md:items-end">
						<ThemeSelector />
						<div className="flex h-9 items-end">
							<button
								className="btn btn-ghost h-9 min-h-9 w-full rounded-md bg-base-100 px-2 text-xs hover:bg-base-300"
								type="button"
								onClick={openToolsModal}
							>
								<Settings2 size={16} />
								ツール
							</button>
						</div>
					</SurfaceIsland>

					<SurfaceIsland className="grid min-h-0 gap-2">
						<div className="grid min-w-0 gap-2 md:grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)]">
							<label className="grid min-w-0 gap-1">
								<span className="flex items-center gap-2 text-xs font-semibold text-base-content/65">
									<HardDrive size={14} className="text-primary" />
									保存先
								</span>
								<div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-2">
									<AppInput
										value={saveDir}
										onChange={(event) => void updateSaveDir(event.target.value)}
										placeholder="/Users/name/Movies/yt-dlp-data"
									/>
									<button
										className="btn btn-ghost h-9 min-h-9 w-10 rounded-md bg-base-100 p-0 hover:bg-base-300"
										type="button"
										onClick={() => void chooseSaveDirectory()}
										aria-label="保存先を選択"
									>
										<FolderOpen size={18} />
									</button>
								</div>
							</label>
							<label className="grid min-w-0 gap-1">
								<span className="flex items-center gap-2 text-xs font-semibold text-base-content/65">
									<Cookie size={14} className="text-primary" />
									Cookieブラウザ
								</span>
								<AppInput
									value={browser}
									onChange={(event) => void updateBrowser(event.target.value)}
									placeholder="firefox"
								/>
							</label>
						</div>
					</SurfaceIsland>

					<SurfaceIsland className="grid min-h-0 gap-2 md:grid-cols-[8rem_minmax(0,1fr)]">
						<div className="grid min-h-0 gap-1">
							<div className="flex h-5 items-center gap-2 text-xs font-semibold text-base-content/65">
								<Network size={16} className="text-primary" />
								実行先
							</div>
							<div className="grid min-h-0 gap-1">
								<button
									className={`btn h-8 min-h-8 min-w-0 justify-start rounded-md px-3 text-sm ${
										executionTarget === "local"
											? "btn-primary"
											: "btn-ghost bg-base-100 hover:bg-base-300"
									}`}
									type="button"
									onClick={() => void updateExecutionTarget("local")}
								>
									<HardDrive size={16} />
									このPC
								</button>
								<button
									className={`btn h-8 min-h-8 min-w-0 justify-start rounded-md px-3 text-sm ${
										executionTarget === "remote"
											? "btn-primary"
											: "btn-ghost bg-base-100 hover:bg-base-300"
									}`}
									type="button"
									onClick={() => void updateExecutionTarget("remote")}
								>
									<Server size={16} />
									サーバー
								</button>
							</div>
						</div>
						<SurfacePanel className="grid min-h-0 gap-2 p-2 mt-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_9.5rem] md:items-center">
							{executionTarget === "remote" ? (
								<>
									<div className="grid min-w-0 grid-cols-[4rem_minmax(0,1fr)] items-center gap-2 rounded-md bg-base-200 px-3 py-2">
										<span className="text-[11px] font-semibold text-base-content/65">
											接続先
										</span>
										<span className="min-w-0 truncate text-sm font-semibold">
											{remoteServerUrl || "未設定"}
										</span>
									</div>
									<button
										className="btn btn-ghost h-8 min-h-8 rounded-md bg-base-200 px-2 text-xs hover:bg-base-300"
										type="button"
										onClick={() => setShowRemoteSettingsModal(true)}
									>
										<Settings2 size={16} />
										接続設定
									</button>
									<button
										className="btn btn-ghost h-8 min-h-8 rounded-md bg-base-200 px-2 text-xs hover:bg-base-300"
										type="button"
										disabled={isTestingRemoteServer}
										onClick={() => void testRemoteServer()}
									>
										{isTestingRemoteServer ? (
											<Loader2 size={16} className="animate-spin" />
										) : (
											<CheckCircle2 size={16} />
										)}
										接続確認
									</button>
								</>
							) : (
								<div>このPCで実行します。</div>
							)}
						</SurfacePanel>
					</SurfaceIsland>

					<SurfaceIsland className="grid min-h-0 grid-rows-[auto_2.5rem_2.25rem] gap-3">
						<div className="flex items-center gap-2 text-xs font-semibold text-base-content/65">
							<Server size={16} className="text-primary" />
							このPCをサーバーにする
							{serverCliStatus ? (
								<span className="ml-auto text-xs font-normal text-base-content/60">
									{serverCliStatus.running ? "起動中" : "停止中"} /{" "}
									{serverCliStatus.registered ? "登録済み" : "未登録"}
								</span>
							) : null}
						</div>
						<div className="grid min-w-0 gap-3 md:grid-cols-[auto_minmax(0,1fr)_9.5rem_10rem]">
							<div className="grid grid-cols-2 gap-2">
								<button
									className="btn btn-ghost h-10 min-h-10 w-11 rounded-md bg-base-100 p-0 hover:bg-base-300"
									type="button"
									disabled={isOperatingServerCli}
									title={serverCliStatus?.running ? "停止" : "起動"}
									aria-label={serverCliStatus?.running ? "停止" : "起動"}
									onClick={() =>
										void (serverCliStatus?.running
											? stopServerCli()
											: startServerCli())
									}
								>
									{isOperatingServerCli ? (
										<Loader2 size={16} className="animate-spin" />
									) : serverCliStatus?.running ? (
										<StopCircle size={16} />
									) : (
										<Play size={16} />
									)}
								</button>
								<button
									className="btn btn-ghost h-10 min-h-10 w-11 rounded-md bg-base-100 p-0 hover:bg-base-300"
									type="button"
									onClick={() => void refreshServerCliStatus()}
									aria-label="このPCのサーバー状態を更新"
								>
									<RefreshCw size={16} />
								</button>
							</div>
							<button
								className="btn btn-ghost h-10 min-h-10 min-w-0 rounded-md bg-base-100 px-2 text-xs hover:bg-base-300"
								type="button"
								onClick={() => {
									setGeneratedToken(serverAuthToken);
									setShowTokenModal(true);
								}}
							>
								<KeyRound size={16} />
								<span className="whitespace-nowrap">トークン管理</span>
							</button>
							<label className="grid h-10 min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-2 rounded-md bg-base-100 px-3">
								<span className="flex items-center gap-1 text-xs font-semibold text-base-content/65">
									<Hash size={14} className="text-primary" />
									ポート
								</span>
								<AppInput
									className="h-7 min-h-7 bg-base-100 px-2"
									value={serverPort}
									disabled={serverCliStatus?.running ?? false}
									inputMode="numeric"
									onChange={(event) => void changeServerPort(event)}
								/>
							</label>
							<label className="flex h-10 min-w-0 items-center justify-between gap-2 rounded-md bg-base-100 px-3">
								<span className="flex min-w-0 items-center gap-2 whitespace-nowrap text-xs font-semibold">
									<Server size={16} className="text-primary" />
									常駐
								</span>
								{isRegisteringServerCli ? (
									<Loader2 size={16} className="animate-spin" />
								) : (
									<input
										className="toggle toggle-primary toggle-sm shrink-0"
										type="checkbox"
										checked={serverCliStatus?.registered ?? false}
										onChange={(event) =>
											void updateServerCliRegistration(event.target.checked)
										}
									/>
								)}
							</label>
						</div>
						<div className="grid min-w-0 gap-2">
							<div className="flex h-9 min-w-0 items-center truncate rounded-md bg-base-100 px-3 text-xs text-base-content/55">
								{serverCliStatus?.path || "実行ファイルの場所を確認中"}
							</div>
						</div>
					</SurfaceIsland>

					<SurfaceIsland className="grid min-h-0 gap-2">
						<label className="flex min-h-10 min-w-0 items-center justify-between gap-2 rounded-md bg-base-100 px-3">
							<span className="flex min-w-0 items-center gap-2">
								<Bell size={18} className="shrink-0 text-primary" />
								<span className="min-w-0 whitespace-nowrap text-xs font-semibold">
									完了通知
								</span>
							</span>
							<input
								className="toggle toggle-primary toggle-sm shrink-0"
								type="checkbox"
								checked={isSendNotification}
								onChange={(event) =>
									void updateNotification(event.target.checked)
								}
							/>
						</label>

						{isSendNotification && notificationPermission === false ? (
							<div className="alert border-warning/35 bg-warning/10 py-2 text-sm md:col-span-2">
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
					</SurfaceIsland>
				</div>

				<footer className="flex h-6 items-center justify-center gap-2 text-xs text-base-content/60">
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

			{showRemoteSettingsModal ? (
				<div className="fixed inset-0 z-50 grid place-items-center bg-base-content/25 p-4 backdrop-blur-sm">
					<section className="grid w-full max-w-lg gap-3 rounded-lg border border-base-300 bg-base-100 p-4 shadow-xl">
						<header className="flex items-center justify-between">
							<h2 className="text-lg font-bold">接続設定</h2>
							<button
								className="btn btn-ghost btn-sm h-8 min-h-8 w-8 rounded-md p-0"
								type="button"
								onClick={() => setShowRemoteSettingsModal(false)}
								aria-label="閉じる"
							>
								<X size={18} />
							</button>
						</header>
						<label className="grid gap-1">
							<span className="label py-0 text-xs font-semibold text-base-content/65">
								サーバーURL
							</span>
							<AppInput
								value={remoteServerUrl}
								onChange={(event) =>
									void updateRemoteServerUrl(event.target.value)
								}
								placeholder="http://100.x.y.z:50000"
								type="url"
							/>
						</label>
						<label className="grid gap-1">
							<span className="label py-0 text-xs font-semibold text-base-content/65">
								トークン
							</span>
							<AppTextarea
								value={remoteAuthToken}
								onChange={(event) =>
									void updateRemoteAuthToken(event.target.value)
								}
							/>
						</label>
						<div className="grid gap-2 rounded-md bg-base-200 p-3 text-sm">
							<div className="flex items-center justify-between gap-3">
								<span className="text-base-content/65">状態</span>
								<span className="font-semibold">{remoteTokenStatus}</span>
							</div>
							<div className="flex items-center justify-between gap-3">
								<span className="text-base-content/65">期限</span>
								<span className="font-semibold">期限なし</span>
							</div>
						</div>
						<footer className="flex justify-end gap-2">
							<button
								className="btn btn-ghost h-9 min-h-9 rounded-md bg-base-200 text-sm hover:bg-base-300"
								type="button"
								onClick={() => setShowRemoteSettingsModal(false)}
							>
								閉じる
							</button>
							<button
								className="btn btn-ghost h-9 min-h-9 rounded-md bg-base-200 text-sm hover:bg-base-300"
								type="button"
								disabled={remoteAuthToken.trim() === ""}
								onClick={() => void deleteRemoteAuthToken()}
							>
								<X size={16} />
								削除
							</button>
							<button
								className="btn btn-primary h-9 min-h-9 rounded-md text-sm"
								type="button"
								disabled={remoteAuthToken.trim() === ""}
								onClick={() => void copyRemoteAuthToken()}
							>
								<Copy size={16} />
								コピー
							</button>
						</footer>
					</section>
				</div>
			) : null}

			{showTokenModal ? (
				<div className="fixed inset-0 z-50 grid place-items-center bg-base-content/25 p-4 backdrop-blur-sm">
					<section className="grid w-full max-w-lg gap-3 rounded-lg border border-base-300 bg-base-100 p-4 shadow-xl">
						<header className="flex items-center justify-between">
							<h2 className="text-lg font-bold">トークン管理</h2>
							<button
								className="btn btn-ghost btn-sm h-8 min-h-8 w-8 rounded-md p-0"
								type="button"
								onClick={() => setShowTokenModal(false)}
								aria-label="閉じる"
							>
								<X size={18} />
							</button>
						</header>
						<div className="grid gap-1">
							<span className="label py-0 text-xs font-semibold text-base-content/65">
								トークン
							</span>
							<div className="min-h-20 rounded-md border border-base-300 bg-base-200 p-3 font-mono text-xs break-all text-base-content">
								{visibleToken || "未登録"}
							</div>
						</div>
						<div className="grid gap-2 rounded-md bg-base-200 p-3 text-sm">
							<div className="flex items-center justify-between gap-3">
								<span className="text-base-content/65">状態</span>
								<span className="font-semibold">{serverTokenStatus}</span>
							</div>
							<div className="flex items-center justify-between gap-3">
								<span className="text-base-content/65">期限</span>
								<span className="font-semibold">期限なし</span>
							</div>
						</div>
						<footer className="flex flex-wrap justify-end gap-2">
							<button
								className="btn btn-ghost h-9 min-h-9 rounded-md bg-base-200 text-sm hover:bg-base-300"
								type="button"
								onClick={() => setShowTokenModal(false)}
							>
								閉じる
							</button>
							<button
								className="btn btn-ghost h-9 min-h-9 rounded-md bg-base-200 text-sm hover:bg-base-300"
								type="button"
								disabled={visibleToken.trim() === ""}
								onClick={() => void deleteServerAuthToken()}
							>
								<X size={16} />
								削除
							</button>
							<button
								className="btn btn-ghost h-9 min-h-9 rounded-md bg-base-200 text-sm hover:bg-base-300"
								type="button"
								onClick={() => void generateServerToken()}
							>
								<KeyRound size={16} />
								再生成
							</button>
							<button
								className="btn btn-primary h-9 min-h-9 rounded-md text-sm"
								type="button"
								disabled={visibleToken.trim() === ""}
								onClick={() => void copyGeneratedToken()}
							>
								<Copy size={16} />
								コピー
							</button>
						</footer>
					</section>
				</div>
			) : null}

			{showToolsModal ? (
				<div className="fixed inset-0 z-50 grid place-items-center bg-base-content/25 p-4 backdrop-blur-sm">
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
										className={`btn h-auto min-h-20 justify-start rounded-md p-3 ${
											tempUseBundle
												? "btn-primary"
												: "btn-ghost bg-base-200 hover:bg-base-300"
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
										className={`btn h-auto min-h-20 justify-start rounded-md p-3 ${
											tempUseBundle
												? "btn-ghost bg-base-200 hover:bg-base-300"
												: "btn-primary"
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
											<AppInput
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
											<AppInput
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
											<AppInput
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
									className="btn btn-ghost rounded-md bg-base-200 hover:bg-base-300"
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
								className="btn btn-ghost rounded-md bg-base-200 hover:bg-base-300"
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
