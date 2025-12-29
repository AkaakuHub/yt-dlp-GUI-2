import { invoke } from "@tauri-apps/api/tauri";
import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { ToastContainer } from "react-toastify";
import { AppProvider } from "./_components/AppContext";
import WindowControls from "./_components/WindowControls";
import { checkToolAvailability } from "./_utils/toolAvailability";
import Home from "./Home";
import Setting from "./Setting";
import ToolSetup from "./ToolSetup";
import type { ConfigProps } from "./types";
import "react-toastify/dist/ReactToastify.css";

import type SwiperCore from "swiper";
import { Swiper, SwiperSlide } from "swiper/react";
import "swiper/css";
import "swiper/css/pagination";

import { TabComponent } from "./_components/TabComponent";

import "./main.css";

const App = () => {
	const [activeIndex, setActiveIndex] = useState<number>(0);
	const [swiper, setSwiper] = useState<SwiperCore | null>(null);
	const [showSetup, setShowSetup] = useState<boolean>(true);

	const handleSlideChange = (swiper: SwiperCore): void => {
		setActiveIndex(swiper.activeIndex);
	};

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

		// 設定をチェックして初回起動かどうかを判定
		const checkSetup = async () => {
			try {
				const settings = await invoke<ConfigProps>("get_settings");
				const status = await checkToolAvailability(
					settings?.use_bundle_tools ?? true,
					settings?.yt_dlp_path,
					settings?.ffmpeg_path,
					settings?.deno_path,
				);
				setShowSetup(!status.ok);
			} catch {
				// 設定読み込み失敗時はセットアップを表示
				setShowSetup(true);
			}
		};

		checkSetup();
	}, []);

	if (showSetup) {
		return (
			<div className="main-app-root">
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
					theme="light"
				/>
				<ToolSetup onComplete={handleSetupComplete} />
			</div>
		);
	}

	return (
		<div className="main-app-root">
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
				theme="light"
				style={{
					top: "84px",
				}}
			/>
			<TabComponent
				tabNames={["ホーム", "設定"]}
				swiper={swiper}
				setActiveIndex={setActiveIndex}
				activeIndex={activeIndex}
			/>
			<div className="body-wrapper">
				<Swiper
					spaceBetween={0}
					slidesPerView={1}
					onSwiper={setSwiper}
					onSlideChange={handleSlideChange}
					preventClicks={false}
					preventClicksPropagation={false}
					simulateTouch={false}
					style={{
						display: "flex",
						height: "calc(100vh - 89px)",
						margin: "0 4px 4px 4px",
					}}
				>
					<SwiperSlide>
						<Home />
					</SwiperSlide>
					<SwiperSlide>
						<Setting />
					</SwiperSlide>
				</Swiper>
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
