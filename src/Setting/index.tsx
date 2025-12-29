import { Build, CheckCircle, Download, Storage } from "@mui/icons-material";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import SettingsIcon from "@mui/icons-material/Settings";
import {
	Alert,
	Box,
	Button,
	CircularProgress,
	Container,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
	FormControlLabel,
	IconButton,
	LinearProgress,
	Link,
	FormControlLabel as MuiFormControlLabel,
	Radio,
	RadioGroup,
	Switch,
	TextField,
	Typography,
} from "@mui/material";
import { styled } from "@mui/material/styles";
import { open } from "@tauri-apps/api/dialog";
import { listen } from "@tauri-apps/api/event";
import { relaunch } from "@tauri-apps/api/process";
import { invoke } from "@tauri-apps/api/tauri";
import { checkUpdate, installUpdate } from "@tauri-apps/api/updater";
import { debounce } from "lodash";
import { useCallback, useEffect, useState } from "react";
import { useAppContext } from "../_components/AppContext";
import ThemeSelector from "../_components/ThemeSelector";
import type { ConfigProps } from "../types";

import "./index.css";

import { dialog } from "@tauri-apps/api";
import {
	isPermissionGranted,
	requestPermission,
} from "@tauri-apps/api/notification";
import { toast } from "react-toastify";
import CustomButton from "../_components/CustomButton";
import { checkToolAvailability } from "../_utils/toolAvailability";

// StyledComponents for dark mode support
const StyledTextField = styled(TextField)(() => ({
	"& .MuiInputBase-root": {
		borderRadius: "12px",
	},
	"& .MuiOutlinedInput-root": {
		backgroundColor: "var(--input-background)",
		color: "var(--text-primary)",
		transition: "all 0.2s ease-in-out",
		"&:hover": {
			backgroundColor: "var(--input-background-hover)",
			"& .MuiOutlinedInput-notchedOutline": {
				borderColor: "var(--accent-primary)",
			},
		},
		"&.Mui-focused": {
			backgroundColor: "var(--input-background-focus)",
			"& .MuiOutlinedInput-notchedOutline": {
				borderColor: "var(--accent-primary)",
				borderWidth: "2px",
			},
		},
		"& .MuiOutlinedInput-notchedOutline": {
			borderColor: "var(--border-primary)",
			transition: "all 0.2s ease-in-out",
		},
	},
	"& .MuiInputLabel-root": {
		color: "var(--text-secondary)",
		"&.Mui-focused": {
			color: "var(--accent-primary)",
		},
	},
	"& .MuiInputBase-input": {
		color: "var(--text-primary)",
	},
	"& .MuiInputBase-input::placeholder": {
		color: "var(--text-placeholder)",
		opacity: 1,
	},
	"& .MuiFormHelperText-root": {
		color: "var(--text-tertiary)",
	},
}));

const StyledFormControlLabel = styled(FormControlLabel)(() => ({
	margin: 0,
	padding: "12px 16px",
	borderRadius: "12px",
	border: "1px solid var(--border-primary)",
	backgroundColor: "var(--surface-primary)",
	transition: "all 0.2s ease-in-out",
	"&:hover": {
		backgroundColor: "var(--surface-hover)",
		borderColor: "var(--accent-primary)",
		transform: "translateY(-1px)",
		boxShadow: "var(--shadow-md)",
	},
	"& .MuiFormControlLabel-label": {
		color: "var(--text-primary)",
		fontWeight: 500,
		fontSize: "0.875rem",
	},
}));

const StyledIconButton = styled(IconButton)(() => ({
	backgroundColor: "var(--surface-primary)",
	color: "var(--accent-primary)",
	border: "1px solid var(--border-primary)",
	transition: "all 0.2s ease-in-out",
	"&:hover": {
		backgroundColor: "var(--surface-hover)",
		borderColor: "var(--accent-primary)",
		transform: "translateY(-1px)",
		boxShadow: "var(--shadow-md)",
	},
}));

