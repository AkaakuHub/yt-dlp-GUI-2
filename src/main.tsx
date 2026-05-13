import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
	isPermissionGranted,
	requestPermission,
	sendNotification,
} from "@tauri-apps/plugin-notification";
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

const App = () => {
	const [activeIndex, setActiveIndex] = useState<number>(0);
	const [showSetup, setShowSetup] = useState<boolean>(true);
	const [isBooting, setIsBooting] = useState<boolean>(true);
	const [isBootExiting, setIsBootExiting] = useState<boolean>(false);
	const [bootDownloadProgress, setBootDownloadProgress] =
		useState<ToolDownloadProgressValue | null>(null);
	const { actualTheme } = useTheme();

	const handleSetupComplete = () => {
		setShowSetup(false);
	};

	const notifyUpdateIfAvailable = useCallback(async (settings: ConfigProps) => {
		if (!settings.is_send_notification) {
			return;
		}
		const update = await check().catch(() => null);
		if (update === null) {
			return;
		}

		let permissionGranted = await isPermissionGranted().catch(() => false);
		if (!permissionGranted) {
			const permission = await requestPermission().catch(() => "denied");
			permissionGranted = permission === "granted";
		}
		if (!permissionGranted) {
			return;
		}

		sendNotification({
			title: "アップデートがあります",
			body: `バージョン${update.version}を利用できます。`,
			autoCancel: true,
			ongoing: false,
		});
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
				void notifyUpdateIfAvailable(settings);
				if (settings.execution_target === "remote") {
					setShowSetup(false);
					return;
				}
				if (settings.use_bundle_tools) {
					await invoke("ensure_bundle_tools");
				}
				const status = await checkToolAvailability(
					settings.use_bundle_tools,
					settings.yt_dlp_path,
					settings.ffmpeg_path,
					settings.deno_path,
				);
				setShowSetup(!status.ok);
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
	}, [notifyUpdateIfAvailable]);

	if (isBooting) {
		return (
			<div
				className={`grid h-screen overflow-hidden bg-base-100 p-3 text-base-content transition-opacity duration-200 ease-out ${
					isBootExiting ? "opacity-0" : "opacity-100"
				}`}
			>
				<SurfaceIsland className="m-auto grid w-full max-w-sm gap-3 p-3 text-center">
					<SurfacePanel className="grid gap-3">
						{bootDownloadProgress ? (
							<Package className="mx-auto text-primary" size={28} />
						) : (
							<Loader2
								className="mx-auto animate-spin text-primary"
								size={28}
							/>
						)}
						<h1 className="text-lg font-bold">
							{bootDownloadProgress ? "ツール更新中" : "ツール確認中"}
						</h1>
						{bootDownloadProgress ? (
							<ToolDownloadProgress
								progress={bootDownloadProgress}
								tone="muted"
							/>
						) : null}
					</SurfacePanel>
				</SurfaceIsland>
			</div>
		);
	}

	if (showSetup) {
		return (
			<div className="flex h-screen flex-col overflow-hidden bg-base-100 text-base-content">
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
			</div>
		);
	}

	return (
		<div className="flex h-screen flex-col overflow-hidden bg-base-100 text-base-content">
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
