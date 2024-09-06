/* eslint-disable @typescript-eslint/no-unused-vars */
import { appWindow } from "@tauri-apps/api/window";
import { Button } from "@mui/material";
import MinimizeIcon from "@mui/icons-material/Minimize";
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit';
import CloseIcon from '@mui/icons-material/Close';

import { styled } from "@mui/material/styles";

import { useState, useEffect, useRef } from "react";
import { useAppContext } from "../AppContext";

import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/api/notification';

import "./index.css";

function WindowControls() {
  const { isSendNotification } = useAppContext();

  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    const checkMaximizedState = async () => {
      const maximized = await appWindow.isMaximized();
      setIsMaximized(maximized);
    };
    checkMaximizedState();
  }, []);

  const minimizeWindow = () => appWindow.minimize();

  const maximizeWindow = async () => {
    const isMaximized = await appWindow.isMaximized();
    if (isMaximized) {
      appWindow.unmaximize();
    } else {
      appWindow.maximize();
    }
    const updateMaximized = await appWindow.isMaximized();
    setIsMaximized(updateMaximized);
  };

  const closeWindow = () => appWindow.hide();

  const CustomWindowButton = styled(Button)(() => ({
    color: "#9d9d9d",

    "&:hover": {
      color: "#fff",
      backgroundColor: "#3d3d3d",
    },
  }));

  useEffect(() => {
    const checkNotificationPermission = async () => {
      let permissionGranted = await isPermissionGranted();
      if (!permissionGranted) {
        const permission = await requestPermission();
        permissionGranted = permission === 'granted';
      }
    };
    checkNotificationPermission();
  }, []);

  const sendNotificationHandler = async (title: string, body: string) => {
    if (!isSendNotification) { return; }
    try {
      let permissionGranted = await isPermissionGranted();
      if (!permissionGranted) {
        const permission = await requestPermission();
        permissionGranted = permission === 'granted';
      }
      sendNotification({ title, body });
    } catch (error) {
      console.error(error);
    }
  }

  const CustomWindowButton2 = styled(Button)(() => ({
    color: "#9d9d9d",

    "&:hover": {
      color: "#fff",
      backgroundColor: "#e81123",
    },
  }));

  const DownloadProgress = () => {
    const { latestConsoleText } = useAppContext();

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
              setProgressText(`残り ${remainingTime} (${formattedPercentageString}%)`);
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
      } else if (latestConsoleText.startsWith("[FixupM3u8]")) {
        setIsDownloading(true);
        setProgressText("m3u8処理中...");
        setProgressPercentage(100);
      } else if (latestConsoleText === "\n") {
        setIsDownloading(false);
        if (videoTitle !== "") {
          sendNotificationHandler("ダウンロード完了", `${videoTitle} のダウンロードが完了しました。`);
        }
        setProgressPercentage(0);
      }
    }, [latestConsoleText]);

    useEffect(() => {
      console.log(isDownloading);
    }, [isDownloading]);

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
                    animation: shouldScroll ? `scroll-left ${scrollDuration}s linear infinite` : 'none',
                  }}
                >
                  {videoTitle}
                </span>
              </div>
            </div>
          </div>
        ) : null}
      </>
    );
  };

  return (
    <div data-tauri-drag-region className="window-controls-root">
      <div data-tauri-drag-region className="window-left-controls">
        <img src="assets/128x128.png" alt="logo" className="window-logo"
        />
      </div>
      <DownloadProgress />
      <div data-tauri-drag-region className="window-right-controls">
        <CustomWindowButton onClick={minimizeWindow} startIcon={<MinimizeIcon />} />
        <CustomWindowButton onClick={maximizeWindow} startIcon={
          isMaximized ? <FullscreenExitIcon /> : <FullscreenIcon />
        } />
        <CustomWindowButton2 onClick={closeWindow} startIcon={<CloseIcon />} />
      </div>
    </div>
  );
}

export default WindowControls;
