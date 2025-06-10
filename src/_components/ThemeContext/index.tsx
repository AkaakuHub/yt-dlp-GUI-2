import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { debounce } from 'lodash';

export type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeContextType {
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  actualTheme: 'light' | 'dark';
  isLoaded: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

interface ThemeProviderProps {
  children: ReactNode;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  const [themeMode, setThemeMode] = useState<ThemeMode>('system');
  const [isLoaded, setIsLoaded] = useState(false);
  
  const [systemTheme, setSystemTheme] = useState<'light' | 'dark'>(() => {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  const actualTheme = themeMode === 'system' ? systemTheme : themeMode;

  // デバウンスでRustバックエンドに保存
  const saveThemeModeChanged = debounce(async (mode: ThemeMode) => {
    await invoke("set_theme_mode", { newThemeMode: mode });
  }, 500);

  // 初期設定をバックエンドから読み込み
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const config = await invoke<{ theme_mode: string }>("get_settings");
        const savedMode = config.theme_mode as ThemeMode;
        if (['light', 'dark', 'system'].includes(savedMode)) {
          setThemeMode(savedMode);
        }
      } catch (error) {
        console.error('Failed to load theme settings:', error);
      } finally {
        setIsLoaded(true);
      }
    };
    loadSettings();
  }, []);

  // テーマモード変更時にバックエンドに保存
  const handleSetThemeMode = (mode: ThemeMode) => {
    setThemeMode(mode);
    saveThemeModeChanged(mode);
  };

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      setSystemTheme(e.matches ? 'dark' : 'light');
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', actualTheme);
    document.documentElement.className = actualTheme;
  }, [actualTheme]);

  return (
    <ThemeContext.Provider value={{ themeMode, setThemeMode: handleSetThemeMode, actualTheme, isLoaded }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
