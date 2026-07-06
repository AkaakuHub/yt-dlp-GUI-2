import type React from "react";
import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useState,
} from "react";
import { getSettings } from "../../../shared/backend/runtime";
import { ThemeProvider } from "../ThemeContext";

interface AppContextProps {
	latestConsoleText: string;
	setLatestConsoleText: React.Dispatch<React.SetStateAction<string>>;
	isSettingLoaded: boolean;
	setIsSettingLoaded: React.Dispatch<React.SetStateAction<boolean>>;
	saveDir: string;
	setSaveDir: React.Dispatch<React.SetStateAction<string>>;
	browser: string;
	setBrowser: React.Dispatch<React.SetStateAction<string>>;
	serverPort: number;
	setServerPort: React.Dispatch<React.SetStateAction<number>>;
	isSendNotification: boolean;
	setIsSendNotification: React.Dispatch<React.SetStateAction<boolean>>;
	useCookie: boolean;
	setUseCookie: React.Dispatch<React.SetStateAction<boolean>>;
	selectedIndexNumber: number;
	setSelectedIndexNumber: React.Dispatch<React.SetStateAction<number>>;
	useBundleTools: boolean;
	setUseBundleTools: React.Dispatch<React.SetStateAction<boolean>>;
	ytDlpPath: string;
	setYtDlpPath: React.Dispatch<React.SetStateAction<string>>;
	ffmpegPath: string;
	setFfmpegPath: React.Dispatch<React.SetStateAction<string>>;
	denoPath: string;
	setDenoPath: React.Dispatch<React.SetStateAction<string>>;
	serverAuthToken: string;
	setServerAuthToken: React.Dispatch<React.SetStateAction<string>>;
	keepRunningInTray: boolean;
	setKeepRunningInTray: React.Dispatch<React.SetStateAction<boolean>>;
}

const AppContext = createContext<AppContextProps | undefined>(undefined);

export const AppProvider: React.FC<{ children: ReactNode }> = ({
	children,
}) => {
	const [latestConsoleText, setLatestConsoleText] = useState<string>("");

	const [isSettingLoaded, setIsSettingLoaded] = useState(false);

	const [saveDir, setSaveDir] = useState("");
	const [browser, setBrowser] = useState("");
	const [serverPort, setServerPort] = useState<number>(0);
	const [isSendNotification, setIsSendNotification] = useState(true);
	const [useCookie, setUseCookie] = useState(true);
	const [selectedIndexNumber, setSelectedIndexNumber] = useState<number>(1);
	const [useBundleTools, setUseBundleTools] = useState(true);
	const [ytDlpPath, setYtDlpPath] = useState("");
	const [ffmpegPath, setFfmpegPath] = useState("");
	const [denoPath, setDenoPath] = useState("");
	const [serverAuthToken, setServerAuthToken] = useState("");
	const [keepRunningInTray, setKeepRunningInTray] = useState(false);

	useEffect(() => {
		getSettings()
			.then((config) => {
				setSaveDir(config.save_dir);
				setBrowser(config.browser);
				setServerPort(config.server_port);
				setIsSendNotification(config.is_send_notification);
				setUseCookie(config.use_cookie);
				setSelectedIndexNumber(config.index);
				setUseBundleTools(config.use_bundle_tools);
				setYtDlpPath(config.yt_dlp_path);
				setFfmpegPath(config.ffmpeg_path);
				setDenoPath(config.deno_path);
				setServerAuthToken(config.server_auth_token);
				setKeepRunningInTray(config.keep_running_in_tray);
			})
			.finally(() => {
				setIsSettingLoaded(true);
			});
	}, []);

	return (
		<ThemeProvider>
			<AppContext.Provider
				value={{
					latestConsoleText,
					setLatestConsoleText,
					isSettingLoaded,
					setIsSettingLoaded,
					saveDir,
					setSaveDir,
					browser,
					setBrowser,
					serverPort,
					setServerPort,
					isSendNotification,
					setIsSendNotification,
					useCookie,
					setUseCookie,
					selectedIndexNumber,
					setSelectedIndexNumber,
					useBundleTools,
					setUseBundleTools,
					ytDlpPath,
					setYtDlpPath,
					ffmpegPath,
					setFfmpegPath,
					denoPath,
					setDenoPath,
					serverAuthToken,
					setServerAuthToken,
					keepRunningInTray,
					setKeepRunningInTray,
				}}
			>
				{children}
			</AppContext.Provider>
		</ThemeProvider>
	);
};

export const useAppContext = (): AppContextProps => {
	const context = useContext(AppContext);
	if (!context) {
		throw new Error("useAppContext must be used within an AppProvider");
	}
	return context;
};
