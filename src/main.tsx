import { invoke } from "@tauri-apps/api/tauri";
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
		const preventReload = (event: KeyboardEvent) => {
			if (event.key === "F5") {
				event.preventDefault();
			}
		};

		document.addEventListener("keydown", preventReload);

		const boot = async () => {
			try {
				const settings = await invoke<ConfigProps>("get_settings");
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
			}
		};

		boot();

		return () => {
			document.removeEventListener("keydown", preventReload);
		};
	}, []);

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
