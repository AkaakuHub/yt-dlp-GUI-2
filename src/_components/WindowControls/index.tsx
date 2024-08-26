import { appWindow } from "@tauri-apps/api/window";
import { Button } from "@mui/material";
import MinimizeIcon from "@mui/icons-material/Minimize";
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit';
import LogoutIcon from '@mui/icons-material/Logout';

import { styled } from "@mui/material/styles";

import { useState, useEffect } from "react";

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

  return (
    <div data-tauri-drag-region className="window-controls-root">
      <div data-tauri-drag-region className="window-left-controls">
        <img src="assets/128x128.png" alt="logo" className="window-logo"
        />
      </div>
      <div data-tauri-drag-region className="window-right-controls">
        <CustomWindowButton onClick={minimizeWindow} startIcon={<MinimizeIcon />} />
        <CustomWindowButton onClick={maximizeWindow} startIcon={
          isMaximized ? <FullscreenExitIcon /> : <FullscreenIcon />
        } />
        <CustomWindowButton2 onClick={closeWindow} startIcon={<LogoutIcon />} />
      </div>
    </div>
  );
}

export default WindowControls;
