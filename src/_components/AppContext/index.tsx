import React, { useEffect, createContext, useContext, useState, ReactNode } from "react";
import { invoke } from "@tauri-apps/api";

import { ConfigProps } from "../../types";


interface AppContextProps {
  latestConsoleText: string;
  setLatestConsoleText: React.Dispatch<React.SetStateAction<string>>;
  isSettingLoaded: boolean;
  setIsSettingLoaded: React.Dispatch<React.SetStateAction<boolean>>;
  saveDir: string;
  setSaveDir: React.Dispatch<React.SetStateAction<string>>;
  browser: string;
  setBrowser: React.Dispatch<React.SetStateAction<string>>;
  isSendNotification: boolean;
  setIsSendNotification: React.Dispatch<React.SetStateAction<boolean>>;
  selectedIndexNumber: number;
  setSelectedIndexNumber: React.Dispatch<React.SetStateAction<number>>;
}

const AppContext = createContext<AppContextProps | undefined>(undefined);

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [latestConsoleText, setLatestConsoleText] = useState<string>("");

  const [isSettingLoaded, setIsSettingLoaded] = useState(false);

  const [saveDir, setSaveDir] = useState("");
  const [browser, setBrowser] = useState("");
  const [isSendNotification, setIsSendNotification] = useState(true);
  const [selectedIndexNumber, setSelectedIndexNumber] = useState<number>(3);

  useEffect(() => {
    invoke<ConfigProps>("get_settings").then((config) => {
      setSaveDir(config.save_dir);
      setBrowser(config.browser);
      setIsSendNotification(config.is_send_notification);
      setSelectedIndexNumber(config.index);
    });
    setIsSettingLoaded(true);
  }, []);

  return (
    <AppContext.Provider value={{
      latestConsoleText,
      setLatestConsoleText,
      isSettingLoaded,
      setIsSettingLoaded,
      saveDir,
      setSaveDir,
      browser,
      setBrowser,
      isSendNotification,
      setIsSendNotification,
      selectedIndexNumber,
      setSelectedIndexNumber
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = (): AppContextProps => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useAppContext must be used within an AppProvider");
  }
  return context;
};
