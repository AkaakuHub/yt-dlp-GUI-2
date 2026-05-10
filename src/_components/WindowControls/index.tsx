import {
	isPermissionGranted,
	sendNotification,
} from "@tauri-apps/plugin-notification";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAppContext } from "../AppContext";
import { eventEmitter } from "../EventEmitter";

function WindowControls() {
	const sendNotificationHandler = useCallback(
		async (title: string, body: string) => {
			try {
				const permissionGranted = await isPermissionGranted();
				if (permissionGranted) {
					sendNotification({
						title,
						body,
						autoCancel: true,
						ongoing: false,
					});
				}
			} catch {}
		},
		[],
	);

	const DownloadProgress = () => {
		const { latestConsoleText } = useAppContext();
		const { isSendNotification } = useAppContext();

		const [isDownloading, setIsDownloading] = useState(false);
		const [progressPercentage, setProgressPercentage] = useState(0);
		const [videoTitle, setVideoTitle] = useState("");
		const [scrollKey, setScrollKey] = useState(0);

		const [progressText, setProgressText] = useState("");

		const removeEmptyFromArray = useCallback((array: string[]) => {
			return array.filter((item) => item !== "");
		}, []);

		useEffect(() => {
			let formattedPercentageString = "";

			if (latestConsoleText.startsWith("[download]")) {
				setIsDownloading(true);
				const splittedArray = removeEmptyFromArray(
					latestConsoleText.split(" "),
				);
				try {
					const percentage = splittedArray[1].replace("%", "");
					const parsedPercentage = parseFloat(percentage);
					const percentageString = parsedPercentage.toFixed(1);

					if (percentageString.length === 3) {
						formattedPercentageString = ` ${percentageString}`;
					} else if (percentageString === "100.0") {
						formattedPercentageString = " 100";
					} else {
						formattedPercentageString = percentageString;
					}
					setProgressPercentage(parsedPercentage);
					setProgressText(`残り ??:?? (${formattedPercentageString}%)`);
				} catch {}

				if (latestConsoleText.includes("ETA")) {
					try {
						const remainingTime = latestConsoleText
							.split("ETA ")[1]
							.split(" ")[0];
						if (remainingTime) {
							if (remainingTime !== "Unknown") {
								setProgressText(
									`残り ${remainingTime} (${formattedPercentageString}%)`,
								);
							} else {
								setProgressText(`残り ??:?? (${formattedPercentageString}%)`);
							}
						}
					} catch {
						try {
							const remainingTime2 = latestConsoleText.split("ETA ")[1];
							if (remainingTime2) {
								setProgressText(
									`残り ${remainingTime2} (${formattedPercentageString}%)`,
								);
							}
						} catch {}
					}
				} else if (!latestConsoleText.includes("Destination:")) {
					const finalTime = splittedArray[5];
					setProgressText(`DL完了。所要時間 ${finalTime}`);
				}
				try {
					const videoTitleExtracted = latestConsoleText
						.split("Destination: ")[1]
						?.split("\\")
						.pop();
					if (videoTitleExtracted && videoTitle !== videoTitleExtracted) {
						setProgressText(`ダウンロード中...`);
						setVideoTitle(videoTitleExtracted);
						setScrollKey((prevKey) => prevKey + 1);
					}
				} catch {}
			} else if (latestConsoleText.startsWith("[Merger]")) {
				setIsDownloading(true);
				setProgressText("マージ中...");
				setProgressPercentage(100);
			} else if (latestConsoleText.startsWith("[Fixup")) {
				setIsDownloading(true);
				setProgressText("コンテナ処理中...");
				setProgressPercentage(100);
			} else {
				setIsDownloading(false);
				setProgressPercentage(0);
				if (videoTitle !== "") {
					if (isSendNotification) {
						void sendNotificationHandler(
							"ダウンロード完了",
							`${videoTitle} のダウンロードが完了しました。`,
						);
					}
					eventEmitter.emit("refreshFiles");
				}
				setVideoTitle("");
			}
		}, [
			isSendNotification,
			latestConsoleText,
			removeEmptyFromArray,
			videoTitle,
		]);

		const [shouldScroll, setShouldScroll] = useState(false);
		const [scrollDuration, setScrollDuration] = useState(0);
		const scrollingTextRef = useRef<HTMLSpanElement | null>(null);

		useEffect(() => {
			if (!videoTitle) {
				setShouldScroll(false);
				setScrollDuration(0);
				return;
			}
			if (scrollingTextRef.current) {
				const textElement: HTMLElement = scrollingTextRef.current;

				const wrapper = textElement?.parentElement;
				const textWidth = textElement?.offsetWidth;
				const wrapperWidth = wrapper?.offsetWidth;

				if (wrapperWidth && textWidth > wrapperWidth) {
					setShouldScroll(true);
					setScrollDuration(textWidth / 50);
				} else {
					setShouldScroll(false);
				}
			}
		}, [videoTitle]);

		useEffect(() => {
			const textElement = scrollingTextRef.current;
			if (!textElement || !shouldScroll || scrollDuration <= 0) {
				return;
			}

			const animation = textElement.animate(
				[{ transform: "translateX(100%)" }, { transform: "translateX(-100%)" }],
				{
					duration: scrollDuration * 1000,
					iterations: Infinity,
					easing: "linear",
				},
			);

			return () => {
				animation.cancel();
			};
		}, [scrollDuration, shouldScroll]);

		return (
			<>
				{isDownloading ? (
					<div
						data-tauri-drag-region
						className="relative z-[4] h-[29px] w-full overflow-hidden bg-[#223]"
					>
						<div
							data-tauri-drag-region
							className="h-full bg-[linear-gradient(90deg,#4caf50_25%,#81c784_50%,#4caf50_75%)] bg-[length:400%_100%] transition-[width] duration-[400ms] ease-in-out"
							style={{
								width: `${progressPercentage}%`,
							}}
						/>
						<div
							data-tauri-drag-region
							className="absolute top-[3px] left-0 z-[5] flex w-full items-center gap-[10px] px-[10px] font-mono text-[18px] text-white"
						>
							<span data-tauri-drag-region className="shrink-0">
								{progressText}
							</span>
							<div className="relative min-w-0 flex-grow overflow-hidden whitespace-nowrap">
								<span
									data-tauri-drag-region
									className="inline-block whitespace-nowrap"
									key={scrollKey}
									ref={scrollingTextRef}
								>
									{videoTitle}
								</span>
							</div>
						</div>
					</div>
				) : (
					<div
						data-tauri-drag-region
						className="relative z-[4] h-[29px] w-full overflow-hidden bg-[#223]"
					/>
				)}
			</>
		);
	};

	return (
		<div data-tauri-drag-region className="h-[28px] shrink-0">
			<DownloadProgress />
		</div>
	);
}

export default WindowControls;