export default function Settings() {
	const { saveDir, setSaveDir } = useAppContext();
	const { browser, setBrowser } = useAppContext();
	const { serverPort, setServerPort } = useAppContext();
	const { isSendNotification, setIsSendNotification } = useAppContext();
	const { isServerEnabled, setIsServerEnabled } = useAppContext();
	const { useBundleTools, setUseBundleTools } = useAppContext();
	const { ytDlpPath, setYtDlpPath } = useAppContext();
	const { ffmpegPath, setFfmpegPath } = useAppContext();
	const { denoPath, setDenoPath } = useAppContext();
	const { isSettingLoaded } = useAppContext();

	const [currentVersion, setCurrentVersion] = useState("");
	const [isUpdateAvailable, setIsUpdateAvailable] = useState(false);
	const [notificationPermission, setNotificationPermission] = useState<
		boolean | null
	>(null);
	const [osType, setOsType] = useState<string>("");

	// ツール設定モーダル用
	const [showToolsModal, setShowToolsModal] = useState(false);
	const [tempUseBundle, setTempUseBundle] = useState(useBundleTools);
	const [tempYtDlpPath, setTempYtDlpPath] = useState(ytDlpPath);
	const [tempFfmpegPath, setTempFfmpegPath] = useState(ffmpegPath);
	const [tempDenoPath, setTempDenoPath] = useState(denoPath);
	const [isCheckingTools, setIsCheckingTools] = useState(false);
	const [toolCheckResults, setToolCheckResults] = useState<{
		ytDlp: boolean;
		ffmpeg: boolean;
		deno: boolean;
	}>({ ytDlp: false, ffmpeg: false, deno: false });

	// ダウンロード機能用
	const [isDownloadingTools, setIsDownloadingTools] = useState(false);
	const [downloadProgress, setDownloadProgress] = useState<{
		tool_name: string;
		progress: number;
		status: string;
	} | null>(null);
	const [downloadedOnce, setDownloadedOnce] = useState(false);

	// ツ�備スイッチ
	const StyledSwitch = styled(Switch)(() => ({
		"& .MuiSwitch-switchBase": {
			color: "var(--border-primary)",
			"&.Mui-checked": {
				color: "var(--accent-primary)",
				"& + .MuiSwitch-track": {
					backgroundColor: "var(--accent-primary)",
					opacity: 0.7,
				},
			},
		},
		"& .MuiSwitch-track": {
			backgroundColor: "var(--border-primary)",
			opacity: 0.5,
		},
	}));

	// ツード用ラジオグル
	const StyledRadioGroup = styled(RadioGroup)(() => ({
		"& .MuiFormControlLabel-root": {
			color: "var(--text-primary)",
		},
		"& .MuiRadio-root": {
			color: "var(--text-primary)",
			"&.Mui-checked": {
				color: "var(--accent-primary)",
			},
		},
	}));

	const executeUpdate = useCallback(async () => {
		// Install the update. This will also restart the app on Windows!
		await installUpdate();
		// On macOS and Linux you will need to restart the app manually.
		// You could use this step to display another confirmation dialog.
		await dialog.message(
			"アップデートが完了しました。アプリケーションを終了します。",
		);
		await invoke("exit_app");
		await relaunch();
	}, []);

	useEffect(() => {
		// ダウンロード進捗リスナーを設定
		let unlistenPromise: Promise<() => void> | null = null;

		const setupListener = async () => {
			unlistenPromise = listen<{
				tool_name: string;
				progress: number;
				status: string;
			}>("download-progress", (event) => {
				setDownloadProgress(event.payload);
			});
		};

		const getCurrentVersion = async () => {
			const version = await invoke<string>("get_current_version");
			setCurrentVersion(version);
		};

		const checkForUpdates = async () => {
			// await emit("tauri://update");
			// const unlisten = await onUpdaterEvent(({ error, status }) => {
			//   console.log('Updater event', error, status)
			// })
			try {
				const { shouldUpdate, manifest } = await checkUpdate();
				if (shouldUpdate) {
					setIsUpdateAvailable(true);
					const yes = await dialog.ask(
						`最新バージョン(${manifest?.version})があります！アップデートしますか？`,
						{
							okLabel: "はい",
							cancelLabel: "いいえ",
						},
					);
					// \n\nリリースノート: ${manifest?.body}
					if (yes) {
						executeUpdate();
					} else {
						toast.info(
							"アップデートはキャンセルされました。設定タブから行うこともできます。",
						);
					}
				}
			} catch (error) {
				alert(error);
			}
			// unlisten();
		};
		checkForUpdates();
		setupListener();
		getCurrentVersion();

		return () => {
			if (unlistenPromise) {
				unlistenPromise.then((fn) => fn());
			}
		};
	}, [executeUpdate]);

	useEffect(() => {
		const getOsType = async () => {
			const os = await invoke<string>("get_os_type");
			setOsType(os);
		};
		getOsType();
	}, []);

	useEffect(() => {
		const checkNotificationPermission = async () => {
			try {
				const granted = await isPermissionGranted();
				setNotificationPermission(granted);
			} catch {
				setNotificationPermission(false);
			}
		};
		checkNotificationPermission();
	}, []);

	const requestNotificationPermission = async () => {
		try {
			const permission = await requestPermission();
			const granted = permission === "granted";
			setNotificationPermission(granted);
			if (granted) {
				toast.success("通知権限が許可されました");
			} else {
				toast.error(
					"通知権限が拒否されました。システム設定で手動で許可してください。",
				);
			}
		} catch {
			toast.error("通知権限の要求に失敗しました");
		}
	};

	// デバウンスで遅延
	const saveDirChanged = debounce(async (temp_saveDir: string) => {
		await invoke("set_save_dir", { newSaveDir: temp_saveDir }); // ここのkeyをrust側と合わせる
	}, 500);

	const saveBrowserChanged = debounce(async (temp_browser: string) => {
		await invoke("set_browser", { newBrowser: temp_browser });
	}, 500);

	const saveServerPortChanged = debounce(async (temp_serverPort: number) => {
		await invoke("set_server_port", { newServerPort: temp_serverPort });
	}, 500);

	const saveNotificationChanged = debounce(
		async (temp_notification: boolean) => {
			await invoke("set_is_send_notification", {
				newIsSendNotification: temp_notification,
			});
		},
		500,
	);

	const saveServerEnabledChanged = debounce(
		async (temp_serverEnabled: boolean) => {
			await invoke("set_is_server_enabled", {
				newIsServerEnabled: temp_serverEnabled,
			});
		},
		500,
	);

	// ツール設定用デバンス関数
	const saveBundleToolsChanged = debounce(async (temp_useBundle: boolean) => {
		await invoke("set_use_bundle_tools", { useBundleTools: temp_useBundle });
	}, 500);

	const saveYtDlpPathChanged = debounce(async (temp_ytDlpPath: string) => {
		await invoke("set_yt_dlp_path", { ytDlpPath: temp_ytDlpPath });
	}, 500);

	const saveFfmpegPathChanged = debounce(async (temp_ffmpegPath: string) => {
		await invoke("set_ffmpeg_path", { ffmpegPath: temp_ffmpegPath });
	}, 500);

	const saveDenoPathChanged = debounce(async (temp_denoPath: string) => {
		await invoke("set_deno_path", { denoPath: temp_denoPath });
	}, 500);

	// ダウンロード関数
	const downloadBundleTools = async () => {
		setIsDownloadingTools(true);
		setDownloadProgress(null);

		try {
			await invoke<string>("download_bundle_tools");
			setDownloadedOnce(true);
			toast.success("ツールのダウンロードが完了しました");
			// ダウンロード後にツールチェックを実行
			await checkTools();
		} catch (error) {
			console.error("Download failed:", error);
			toast.error("ツールのダウンロードに失敗しました");
		} finally {
			setIsDownloadingTools(false);
			setDownloadProgress(null);
		}
	};

	// ツールチェック関数
	const checkTools = async () => {
		setIsCheckingTools(true);
		try {
			const status = await checkToolAvailability(
				tempUseBundle,
				tempYtDlpPath,
				tempFfmpegPath,
				tempDenoPath,
			);
			if (!status.ok) {
				toast.error(
					status.ytDlpError ||
						status.ffmpegError ||
						status.denoError ||
						"ツールが見つかりません。先にダウンロードまたはパス設定を行ってください。",
				);
				setToolCheckResults({ ytDlp: false, ffmpeg: false, deno: false });
				return;
			}

			setToolCheckResults({
				ytDlp: status.ytDlpFound,
				ffmpeg: status.ffmpegFound,
				deno: status.denoFound,
			});

			if (status.ok) {
				toast.success("すべてのツールが利用可能です");
			} else {
				const failedTools = [];
				if (!status.ytDlpFound) failedTools.push("yt-dlp");
				if (!status.ffmpegFound) failedTools.push("FFmpeg");
				if (!status.denoFound) failedTools.push("Deno");
				toast.error(`以下のツールが利用できません: ${failedTools.join(", ")}`);
			}
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : String(error);

			if (errorMsg.includes("yt-dlp")) {
				toast.error(`yt-dlpのチェックに失敗しました: ${errorMsg}`);
			} else if (errorMsg.includes("ffmpeg")) {
				toast.error(`FFmpegのチェックに失敗しました: ${errorMsg}`);
			} else if (errorMsg.includes("deno")) {
				toast.error(`Denoのチェックに失敗しました: ${errorMsg}`);
			} else {
				toast.error(`ツールのチェックに失敗しました: ${errorMsg}`);
			}

			setToolCheckResults({ ytDlp: false, ffmpeg: false, deno: false });
		} finally {
			setIsCheckingTools(false);
		}
	};

	// ツール設定モーダルを開く
	const openToolsModal = () => {
		setTempUseBundle(useBundleTools);
		setTempYtDlpPath(ytDlpPath);
		setTempFfmpegPath(ffmpegPath);
		setTempDenoPath(denoPath);
		setToolCheckResults({ ytDlp: false, ffmpeg: false, deno: false });
		setShowToolsModal(true);
	};

	// ツール設定を保存
	const saveToolsSettings = async () => {
		try {
			await saveBundleToolsChanged(tempUseBundle);

			if (!tempUseBundle) {
				await saveYtDlpPathChanged(tempYtDlpPath);
				await saveFfmpegPathChanged(tempFfmpegPath);
				await saveDenoPathChanged(tempDenoPath);
			}

			// 設定を再読み込み
			const settings = await invoke<ConfigProps>("get_settings");
			setUseBundleTools(settings.use_bundle_tools);
			setYtDlpPath(settings.yt_dlp_path);
			setFfmpegPath(settings.ffmpeg_path);
			setDenoPath(settings.deno_path);

			// ツールチェックを実行
			await checkTools();

			setShowToolsModal(false);
			toast.success("ツール設定を保存しました");
		} catch {
			toast.error("ツール設定の保存に失敗しました");
		}
	};

	const openDirectoryDialog = async () => {
		const selectedDir = await open({
			directory: true,
			multiple: false,
		});
		if (selectedDir) {
			setSaveDir(selectedDir as string);
			saveDirChanged(selectedDir as string);
		}
	};

	// サーバーの自動起動を無効化 - ユーザーが手動で有効にするまで起動しない
	useEffect(() => {
		// 設定がロードされていない、またはポートが無効な場合は起動しない
		if (!isSettingLoaded || serverPort === 0 || Number.isNaN(serverPort)) {
			return;
		}
		invoke("toggle_server", { enable: isServerEnabled, port: serverPort });
	}, [isServerEnabled, serverPort, isSettingLoaded]);

	useEffect(() => {
		const unlistenStartServerOutput = listen<string>(
			"start-server-output",
			(event) => {
				const data = event.payload;
				// console.log(data);
				if (data === "失敗") {
					toast.error(
						"サーバーの起動に失敗しました。ポート番号が他のプログラムで使用されています。",
					);

					saveServerEnabledChanged(false);
					setIsServerEnabled(false);
				} else {
					saveServerEnabledChanged(true);
				}
			},
		);

		return () => {
			unlistenStartServerOutput.then((fn) => fn());
		};
	}, [saveServerEnabledChanged, setIsServerEnabled]);

	return (
		<Box sx={{ flexGrow: 1 }} className="settings-container">
			<Container
				maxWidth="sm"
				sx={{ mt: 3, display: "flex", flexDirection: "column", gap: 2 }}
			>
				<ThemeSelector />
				<Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
					<StyledTextField
						fullWidth
						label="保存先"
						variant="outlined"
						value={saveDir}
						onChange={(e) => {
							setSaveDir(e.target.value);
							saveDirChanged(e.target.value);
						}}
					/>
					<StyledIconButton
						aria-label="フォルダを開く"
						onClick={openDirectoryDialog}
					>
						<FolderOpenIcon />
					</StyledIconButton>
				</Box>

				<Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
					<Box sx={{ display: "flex", gap: 2 }}>
						<StyledTextField
							label="Cookie取得元のブラウザ"
							variant="outlined"
							value={browser}
							onChange={(e) => {
								setBrowser(e.target.value);
								saveBrowserChanged(e.target.value);
							}}
							sx={{ flex: 1 }}
						/>
						<StyledTextField
							label="使用するポート番号"
							variant="outlined"
							value={serverPort}
							disabled={isServerEnabled}
							onChange={(e) => {
								const parsedPort = Number.parseInt(e.target.value, 10);
								if (Number.isNaN(parsedPort)) return;
								if (parsedPort > 65535) return;

								setServerPort(parsedPort);
								saveServerPortChanged(parsedPort);
							}}
							sx={{ flex: 1 }}
						/>
					</Box>
				</Box>
				<Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
					<StyledFormControlLabel
						control={
							<StyledSwitch
								checked={isSendNotification}
								onChange={(e) => {
									setIsSendNotification(e.target.checked);
									saveNotificationChanged(e.target.checked);
								}}
							/>
						}
						label={
							<Box>
								ダウンロード完了時に通知を受け取る
								{osType === "macos" && (
									<Typography
										variant="caption"
										display="block"
										sx={{ color: "text.secondary", fontStyle: "italic" }}
									>
										macOSでは「通知パネル」設定でバナー通知が表示されます
									</Typography>
								)}
							</Box>
						}
					/>
					{isSendNotification && notificationPermission === false && (
						<Alert severity="warning" sx={{ mt: 1 }}>
							通知権限が許可されていません。
							<Button
								size="small"
								onClick={requestNotificationPermission}
								sx={{ ml: 1 }}
							>
								権限を要求
							</Button>
						</Alert>
					)}
					<StyledFormControlLabel
						control={
							<StyledSwitch
								checked={isServerEnabled}
								onChange={(e) => {
									setIsServerEnabled(e.target.checked);
								}}
							/>
						}
						label={`ポート${serverPort}でサーバーを起動する`}
					/>
				</Box>

				{/* ツール設定ボタン */}
				<Box sx={{ display: "flex", justifyContent: "center" }}>
					<Button
						variant="outlined"
						onClick={openToolsModal}
						startIcon={<SettingsIcon />}
						sx={{
							borderColor: "var(--accent-primary)",
							color: "var(--accent-primary)",
							"&:hover": {
								borderColor: "var(--accent-primary)",
								backgroundColor: "var(--surface-hover)",
							},
						}}
					>
						ツール設定を管理
					</Button>
				</Box>

				<Box sx={{ textAlign: "center" }} className="version-info">
					<Typography
						variant="body2"
						color="textSecondary"
						className="version-text"
					>
						<Link
							href="https://github.com/AkaakuHub/yt-dlp-GUI-2"
							target="_blank"
							rel="noopener"
							className="github-link"
						>
							GitHub
						</Link>
						・ バージョン {currentVersion || ""}
						{isUpdateAvailable ? (
							<span>
								・{" "}
								<Link
									href={""}
									onClick={(e) => {
										e.preventDefault();
										executeUpdate();
									}}
									className="update-link"
								>
									ここをクリックしてアップデート
								</Link>
							</span>
						) : (
							<span>・ 最新です</span>
						)}
					</Typography>
				</Box>
			</Container>

			{/* ツール設定モーダル */}
			<Dialog
				open={showToolsModal}
				onClose={() => setShowToolsModal(false)}
				maxWidth="md"
				fullWidth
				BackdropProps={{
					sx: {
						backgroundColor: "rgba(5, 10, 20, 0.6)",
					},
				}}
				PaperProps={{
					sx: {
						backgroundColor: "var(--background-secondary)",
						color: "var(--text-primary)",
						border: "1px solid var(--border-primary)",
						borderRadius: "12px",
						backdropFilter: "none",
					},
				}}
			>
				<DialogTitle
					sx={{
						color: "var(--text-primary)",
						borderBottom: "1px solid var(--border-primary)",
						pb: 2,
					}}
				>
					ツール設定
				</DialogTitle>
				<DialogContent sx={{ pt: 3 }}>
					<Typography
						variant="body1"
						sx={{ color: "var(--text-secondary)", mb: 3 }}
					>
						yt-dlp、FFmpeg、Denoの設定を管理します。
					</Typography>

					<Box mb={3}>
						<Typography
							variant="h6"
							gutterBottom
							sx={{ color: "var(--text-primary)" }}
						>
							ツールの使用方法を選択
						</Typography>
						<StyledRadioGroup
							value={tempUseBundle ? "bundle" : "path"}
							onChange={(e) => setTempUseBundle(e.target.value === "bundle")}
						>
							<MuiFormControlLabel
								value="bundle"
								control={<Radio size="small" />}
								label={
									<Box
										sx={{
											ml: 1,
											display: "flex",
											alignItems: "center",
											gap: 1,
										}}
									>
										<Storage
											sx={{ fontSize: 20, color: "var(--accent-primary)" }}
										/>
										<Box>
											<Typography
												variant="body2"
												fontWeight="600"
												sx={{
													color: "var(--text-primary)",
													fontSize: "0.85rem",
													lineHeight: 1.2,
												}}
											>
												バンドル版（初心者向け）
											</Typography>
											<Typography
												variant="caption"
												sx={{
													color: "var(--text-secondary)",
													fontSize: "0.75rem",
													display: "block",
													mt: 0.3,
												}}
											>
												アプリ内蔵ツールを自動で設定・使用
											</Typography>
										</Box>
									</Box>
								}
							/>
							<MuiFormControlLabel
								value="path"
								control={<Radio size="small" />}
								label={
									<Box
										sx={{
											ml: 1,
											display: "flex",
											alignItems: "center",
											gap: 1,
										}}
									>
										<Build
											sx={{ fontSize: 20, color: "var(--accent-primary)" }}
										/>
										<Box>
											<Typography
												variant="body2"
												fontWeight="600"
												sx={{
													color: "var(--text-primary)",
													fontSize: "0.85rem",
													lineHeight: 1.2,
												}}
											>
												カスタムパス（上級者向け）
											</Typography>
											<Typography
												variant="caption"
												sx={{
													color: "var(--text-secondary)",
													fontSize: "0.75rem",
													display: "block",
													mt: 0.3,
												}}
											>
												手動でインストールしたツールを指定
											</Typography>
										</Box>
									</Box>
								}
							/>
						</StyledRadioGroup>
					</Box>

					{!tempUseBundle && (
						<Box mb={3}>
							<Typography
								variant="h6"
								gutterBottom
								sx={{ color: "var(--text-primary)" }}
							>
								ツールのパス設定
							</Typography>

							<Box mb={2}>
								<StyledTextField
									fullWidth
									label="yt-dlp のパス"
									placeholder="yt-dlp"
									value={tempYtDlpPath}
									onChange={(e) => setTempYtDlpPath(e.target.value)}
									margin="normal"
									helperText="yt-dlp実行ファイルへのパスを入力してください"
								/>
							</Box>

							<Box mb={2}>
								<StyledTextField
									fullWidth
									label="FFmpeg のパス"
									placeholder="ffmpeg"
									value={tempFfmpegPath}
									onChange={(e) => setTempFfmpegPath(e.target.value)}
									margin="normal"
									helperText="FFmpeg実行ファイルへのパスを入力してください"
								/>
							</Box>

							<Box mb={2}>
								<StyledTextField
									fullWidth
									label="Deno のパス"
									placeholder="deno"
									value={tempDenoPath}
									onChange={(e) => setTempDenoPath(e.target.value)}
									margin="normal"
									helperText="Deno実行ファイルへのパスを入力してください"
								/>
							</Box>
						</Box>
					)}

					<Box
						sx={{ display: "flex", flexDirection: "column", gap: 0.75, mb: 3 }}
					>
						{tempUseBundle && (
							<CustomButton
								variant="contained"
								className="variant-primary"
								onClick={downloadBundleTools}
								disabled={
									isDownloadingTools ||
									isCheckingTools ||
									(downloadedOnce &&
										toolCheckResults.ytDlp &&
										toolCheckResults.ffmpeg &&
										toolCheckResults.deno)
								}
								sx={{
									width: "100%",
									height: "48px",
									fontSize: "0.875rem",
								}}
								startIcon={
									isDownloadingTools ? (
										<CircularProgress size={16} color="inherit" />
									) : (
										<Download />
									)
								}
							>
								{isDownloadingTools
									? "ダウンロード中..."
									: "ツールを上書きダウンロード"}
							</CustomButton>
						)}

						<CustomButton
							variant="outlined"
							className="variant-secondary"
							onClick={checkTools}
							disabled={
								isCheckingTools ||
								isDownloadingTools ||
								(!tempUseBundle &&
									(tempYtDlpPath.trim() === "" ||
										tempFfmpegPath.trim() === "" ||
										tempDenoPath.trim() === "")) ||
								(downloadedOnce &&
									toolCheckResults.ytDlp &&
									toolCheckResults.ffmpeg &&
									toolCheckResults.deno)
							}
							sx={{
								width: "100%",
								height: "48px",
								fontSize: "0.875rem",
							}}
							startIcon={
								isCheckingTools ? (
									<CircularProgress size={16} color="inherit" />
								) : (
									<CheckCircle />
								)
							}
						>
							{isCheckingTools ? "確認中..." : "ツールを確認"}
						</CustomButton>
					</Box>

					{/* ダウンロード進捗表示 */}
					{downloadProgress && (
						<Box sx={{ mb: 3 }}>
							<Typography
								variant="caption"
								sx={{ color: "var(--text-primary)", fontSize: "0.7rem" }}
							>
								{downloadProgress.tool_name} - {downloadProgress.status}
							</Typography>
							<LinearProgress
								variant="determinate"
								value={downloadProgress.progress}
								sx={{
									height: 4,
									borderRadius: 2,
									backgroundColor: "var(--surface-secondary)",
									"& .MuiLinearProgress-bar": {
										backgroundColor: "var(--accent-primary)",
									},
								}}
							/>
							<Typography
								variant="caption"
								sx={{ color: "var(--text-secondary)", fontSize: "0.65rem" }}
							>
								{downloadProgress.progress.toFixed(1)}%
							</Typography>
						</Box>
					)}

					{(toolCheckResults.ytDlp ||
						toolCheckResults.ffmpeg ||
						toolCheckResults.deno) && (
						<Box mb={2}>
							<Alert
								severity={
									toolCheckResults.ytDlp &&
									toolCheckResults.ffmpeg &&
									toolCheckResults.deno
										? "success"
										: "warning"
								}
								sx={{
									backgroundColor: "var(--surface-primary)",
									color: "var(--text-primary)",
									border: "1px solid var(--border-primary)",
									borderRadius: "10px",
									"& .MuiAlert-icon": {
										color:
											toolCheckResults.ytDlp &&
											toolCheckResults.ffmpeg &&
											toolCheckResults.deno
												? "var(--success)"
												: "var(--warning)",
									},
								}}
							>
								<Typography
									variant="body2"
									sx={{ color: "var(--text-primary)" }}
								>
									yt-dlp: {toolCheckResults.ytDlp ? "✓ 利用可能" : "✗ 利用不可"}
									<br />
									FFmpeg:{" "}
									{toolCheckResults.ffmpeg ? "✓ 利用可能" : "✗ 利用不可"}
									<br />
									Deno: {toolCheckResults.deno ? "✓ 利用可能" : "✗ 利用不可"}
								</Typography>
							</Alert>
						</Box>
					)}
				</DialogContent>
				<DialogActions
					sx={{ p: 3, borderTop: "1px solid var(--border-primary)" }}
				>
					<CustomButton
						variant="outlined"
						className="variant-secondary"
						onClick={() => setShowToolsModal(false)}
					>
						キャンセル
					</CustomButton>
					<CustomButton
						onClick={saveToolsSettings}
						variant="contained"
						className="variant-primary"
						disabled={
							!toolCheckResults.ytDlp ||
							!toolCheckResults.ffmpeg ||
							!toolCheckResults.deno
						}
					>
						設定を保存
					</CustomButton>
				</DialogActions>
			</Dialog>
		</Box>
	);
}
