import {
	isPermissionGranted,
	sendNotification,
} from "@tauri-apps/plugin-notification";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAppContext } from "../AppContext";
import { eventEmitter } from "../EventEmitter";

const extractDestinationTitle = (consoleText: string): string | undefined => {
	const destinationLine = consoleText
		.split(/\r?\n/)
		.find((line) => line.includes("Destination: "));
	const destination = destinationLine?.split("Destination: ")[1];
	if (!destination) {
		return undefined;
	}
	const fileName = destination.split(/[\\/]/).pop();
	return fileName?.replace(/(?:\.f\d+)?\.[^.]+$/, "");
};

const extractDownloadProgressLine = (consoleText: string): string => {
	return (
		consoleText
			.split(/\r?\n/)
			.find(
				(line) =>
					line.startsWith("[download]") && !line.includes("Destination: "),
			) ?? consoleText
	);
};

const isDownloadProgressLine = (consoleText: string): boolean => {
	return (
		consoleText.startsWith("[download]") &&
		!consoleText.includes("Destination: ")
	);
};

function DownloadProgress() {
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

	const { latestConsoleText } = useAppContext();
	const { isSendNotification } = useAppContext();

	const [isDownloading, setIsDownloading] = useState(false);
	const [progressPercentage, setProgressPercentage] = useState(0);
	const [videoTitle, setVideoTitle] = useState("");
	const videoTitleRef = useRef("");
	const [scrollKey, setScrollKey] = useState(0);
	const [progressText, setProgressText] = useState("");

	const removeEmptyFromArray = useCallback((array: string[]) => {
		return array.filter((item) => item !== "");
	}, []);

	useEffect(() => {
		let formattedPercentageString = "";

		if (latestConsoleText.startsWith("[download]")) {
			setIsDownloading(true);
			const videoTitleExtracted = extractDestinationTitle(latestConsoleText);
			if (
				videoTitleExtracted &&
				videoTitleRef.current !== videoTitleExtracted
			) {
				videoTitleRef.current = videoTitleExtracted;
				setVideoTitle(videoTitleExtracted);
				setScrollKey((prevKey) => prevKey + 1);
			}

			const downloadProgressLine =
				extractDownloadProgressLine(latestConsoleText);
			if (!isDownloadProgressLine(downloadProgressLine)) {
				if (videoTitleExtracted) {
					setProgressText("ダウンロード中...");
				}
				return;
			}

			const splittedArray = removeEmptyFromArray(
				downloadProgressLine.split(" "),
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

			if (downloadProgressLine.includes("ETA")) {
				try {
					const remainingTime = downloadProgressLine
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
						const remainingTime2 = downloadProgressLine.split("ETA ")[1];
						if (remainingTime2) {
							setProgressText(
								`残り ${remainingTime2} (${formattedPercentageString}%)`,
							);
						}
					} catch {}
				}
			} else if (!downloadProgressLine.includes("Destination:")) {
				const finalTime = splittedArray[5];
				setProgressText(`DL完了。所要時間 ${finalTime}`);
			}
		} else if (latestConsoleText.startsWith("[Merger]")) {
			setIsDownloading(true);
			setProgressText("マージ中...");
			setProgressPercentage(100);
		} else if (latestConsoleText.startsWith("[Fixup")) {
			setIsDownloading(true);
			setProgressText("コンテナ処理中...");
			setProgressPercentage(100);
		} else if (latestConsoleText === "") {
			setIsDownloading(false);
			setProgressPercentage(0);
			if (videoTitleRef.current !== "") {
				if (isSendNotification) {
					void sendNotificationHandler(
						"ダウンロード完了",
						`${videoTitleRef.current} のダウンロードが完了しました。`,
					);
				}
				eventEmitter.emit("refreshFiles");
			}
			videoTitleRef.current = "";
			setVideoTitle("");
		}
	}, [
		isSendNotification,
		latestConsoleText,
		removeEmptyFromArray,
		sendNotificationHandler,
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
					className="relative z-[4] h-[29px] w-full overflow-hidden border-b border-base-300 bg-base-200"
				>
					<div
						data-tauri-drag-region
						className="h-full bg-primary/35 transition-[width] duration-[400ms] ease-in-out"
						style={{
							width: `${progressPercentage}%`,
						}}
					/>
					<div
						data-tauri-drag-region
						className="absolute inset-0 z-[5] flex w-full items-center gap-[10px] px-[10px] font-mono text-[18px] font-semibold leading-none text-base-content"
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
					className="relative z-[4] h-[29px] w-full overflow-hidden border-b border-base-300 bg-base-200"
				/>
			)}
		</>
	);
}

function WindowControls() {
	return (
		<div data-tauri-drag-region className="h-[28px] shrink-0">
			<DownloadProgress />
		</div>
	);
}

export default WindowControls;
