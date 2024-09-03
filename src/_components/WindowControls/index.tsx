/* eslint-disable @typescript-eslint/no-unused-vars */
import { appWindow } from "@tauri-apps/api/window";
import { Button } from "@mui/material";
import MinimizeIcon from "@mui/icons-material/Minimize";
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit';
import CloseIcon from '@mui/icons-material/Close';

import { styled } from "@mui/material/styles";

import { useState, useEffect } from "react";
import { useAppContext } from "../AppContext";

import "./index.css";

function WindowControls() {
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
    const [scrollKey, setScrollKey] = useState(0);  // アニメーションをリセットするためのキー

    const [progressText, setProgressText] = useState("");

    useEffect(() => {
      let formattedPercentageString = "";

      if (latestConsoleText.startsWith("[download]")) {
        setIsDownloading(true);
        // パーセンテージ取得
        try {
          const percentage = latestConsoleText.split("  ")[1].trim().split(" ")[0].replace("%", "");
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
        } catch (error) { /** */ }

        // 残り時間取得 (YT)
        try {
          const remainingTime = latestConsoleText.split("  ")[4].split("ETA ")[1].split(" ")[0];
          if (remainingTime) {
            // progressText = `残り ${remainingTime} (${progressText})`;
            setProgressText(`残り ${remainingTime} (${formattedPercentageString}%)`);
          }
        } catch (error) { /** */ }

        // 残り時間取得 (BI)
        try {
          const remainingTime2 = latestConsoleText.split("  ")[3].split("ETA ")[1];
          if (remainingTime2) {
            // progressText = `残り ${remainingTime2} (${progressText})`;
            setProgressText(`残り ${remainingTime2} (${formattedPercentageString}%)`);
          }
        } catch (error) { /** */ }

        // タイトル取得
        try {
          const videoTitleExtracted = latestConsoleText.split("Destination: ")[1]?.split("\\").pop();
          if (videoTitleExtracted && videoTitle !== videoTitleExtracted) {
            setVideoTitle(videoTitleExtracted);  // タイトルが変わった場合のみ更新
            setScrollKey((prevKey) => prevKey + 1);  // アニメーションをリセットするためにキーを変更
          }
        } catch (error) { /** */ }

      } else if (latestConsoleText.startsWith("[Merger]")) {
        setIsDownloading(true);
        setProgressPercentage(100);
      } else {
        setIsDownloading(false);
        setVideoTitle("");
      }
    }, [latestConsoleText]);  // latestConsoleText が変わるたびに実行

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
                  key={scrollKey} // アニメーションをリセットするためにキーを使用
                  style={{
                    animation: `scroll-left ${videoTitle.length}s linear infinite`,
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
