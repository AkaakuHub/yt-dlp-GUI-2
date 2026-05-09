import { invoke } from "@tauri-apps/api/tauri";
import { checkUpdate } from "@tauri-apps/api/updater";
import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { ToastContainer } from "react-toastify";
import { AppProvider } from "./_components/AppContext";
import { TabComponent } from "./_components/TabComponent";
import { useTheme } from "./_components/ThemeContext";
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
	const { actualTheme } = useTheme();

	const handleSetupComplete = () => {
		setShowSetup(false);
	};

	useEffect(() => {
		// リロード禁止
		document.addEventListener("keydown", (e) => {
			if (e.key === "F5") {
				e.preventDefault();
			}
		});

		// 1. アップデート確認を最優先
		// 2. ツールチェックはアップデート確認後に実施
		const boot = async () => {
			try {
				const update = await checkUpdate();
				// アップデート確認が走ったあとにのみツールチェックを行う
				try {
					const settings = await invoke<ConfigProps>("get_settings");
					if (settings?.use_bundle_tools ?? true) {
						try {
							await invoke("ensure_bundle_tools");
						} catch {
							// ensure が失敗しても、そのまま availability チェックへ進む
						}
					}
					const status = await checkToolAvailability(
						settings?.use_bundle_tools ?? true,
						settings?.yt_dlp_path,
						settings?.ffmpeg_path,
						settings?.deno_path,
					);
					setShowSetup(!status.ok);
				} catch {
					setShowSetup(true);
				}

				// 更新可能であれば Setting 画面の checkUpdate に任せる（ここでは UI を変えない）
				if (update.shouldUpdate) {
					// 後続で Setting の useEffect がダイアログを出す
				}
			} catch {
				// アップデート確認に失敗してもツールチェックだけは実行して判定
				try {
					const settings = await invoke<ConfigProps>("get_settings");
					if (settings?.use_bundle_tools ?? true) {
						try {
							await invoke("ensure_bundle_tools");
						} catch {
							// ensure が失敗しても、そのまま availability チェックへ進む
						}
					}
					const status = await checkToolAvailability(
						settings?.use_bundle_tools ?? true,
						settings?.yt_dlp_path,
						settings?.ffmpeg_path,
						settings?.deno_path,
					);
					setShowSetup(!status.ok);
				} catch {
					setShowSetup(true);
				}
			}
		};

		boot();
	}, []);

	if (showSetup) {
		return (
			<div className="flex h-screen flex-col overflow-hidden bg-base-100 text-base-content">
				<ToastContainer
					position="top-left"
					autoClose={5000}
					hideProgressBar={false}
					newestOnTop={false}
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
				hideProgressBar={false}
				newestOnTop={false}
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
				{activeIndex === 0 ? <Home /> : <Setting />}
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
