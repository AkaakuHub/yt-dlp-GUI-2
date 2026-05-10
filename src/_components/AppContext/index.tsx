import { invoke } from "@tauri-apps/api/core";
import type React from "react";
import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useState,
} from "react";
import type { ConfigProps } from "../../types";
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
	executionTarget: "local" | "remote";
	setExecutionTarget: React.Dispatch<React.SetStateAction<"local" | "remote">>;
	remoteServerUrl: string;
	setRemoteServerUrl: React.Dispatch<React.SetStateAction<string>>;
	remoteAuthToken: string;
	setRemoteAuthToken: React.Dispatch<React.SetStateAction<string>>;
	serverAuthToken: string;
	setServerAuthToken: React.Dispatch<React.SetStateAction<string>>;
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
	const [selectedIndexNumber, setSelectedIndexNumber] = useState<number>(1);
	const [useBundleTools, setUseBundleTools] = useState(true);
	const [ytDlpPath, setYtDlpPath] = useState("");
	const [ffmpegPath, setFfmpegPath] = useState("");
	const [denoPath, setDenoPath] = useState("");
	const [executionTarget, setExecutionTarget] = useState<"local" | "remote">(
		"local",
	);
	const [remoteServerUrl, setRemoteServerUrl] = useState("");
	const [remoteAuthToken, setRemoteAuthToken] = useState("");
	const [serverAuthToken, setServerAuthToken] = useState("");

	useEffect(() => {
		invoke<ConfigProps>("get_settings")
			.then((config) => {
				setSaveDir(config.save_dir);
				setBrowser(config.browser);
				setServerPort(config.server_port);
				setIsSendNotification(config.is_send_notification);
				setSelectedIndexNumber(config.index);
				setUseBundleTools(config.use_bundle_tools);
				setYtDlpPath(config.yt_dlp_path);
				setFfmpegPath(config.ffmpeg_path);
				setDenoPath(config.deno_path);
				setExecutionTarget(config.execution_target);
				setRemoteServerUrl(config.remote_server_url);
				setRemoteAuthToken(config.remote_auth_token);
				setServerAuthToken(config.server_auth_token);
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
					executionTarget,
					setExecutionTarget,
					remoteServerUrl,
					setRemoteServerUrl,
					remoteAuthToken,
					setRemoteAuthToken,
					serverAuthToken,
					setServerAuthToken,
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
