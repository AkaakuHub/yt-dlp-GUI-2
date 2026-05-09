import { invoke } from "@tauri-apps/api/tauri";
import type React from "react";
import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useState,
} from "react";

export type ThemeMode = "light" | "dark" | "system";

interface ThemeContextType {
	themeMode: ThemeMode;
	setThemeMode: (mode: ThemeMode) => void;
	actualTheme: "light" | "dark";
	isLoaded: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

interface ThemeProviderProps {
	children: ReactNode;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
	const [themeMode, setThemeMode] = useState<ThemeMode>("system");
	const [isLoaded, setIsLoaded] = useState(false);

	const [systemTheme, setSystemTheme] = useState<"light" | "dark">(() => {
		return window.matchMedia("(prefers-color-scheme: dark)").matches
			? "dark"
			: "light";
	});

	const actualTheme = themeMode === "system" ? systemTheme : themeMode;

	useEffect(() => {
		const loadSettings = async () => {
			try {
				const config = await invoke<{ theme_mode: string }>("get_settings");
				const savedMode = config.theme_mode as ThemeMode;
				if (["light", "dark", "system"].includes(savedMode)) {
					setThemeMode(savedMode);
				}
			} catch (error) {
				console.error("Failed to load theme settings:", error);
			} finally {
				setIsLoaded(true);
			}
		};
		loadSettings();
	}, []);

	const handleSetThemeMode = (mode: ThemeMode) => {
		setThemeMode(mode);
		void invoke("set_theme_mode", { newThemeMode: mode });
	};

	useEffect(() => {
		const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
		const handleChange = (e: MediaQueryListEvent) => {
			setSystemTheme(e.matches ? "dark" : "light");
		};

		mediaQuery.addEventListener("change", handleChange);
		return () => mediaQuery.removeEventListener("change", handleChange);
	}, []);

	useEffect(() => {
		const daisyTheme = actualTheme === "light" ? "ytlight" : "night";
		document.documentElement.setAttribute("data-theme", daisyTheme);
		document.documentElement.className = actualTheme;
	}, [actualTheme]);

	return (
		<ThemeContext.Provider
			value={{
				themeMode,
				setThemeMode: handleSetThemeMode,
				actualTheme,
				isLoaded,
			}}
		>
			{children}
		</ThemeContext.Provider>
	);
};

export const useTheme = (): ThemeContextType => {
	const context = useContext(ThemeContext);
	if (!context) {
		throw new Error("useTheme must be used within a ThemeProvider");
	}
	return context;
};
