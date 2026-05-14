import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { ask, message } from "@tauri-apps/plugin-dialog";
import { relaunch } from "@tauri-apps/plugin-process";
import { check } from "@tauri-apps/plugin-updater";
import { Loader2, Package } from "lucide-react";
import React, { useCallback, useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { AppProvider } from "./_components/AppContext";
import { SurfaceIsland, SurfacePanel } from "./_components/Surface";
import { TabComponent } from "./_components/TabComponent";
import { useTheme } from "./_components/ThemeContext";
import ToolDownloadProgress, {
	type ToolDownloadProgressValue,
} from "./_components/ToolDownloadProgress";
import WindowControls from "./_components/WindowControls";
import { checkToolAvailability } from "./_utils/toolAvailability";
import Home from "./Home";
import Setting from "./Setting";
import ToolSetup from "./ToolSetup";
import type { ConfigProps } from "./types";

import "./main.css";

type BootOverlayProps = {
	isExiting: boolean;
	progress: ToolDownloadProgressValue | null;
};

function BootOverlay({ isExiting, progress }: BootOverlayProps) {
	return (
		<div
			className={`fixed inset-0 z-[100] grid place-items-center bg-base-content/20 p-4 text-base-content backdrop-blur-sm transition-opacity duration-200 ease-out ${
				isExiting ? "opacity-0" : "opacity-100"
			}`}
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
						<h1 className="text-lg font-bold">
							{progress ? "ツール更新中" : "ツール確認中"}
						</h1>
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
	const [bootDownloadProgress, setBootDownloadProgress] =
		useState<ToolDownloadProgressValue | null>(null);
	const { actualTheme } = useTheme();

	const handleSetupComplete = () => {
		setShowSetup(false);
	};

	const promptUpdateIfAvailable = useCallback(async () => {
		const update = await check().catch(() => null);
		if (update === null) {
			return;
		}

		const shouldUpdate = await ask(
			`最新バージョン(${update.version})があります！アップデートしますか？`,
			{
				okLabel: "はい",
				cancelLabel: "いいえ",
			},
		);
		if (!shouldUpdate) {
			return;
		}

		await update.downloadAndInstall();
		await message(
			"アップデートが完了しました。アプリケーションを再起動します。",
		);
		await relaunch();
	}, []);

	useEffect(() => {
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
				unlistenDownloadProgress = await listen<ToolDownloadProgressValue>(
					"download-progress",
					(event) => {
						setBootDownloadProgress(event.payload);
					},
				);
				const settings = await invoke<ConfigProps>("get_settings");
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
					position="top-left"
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
				<ToolSetup onComplete={handleSetupComplete} />
				{isBooting ? (
					<BootOverlay
						isExiting={isBootExiting}
						progress={bootDownloadProgress}
					/>
				) : null}
			</div>
		);
	}

	return (
		<div className="relative flex h-screen flex-col overflow-hidden bg-base-100 text-base-content">
			<WindowControls />
			<ToastContainer
				position="top-left"
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
			<TabComponent
				tabNames={["ホーム", "設定"]}
				setActiveIndex={setActiveIndex}
				activeIndex={activeIndex}
			/>
			<div className="min-h-0 flex-1 overflow-hidden">
				<div className={activeIndex === 0 ? "h-full min-h-0" : "hidden"}>
					<Home />
				</div>
				<div className={activeIndex === 1 ? "h-full min-h-0" : "hidden"}>
					<Setting />
				</div>
			</div>
			{isBooting ? (
				<BootOverlay
					isExiting={isBootExiting}
					progress={bootDownloadProgress}
				/>
			) : null}
		</div>
	);
};

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
	<React.StrictMode>
		<AppProvider>
			<App />
		</AppProvider>
	</React.StrictMode>,
);
