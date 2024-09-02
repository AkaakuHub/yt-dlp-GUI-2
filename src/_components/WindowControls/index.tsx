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
    let isDownloading = false;
    let progressPercentage: number = 0;
    let progressText: string = "";

    if (latestConsoleText.startsWith("[download]")) {
      try {
        console.log("1", latestConsoleText.split("  "));
        console.log("2", latestConsoleText.split(" "));

        const percentage = latestConsoleText.split("  ")[1].trim().split(" ")[0].replace("%", "");
        progressPercentage = parseFloat(percentage);

        const remainingTime = latestConsoleText.match(/ETA (.*) \(/);
        if (remainingTime) {
          progressText = `残り ${remainingTime[1]} (${progressPercentage}%)`;
        }
        isDownloading = true;
      } catch (error) {
        console.error(error);
        isDownloading = false;
      }
    } else {
      isDownloading = false;
    }

    return (
      <>
        {isDownloading ? (
          <div data-tauri-drag-region className="download-progress-wrapper">
            <div data-tauri-drag-region className="download-progress-bar" style={{ width: `${progressPercentage}%` }} />
            <div data-tauri-drag-region className="download-progress-info">
              {progressText}
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
