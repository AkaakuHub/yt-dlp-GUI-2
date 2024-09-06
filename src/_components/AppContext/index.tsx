import React, { createContext, useContext, useState, ReactNode } from "react";

interface AppContextProps {
  latestConsoleText: string;
  setLatestConsoleText: React.Dispatch<React.SetStateAction<string>>;
}

const AppContext = createContext<AppContextProps | undefined>(undefined);

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [latestConsoleText, setLatestConsoleText] = useState<string>("");

  return (
    <AppContext.Provider value={{
      latestConsoleText,
      setLatestConsoleText,
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
