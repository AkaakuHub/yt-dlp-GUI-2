/* eslint-disable @typescript-eslint/no-unused-vars */
import { useState, useEffect, useRef } from "react";
import { useAppContext } from "../AppContext";
import { eventEmitter } from "../EventEmitter";

import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/api/notification";

import "./index.css";

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

  const sendNotificationHandler = async (title: string, body: string) => {
    try {
      let permissionGranted = await isPermissionGranted();
      if (!permissionGranted) {
        const permission = await requestPermission();
        permissionGranted = permission === "granted";
      }
      sendNotification({ title, body });
    } catch (error) {
      console.error(error);
    }
  }


  const DownloadProgress = () => {
    const { latestConsoleText } = useAppContext();
    const { isSendNotification } = useAppContext();

    const [isDownloading, setIsDownloading] = useState(false);
    const [progressPercentage, setProgressPercentage] = useState(0);
    const [videoTitle, setVideoTitle] = useState("");
    const [scrollKey, setScrollKey] = useState(0);

    const [progressText, setProgressText] = useState("");

    const removeEmptyFromArray = (array: string[]) => {
      return array.filter((item) => item !== "");
    }

    useEffect(() => {
      let formattedPercentageString = "";
      // console.log("last", latestConsoleText);

      if (latestConsoleText.startsWith("[download]")) {
        setIsDownloading(true);
        const splittedArray = removeEmptyFromArray(latestConsoleText.split(" "));
        try {
          // const percentage = latestConsoleText.split("  ")[1].trim().split(" ")[0].replace("%", "");
          const percentage = splittedArray[1].replace("%", "");
          const parsedPercentage = parseFloat(percentage);
          const percentageString = parsedPercentage.toFixed(1);

          if (percentageString.length === 3) {
            formattedPercentageString = " " + percentageString;
          } else if (percentageString === "100.0") {
            formattedPercentageString = " 100";
          } else {
            formattedPercentageString = percentageString;
          }
          setProgressPercentage(parsedPercentage);
          setProgressText(`残り ??:?? (${formattedPercentageString}%)`);
        } catch (error) { /** */ }

        if (latestConsoleText.includes("ETA")) {
          try {
            const remainingTime = latestConsoleText.split("ETA ")[1].split(" ")[0];
            if (remainingTime) {
              if (remainingTime !== "Unknown") {
                setProgressText(`残り ${remainingTime} (${formattedPercentageString}%)`);
              } else {
                setProgressText(`残り ??:?? (${formattedPercentageString}%)`);
              }
            }
          } catch (error) {
            try {
              const remainingTime2 = latestConsoleText.split("ETA ")[1];
              if (remainingTime2) {
                setProgressText(`残り ${remainingTime2} (${formattedPercentageString}%)`);
              }
            } catch (error) { /** */ }
          }
        } else if (!latestConsoleText.includes("Destination:")) {
          const finalTime = splittedArray[5];
          setProgressText(`DL完了。所要時間 ${finalTime}`);
        }
        try {
          const videoTitleExtracted = latestConsoleText.split("Destination: ")[1]?.split("\\").pop();
          if (videoTitleExtracted && videoTitle !== videoTitleExtracted) {
            setProgressText(`ダウンロード中...`);
            setVideoTitle(videoTitleExtracted);
            setScrollKey((prevKey) => prevKey + 1);
          }
        } catch (error) { /** */ }
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
          sendNotificationHandler("ダウンロード完了", `${videoTitle} のダウンロードが完了しました。`);
          eventEmitter.emit("refreshFiles");
        }
        setVideoTitle("");
      }
    }, [latestConsoleText]);

    const [shouldScroll, setShouldScroll] = useState(false);
    const [scrollDuration, setScrollDuration] = useState(0);
    const scrollingTextRef = useRef(null);

    useEffect(() => {
      if (scrollingTextRef.current) {
        const textElement: HTMLElement = scrollingTextRef.current;

        const wrapper = textElement?.parentElement;
        const textWidth = textElement?.offsetWidth;
        const wrapperWidth = wrapper?.offsetWidth;

        if (wrapperWidth && textWidth > wrapperWidth) {
          setShouldScroll(true);
          setScrollDuration(textWidth / 50)
        } else {
          setShouldScroll(false);
        }
      }
    }, [videoTitle]);

    return (
      <>
        {isDownloading ? (
          <div data-tauri-drag-region className="download-progress-wrapper">
            <div data-tauri-drag-region className="download-progress-bar" style={{ width: `${progressPercentage}%` }} />
            <div data-tauri-drag-region className="download-progress-info">
              <span data-tauri-drag-region className="progress-text">{progressText}</span>
              <div data-tauri-drag-region className="scrolling-text-wrapper">
                <span
                  data-tauri-drag-region
                  className="scrolling-text"
                  key={scrollKey}
                  ref={scrollingTextRef}
                  style={{
                    animation: shouldScroll ? `scroll-left ${scrollDuration}s linear infinite` : "none",
                  }}
                >
                  {videoTitle}
                </span>
              </div>
            </div>
          </div>
        ) :
          <div data-tauri-drag-region className="download-progress-wrapper">
          </div>}
      </>
    );
  };

  return (
    <div data-tauri-drag-region className="window-controls-root">
      <DownloadProgress />
      <div data-tauri-drag-region className="window-right-controls">
      </div>
    </div>
  );
}

export default WindowControls;
