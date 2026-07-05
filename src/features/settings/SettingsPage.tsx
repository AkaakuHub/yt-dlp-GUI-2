import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { open } from "@tauri-apps/plugin-dialog";
import {
	isPermissionGranted,
	requestPermission,
} from "@tauri-apps/plugin-notification";
import { check } from "@tauri-apps/plugin-updater";
import {
	Bell,
	CheckCircle2,
	Cookie,
	Copy,
	FolderOpen,
	HardDrive,
	Hash,
	KeyRound,
	Loader2,
	Network,
	RefreshCw,
	Server,
	Settings2,
	X,
} from "lucide-react";
import { type ChangeEvent, useCallback, useEffect, useState } from "react";
import { toast } from "react-toastify";
import { useAppContext } from "../../app/contexts/AppContext";
import {
	isTauriRuntime,
	setKeepRunningInTraySetting,
} from "../../shared/backend/runtime";
import { AppInput, AppTextarea } from "../../shared/components/FormControls";
import { SurfaceIsland, SurfacePanel } from "../../shared/components/Surface";
import ThemeSelector from "../../shared/components/ThemeSelector";
import { type ToolDownloadProgressValue } from "../../shared/components/ToolDownloadProgress";
import { installAvailableUpdate } from "../../shared/utils/appUpdate";
import { cn } from "../../shared/utils/className";
import { checkToolAvailability } from "../../shared/utils/toolAvailability";
import type { ConfigProps } from "../../types";
import { ToolsSettingsModal } from "./components/ToolsSettingsModal";

type ToolCheckResults = {
	ytDlp: boolean;
	ffmpeg: boolean;
	deno: boolean;
};

