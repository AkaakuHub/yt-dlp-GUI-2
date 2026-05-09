import {
	isPermissionGranted,
	requestPermission,
	sendNotification,
} from "@tauri-apps/api/notification";
import { useCallback, useEffect, useState } from "react";
import { useAppContext } from "../AppContext";
import { eventEmitter } from "../EventEmitter";

function WindowControls() {
	useEffect(() => {
		const checkNotificationPermission = async () => {
			let permissionGranted = await isPermissionGranted();
			if (!permissionGranted) {
				const permission = await requestPermission();
				permissionGranted = permission === "granted";
			}
		};
		checkNotificationPermission();
	}, []);

	const sendNotificationHandler = useCallback(
		async (title: string, body: string) => {
			try {
				let permissionGranted = await isPermissionGranted();
				if (!permissionGranted) {
					const permission = await requestPermission();
					permissionGranted = permission === "granted";
				}
				if (permissionGranted) {
					sendNotification({
						title,
						body,
						icon: "icons/32x32.png",
					});
					return;
				}
			} catch {
				// Tauri通知が失敗した場合
			}
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
				if (videoTitle !== "" && isSendNotification) {
					sendNotificationHandler(
						"ダウンロード完了",
						`${videoTitle} のダウンロードが完了しました。`,
					);
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

		return (
			<>
				{isDownloading ? (
					<div
						data-tauri-drag-region
						className="relative h-7 overflow-hidden bg-base-300"
					>
						<div
							data-tauri-drag-region
							className="h-full bg-success transition-[width] duration-300"
							style={{ width: `${progressPercentage}%` }}
						/>
						<div
							data-tauri-drag-region
							className="absolute inset-0 flex items-center gap-3 px-3 font-mono text-sm text-success-content"
						>
							<span data-tauri-drag-region className="shrink-0">
								{progressText}
							</span>
							<div
								data-tauri-drag-region
								className="min-w-0 truncate"
								key={scrollKey}
							>
								{videoTitle}
							</div>
						</div>
					</div>
				) : (
					<div data-tauri-drag-region className="h-7 bg-base-300"></div>
				)}
			</>
		);
	};

	return (
		<div data-tauri-drag-region className="h-7 shrink-0">
			<DownloadProgress />
		</div>
	);
}

export default WindowControls;
