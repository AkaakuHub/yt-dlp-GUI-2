import { invoke } from "@tauri-apps/api/core";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { message } from "@tauri-apps/plugin-dialog";
import { check } from "@tauri-apps/plugin-updater";
import { Loader2, Package } from "lucide-react";
import React, { useCallback, useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { AppProvider } from "./app/contexts/AppContext";
import { useTheme } from "./app/contexts/ThemeContext";
import DownloadPage from "./features/download/DownloadPage";
import SettingsPage from "./features/settings/SettingsPage";
import ToolSetupPage from "./features/toolSetup/ToolSetupPage";
import {
	getSettings,
	hasWebAuthToken,
	initializeWebAuthToken,
	isTauriRuntime,
	listenDownloadProgress,
	setWebAuthToken,
} from "./shared/backend/runtime";
import { AppTabs } from "./shared/components/AppTabs";
import { AppInput } from "./shared/components/FormControls";
import { SurfaceIsland, SurfacePanel } from "./shared/components/Surface";
import ToolDownloadProgress, {
	type ToolDownloadProgressValue,
} from "./shared/components/ToolDownloadProgress";
import WindowControls from "./shared/components/WindowControls";
import { installAvailableUpdate } from "./shared/utils/appUpdate";
import { cn } from "./shared/utils/className";
import { checkToolAvailability } from "./shared/utils/toolAvailability";

import "./main.css";

initializeWebAuthToken();

type BootPhase = "checkingTools" | "updatingApp";

const formatBytes = (bytes: number): string => {
	if (bytes < 1024) {
		return `${bytes}B`;
	}
	if (bytes < 1024 * 1024) {
		return `${(bytes / 1024).toFixed(1)}KB`;
	}
	return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
};

type WebAuthGateProps = {
	children: React.ReactNode;
};

function WebAuthGate({ children }: WebAuthGateProps) {
	const [token, setToken] = useState("");
	const [hasToken, setHasToken] = useState(hasWebAuthToken);
	const [error, setError] = useState("");
	const [isConnecting, setIsConnecting] = useState(false);

	if (isTauriRuntime() || hasToken) {
		return <>{children}</>;
	}

	return (
		<div className="grid h-screen place-items-center bg-base-100 p-4 text-base-content">
			<SurfaceIsland className="w-full max-w-sm p-2 shadow-lg">
				<SurfacePanel className="grid gap-3 p-5">
					<h1 className="text-lg font-bold">接続トークン</h1>
					<AppInput
						value={token}
						onChange={(event) => setToken(event.target.value)}
						type="password"
					/>
					{error ? <p className="text-sm text-error">{error}</p> : null}
					<button
						className="btn btn-primary h-10 min-h-10 rounded-md"
						type="button"
						disabled={token.trim() === "" || isConnecting}
						onClick={async () => {
							setIsConnecting(true);
							setError("");
							setWebAuthToken(token.trim());
							try {
								await getSettings();
								setHasToken(true);
							} catch (connectError) {
								setError(`接続できません:${String(connectError)}`);
							} finally {
								setIsConnecting(false);
							}
						}}
					>
						{isConnecting ? "確認中" : "接続"}
					</button>
				</SurfacePanel>
			</SurfaceIsland>
		</div>
	);
}

type BootOverlayProps = {
	isExiting: boolean;
	phase: BootPhase;
	progress: ToolDownloadProgressValue | null;
};

function BootOverlay({ isExiting, phase, progress }: BootOverlayProps) {
	const title =
		phase === "updatingApp"
			? "アプリ更新中"
			: progress
				? "ツール更新中"
				: "ツール確認中";

	return (
		<div
			className={cn(
				"fixed inset-0 z-[100] grid place-items-center bg-base-content/20 p-4 text-base-content backdrop-blur-sm transition-opacity duration-200 ease-out",
				isExiting ? "opacity-0" : "opacity-100",
			)}
		>
			<SurfaceIsland className="w-full max-w-sm p-2 shadow-lg">
				<SurfacePanel className="grid gap-4 p-5">
					<div className="grid justify-items-center gap-3 text-center">
						<div className="grid size-11 place-items-center rounded-lg bg-base-200 text-primary">
							{progress ? (
								<Package size={26} />
							) : (
								<Loader2 className="animate-spin" size={26} />
							)}
						</div>
						<h1 className="text-lg font-bold">{title}</h1>
					</div>
					{progress ? (
						<ToolDownloadProgress progress={progress} tone="muted" />
					) : null}
				</SurfacePanel>
			</SurfaceIsland>
		</div>
	);
}

const App = () => {
	const [activeIndex, setActiveIndex] = useState<number>(0);
	const [showSetup, setShowSetup] = useState<boolean>(false);
	const [isBooting, setIsBooting] = useState<boolean>(true);
	const [isBootExiting, setIsBootExiting] = useState<boolean>(false);
	const [bootPhase, setBootPhase] = useState<BootPhase>("checkingTools");
	const [bootDownloadProgress, setBootDownloadProgress] =
		useState<ToolDownloadProgressValue | null>(null);
	const { actualTheme } = useTheme();
	const isDesktopRuntime = isTauriRuntime();

	const handleSetupComplete = () => {
		setShowSetup(false);
	};

	const promptUpdateIfAvailable = useCallback(async () => {
		const update = await check();
		if (update === null) {
			return;
		}

		const releaseNotes = update.body
			? `\n\nリリースノート:\n${update.body}`
			: "";
		const updateAnswer = await message(
			`最新バージョン(${update.version})があります。アップデートしますか？${releaseNotes}`,
			{
				title: "アップデートがあります",
				kind: "info",
				buttons: {
					ok: "はい",
					cancel: "いいえ",
				},
			},
		);
		if (updateAnswer !== "はい") {
			return;
		}

		setBootPhase("updatingApp");
		setBootDownloadProgress({
			tool_name: "アプリ更新",
			progress: 0,
			status: "ダウンロード準備中",
		});
		await installAvailableUpdate({
			update,
			onProgress: ({ downloadedBytes, contentLength }) => {
				const progress =
					contentLength !== null && contentLength > 0
						? Math.min((downloadedBytes / contentLength) * 100, 100)
						: 0;
				const status =
					contentLength !== null
						? `${formatBytes(downloadedBytes)}/${formatBytes(contentLength)}`
						: formatBytes(downloadedBytes);
				setBootDownloadProgress({
					tool_name: "アプリ更新",
					progress,
					status,
				});
			},
		});
	}, []);

	useEffect(() => {
		if (!isTauriRuntime()) {
			setIsBooting(false);
			setShowSetup(false);
			return;
		}

		const preventReload = (event: KeyboardEvent) => {
			if (event.key === "F5") {
				event.preventDefault();
			}
		};

		document.addEventListener("keydown", preventReload);
		let unlistenDownloadProgress: UnlistenFn | null = null;
		let isCanceled = false;
		let bootFadeTimeout: number | null = null;

		const boot = async () => {
			try {
				unlistenDownloadProgress =
					await listenDownloadProgress<ToolDownloadProgressValue>((payload) => {
						setBootDownloadProgress(payload);
					});
				const settings = await getSettings();
				await promptUpdateIfAvailable();
				if (settings.execution_target === "remote") {
					setShowSetup(false);
					return;
				}
				const currentStatus = await checkToolAvailability(
					settings.use_bundle_tools,
					settings.yt_dlp_path,
					settings.ffmpeg_path,
					settings.deno_path,
				);
				if (!currentStatus.ok) {
					if (
						settings.use_bundle_tools &&
						currentStatus.bundleToolResidueFound
					) {
						await invoke("download_bundle_tools");
						const repairedStatus = await checkToolAvailability(
							settings.use_bundle_tools,
							settings.yt_dlp_path,
							settings.ffmpeg_path,
							settings.deno_path,
						);
						setShowSetup(!repairedStatus.ok);
						return;
					}
					setShowSetup(true);
					return;
				}
				if (settings.use_bundle_tools) {
					await invoke("ensure_bundle_tools");
					const updatedStatus = await checkToolAvailability(
						settings.use_bundle_tools,
						settings.yt_dlp_path,
						settings.ffmpeg_path,
						settings.deno_path,
					);
					setShowSetup(!updatedStatus.ok);
					return;
				}
				setShowSetup(false);
			} catch (error) {
				console.error("Failed to boot app:", error);
				setShowSetup(true);
			} finally {
				if (unlistenDownloadProgress !== null) {
					unlistenDownloadProgress();
					unlistenDownloadProgress = null;
				}
				if (!isCanceled) {
					setIsBootExiting(true);
					bootFadeTimeout = window.setTimeout(() => {
						setIsBooting(false);
					}, 220);
				}
			}
		};

		boot();

		return () => {
			isCanceled = true;
			document.removeEventListener("keydown", preventReload);
			if (unlistenDownloadProgress !== null) {
				unlistenDownloadProgress();
				unlistenDownloadProgress = null;
			}
			if (bootFadeTimeout !== null) {
				window.clearTimeout(bootFadeTimeout);
			}
		};
	}, [promptUpdateIfAvailable]);

	if (showSetup) {
		return (
			<div className="relative flex h-screen flex-col overflow-hidden bg-base-100 text-base-content">
				<ToastContainer
					position="top-right"
					autoClose={5000}
					icon={false}
					hideProgressBar={false}
					newestOnTop={false}
					closeButton={false}
					closeOnClick
					rtl={false}
					draggable
					pauseOnFocusLoss={false}
					pauseOnHover
					theme={actualTheme}
				/>
				<ToolSetupPage onComplete={handleSetupComplete} />
				{isBooting ? (
					<BootOverlay
						isExiting={isBootExiting}
						phase={bootPhase}
						progress={bootDownloadProgress}
					/>
				) : null}
			</div>
		);
	}

	return (
		<div className="relative flex h-screen flex-col overflow-hidden bg-base-100 text-base-content">
			{isDesktopRuntime ? <WindowControls /> : null}
			<ToastContainer
				position="top-right"
				autoClose={5000}
				icon={false}
				hideProgressBar={false}
				newestOnTop={false}
				closeButton={false}
				closeOnClick
				rtl={false}
				draggable
				pauseOnFocusLoss={false}
				pauseOnHover
				theme={actualTheme}
				style={{
					top: "84px",
				}}
			/>
			<AppTabs
				tabNames={isDesktopRuntime ? ["ホーム", "設定"] : ["ホーム"]}
				setActiveIndex={setActiveIndex}
				activeIndex={activeIndex}
			/>
			<div className="min-h-0 flex-1 overflow-hidden">
				<div className={cn(activeIndex === 0 ? "h-full min-h-0" : "hidden")}>
					<DownloadPage />
				</div>
				{isDesktopRuntime ? (
					<div className={cn(activeIndex === 1 ? "h-full min-h-0" : "hidden")}>
						<SettingsPage />
					</div>
				) : null}
			</div>
			{isBooting ? (
				<BootOverlay
					isExiting={isBootExiting}
					phase={bootPhase}
					progress={bootDownloadProgress}
				/>
			) : null}
		</div>
	);
};

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
	<React.StrictMode>
		<WebAuthGate>
			<AppProvider>
				<App />
			</AppProvider>
		</WebAuthGate>
	</React.StrictMode>,
);