type PersistentServerStatus = {
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

const MACOS_OS_TYPE = "macos";

const parseServerPort = (value: string): number | null => {
	const parsedPort = Number.parseInt(value, 10);
	if (Number.isNaN(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
		return null;
	}
	return parsedPort;
};

export default function SettingsPage() {
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
		keepRunningInTray,
		setKeepRunningInTray,
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
		useState<ToolDownloadProgressValue | null>(null);
	const [downloadedOnce, setDownloadedOnce] = useState(false);
	const [isRegisteringPersistentServer, setIsRegisteringPersistentServer] =
		useState(false);
	const [isTestingRemoteServer, setIsTestingRemoteServer] = useState(false);
	const [persistentServerStatus, setPersistentServerStatus] =
		useState<PersistentServerStatus | null>(null);
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

	const updateKeepRunningInTray = async (nextKeepRunningInTray: boolean) => {
		setKeepRunningInTray(nextKeepRunningInTray);
		await setKeepRunningInTraySetting(nextKeepRunningInTray);
	};

	const refreshPersistentServerStatus = useCallback(async () => {
		const status = await invoke<PersistentServerStatus>(
			"get_persistent_server_status",
		);
		setPersistentServerStatus(status);
	}, []);

	const executeUpdate = useCallback(async () => {
		const update = await check();
		if (update === null) {
			return;
		}
		await installAvailableUpdate();
	}, []);

	useEffect(() => {
		const setupDownloadProgressListener = async () => {
			return listen<ToolDownloadProgressValue>("download-progress", (event) => {
				setDownloadProgress(event.payload);
			});
		};

		const loadSettingsMetadata = async () => {
			const [version, detectedOsType, update] = await Promise.all([
				invoke<string>("get_current_version"),
				invoke<string>("get_os_type"),
				check().catch(() => null),
			]);
			const granted =
				detectedOsType === MACOS_OS_TYPE
					? await isPermissionGranted().catch(() => false)
					: null;
			setCurrentVersion(version);
			setOsType(detectedOsType);
			setNotificationPermission(granted);
			setIsUpdateAvailable(update !== null);
		};

		const unlistenPromise = setupDownloadProgressListener();
		void loadSettingsMetadata();
		void refreshPersistentServerStatus();
		const refreshOnVisible = () => {
			if (document.visibilityState === "visible") {
				void refreshPersistentServerStatus();
			}
		};
		window.addEventListener("focus", refreshPersistentServerStatus);
		document.addEventListener("visibilitychange", refreshOnVisible);

		return () => {
			window.removeEventListener("focus", refreshPersistentServerStatus);
			document.removeEventListener("visibilitychange", refreshOnVisible);
			unlistenPromise.then((unlisten) => unlisten());
		};
	}, [refreshPersistentServerStatus]);

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

	const updatePersistentServerRegistration = async (registered: boolean) => {
		setIsRegisteringPersistentServer(true);
		try {
			await invoke(
				registered
					? "register_persistent_server"
					: "unregister_persistent_server",
			);
			await refreshPersistentServerStatus();
			toast.success(
				registered
					? "このPCのWebサーバーをログイン時起動に登録しました"
					: "このPCのWebサーバーのログイン時起動を解除しました",
			);
		} catch (error) {
			toast.error(`常駐設定の更新に失敗しました:${String(error)}`);
		} finally {
			setIsRegisteringPersistentServer(false);
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
	const isDesktopRuntime = isTauriRuntime();

	return (
		<div className="h-full min-h-0 overflow-hidden bg-base-100 p-2 text-base-content">
			<div className="mx-auto grid h-full min-w-0 max-w-5xl grid-rows-[minmax(0,1fr)_auto] gap-2">
				<div
					className={cn(
						"grid min-h-0 min-w-0 gap-2 overflow-hidden",
						isDesktopRuntime
							? "grid-rows-[5.125rem_4.625rem_7rem_8.5rem_3.625rem]"
							: "grid-rows-[5.125rem_4.625rem_8.5rem_3.625rem]",
					)}
				>
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

					<SurfaceIsland className="grid min-h-0 gap-2 md:grid-cols-2">
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

					{isDesktopRuntime ? (
						<SurfaceIsland className="grid min-h-0 gap-2 md:grid-cols-[8rem_minmax(0,1fr)]">
							<div className="grid min-h-0 gap-1">
								<div className="flex h-5 items-center gap-2 text-xs font-semibold text-base-content/65">
									<Network size={16} className="text-primary" />
									実行先
								</div>
								<div className="grid min-h-0 gap-1">
									<button
										className={cn(
											"btn h-8 min-h-8 min-w-0 justify-start rounded-md px-3 text-sm",
											executionTarget === "local"
												? "btn-primary"
												: "btn-ghost bg-base-100 hover:bg-base-300",
										)}
										type="button"
										onClick={() => void updateExecutionTarget("local")}
									>
										<HardDrive size={16} />
										このPC
									</button>
									<button
										className={cn(
											"btn h-8 min-h-8 min-w-0 justify-start rounded-md px-3 text-sm",
											executionTarget === "remote"
												? "btn-primary"
												: "btn-ghost bg-base-100 hover:bg-base-300",
										)}
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
					) : null}

					<SurfaceIsland className="grid min-h-0 grid-rows-[auto_2.5rem_2.25rem] gap-3">
						<div className="flex items-center gap-2 text-xs font-semibold text-base-content/65">
							<Server size={16} className="text-primary" />
							このPCをサーバーにする
							{persistentServerStatus ? (
								<span className="ml-auto text-xs font-normal text-base-content/60">
									{persistentServerStatus.running ? "起動中" : "停止中"} /{" "}
									{persistentServerStatus.registered ? "登録済み" : "未登録"}
								</span>
							) : null}
						</div>
						<div className="grid min-w-0 gap-3 md:grid-cols-[auto_minmax(0,1fr)_9.5rem_10rem]">
							<button
								className="btn btn-ghost h-10 min-h-10 w-11 rounded-md bg-base-100 p-0 hover:bg-base-300"
								type="button"
								onClick={() => void refreshPersistentServerStatus()}
								aria-label="このPCのWebサーバー状態を更新"
							>
								<RefreshCw size={16} />
							</button>
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
									disabled={persistentServerStatus?.running ?? false}
									inputMode="numeric"
									onChange={(event) => void changeServerPort(event)}
								/>
							</label>
							<label className="dark-control-border flex h-10 min-w-0 items-center justify-between gap-2 rounded-md border border-base-300 bg-base-100 px-3">
								<span className="flex min-w-0 items-center gap-2 whitespace-nowrap text-xs font-semibold">
									<Server size={16} className="text-primary" />
									ログイン時起動
								</span>
								{isRegisteringPersistentServer ? (
									<Loader2 size={16} className="animate-spin" />
								) : (
									<input
										className="toggle toggle-primary toggle-sm shrink-0"
										type="checkbox"
										checked={persistentServerStatus?.registered ?? false}
										onChange={(event) =>
											void updatePersistentServerRegistration(
												event.target.checked,
											)
										}
									/>
								)}
							</label>
						</div>
						<div className="grid min-w-0 gap-2">
							<div className="flex h-9 min-w-0 items-center truncate rounded-md bg-base-100 px-3 text-xs text-base-content/55">
								{persistentServerStatus?.path || "実行ファイルの場所を確認中"}
							</div>
						</div>
					</SurfaceIsland>

					<SurfaceIsland className="grid min-h-0 gap-2">
						<label className="dark-control-border flex min-h-10 min-w-0 items-center justify-between gap-2 rounded-md border border-base-300 bg-base-100 px-3">
							<span className="flex min-w-0 items-center gap-2">
								<Server size={18} className="shrink-0 text-primary" />
								<span className="min-w-0 whitespace-nowrap text-xs font-semibold">
									×で閉じても常駐
								</span>
							</span>
							<input
								className="toggle toggle-primary toggle-sm shrink-0"
								type="checkbox"
								checked={keepRunningInTray}
								onChange={(event) =>
									void updateKeepRunningInTray(event.target.checked)
								}
							/>
						</label>
						<label className="dark-control-border flex min-h-10 min-w-0 items-center justify-between gap-2 rounded-md border border-base-300 bg-base-100 px-3">
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

						{isSendNotification &&
						osType === MACOS_OS_TYPE &&
						notificationPermission === false ? (
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
				<ToolsSettingsModal
					downloadProgress={downloadProgress}
					downloadedOnce={downloadedOnce}
					isCheckingTools={isCheckingTools}
					isDownloadingTools={isDownloadingTools}
					tempDenoPath={tempDenoPath}
					tempFfmpegPath={tempFfmpegPath}
					tempUseBundle={tempUseBundle}
					tempYtDlpPath={tempYtDlpPath}
					toolCheckResults={toolCheckResults}
					onCheckTools={() => void checkTools()}
					onClose={() => setShowToolsModal(false)}
					onDownloadBundleTools={() => void downloadBundleTools()}
					onSaveToolsSettings={() => void saveToolsSettings()}
					onTempDenoPathChange={setTempDenoPath}
					onTempFfmpegPathChange={setTempFfmpegPath}
					onTempUseBundleChange={setTempUseBundle}
					onTempYtDlpPathChange={setTempYtDlpPath}
				/>
			) : null}
		</div>
	);
}
