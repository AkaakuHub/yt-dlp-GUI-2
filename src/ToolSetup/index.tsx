import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import { listen } from "@tauri-apps/api/event";
import "./index.css";

import CustomButton from "../_components/CustomButton";
import { useAppContext } from "../_components/AppContext";
import { ConfigProps } from "../types";
import { toast } from "react-toastify";

import {
  Box,
  Typography,
  Paper,
  RadioGroup,
  FormControlLabel,
  Radio,
  TextField,
  Alert,
  CircularProgress,
  LinearProgress,
} from "@mui/material";
import { styled } from "@mui/material/styles";

const StyledPaper = styled(Paper)(() => ({
  backgroundColor: 'var(--surface-primary)',
  color: 'var(--text-primary)',
  border: '1px solid var(--border-primary)',
  borderRadius: '12px',
  padding: '2rem',
  marginBottom: '1rem',
  backdropFilter: 'var(--backdrop-blur)',
  boxShadow: 'var(--shadow-lg)',
}));

const StyledRadioGroup = styled(RadioGroup)(() => ({
  '& .MuiFormControlLabel-root': {
    color: 'var(--text-primary)',
  },
  '& .MuiRadio-root': {
    color: 'var(--text-primary)',
    '&.Mui-checked': {
      color: 'var(--accent-primary)',
    },
  },
}));

const StyledTextField = styled(TextField)(() => ({
  '& .MuiInputBase-input': {
    backgroundColor: 'var(--input-background)',
    color: 'var(--text-primary)',
    borderRadius: '8px',
    border: '1px solid var(--border-primary)',
    padding: '12px 16px',
    '&:focus': {
      borderColor: 'var(--accent-primary)',
    },
  },
  '& .MuiInputLabel-root': {
    color: 'var(--text-secondary)',
  },
  '& .MuiOutlinedInput-root': {
    '& fieldset': {
      borderColor: 'var(--border-primary)',
    },
    '&:hover fieldset': {
      borderColor: 'var(--accent-primary)',
    },
    '&.Mui-focused fieldset': {
      borderColor: 'var(--accent-primary)',
    },
  },
}));

interface ToolSetupProps {
  onComplete: () => void;
}

interface DownloadProgress {
  tool_name: string;
  progress: number;
  status: string;
}

export default function ToolSetup({ onComplete }: ToolSetupProps) {
  const [useBundle, setUseBundle] = useState(true);
  const [ytDlpPath, setYtDlpPath] = useState("");
  const [ffmpegPath, setFfmpegPath] = useState("");
  const [isChecking, setIsChecking] = useState(false);
  const [checkResults, setCheckResults] = useState<{ ytDlp: boolean; ffmpeg: boolean }>({ ytDlp: false, ffmpeg: false });
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);
  const [downloadedOnce, setDownloadedOnce] = useState(false);

  const { setIsSettingLoaded } = useAppContext();

  useEffect(() => {
    loadSettings();

    // ダウンロード進捗リスナーを設定
    const unlisten = listen<DownloadProgress>('download-progress', (event) => {
      setDownloadProgress(event.payload);
    });

    return () => {
      unlisten.then(fn => fn());
    };
  }, []);

  const loadSettings = async () => {
    try {
      const settings = await invoke<ConfigProps>("get_settings");
      setUseBundle(settings.use_bundle_tools);

      // バンドルモードの場合、現在の実行環境に合わせた正しいデフォルトパスを設定
      if (settings.use_bundle_tools) {
        // 現在の設定が古い可能性があるため、バンドルモードの場合は正しいパスを強制設定
        await invoke("set_use_bundle_tools", { useBundleTools: true });
        const updatedSettings = await invoke<ConfigProps>("get_settings");
        setYtDlpPath(updatedSettings.yt_dlp_path);
        setFfmpegPath(updatedSettings.ffmpeg_path);
      } else {
        setYtDlpPath(settings.yt_dlp_path);
        setFfmpegPath(settings.ffmpeg_path);
      }
    } catch (error) {
      console.error("Failed to load settings:", error);
    }
  };

  const saveSettings = async () => {
    try {
      await invoke("set_use_bundle_tools", { useBundleTools: useBundle });

      if (!useBundle) {
        await invoke("set_yt_dlp_path", { ytDlpPath });
        await invoke("set_ffmpeg_path", { ffmpegPath });
      }

      // 再度設定を読み込み
      await invoke<ConfigProps>("get_settings");

      setIsSettingLoaded(true);
      onComplete();
    } catch (error) {
      console.error("Failed to save settings:", error);
      toast.error("設定の保存に失敗しました");
    }
  };

  const downloadBundleTools = async () => {
    setIsDownloading(true);
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
      setIsDownloading(false);
      setDownloadProgress(null);
    }
  };

  const checkTools = async () => {
    setIsChecking(true);
    try {
      // 設定から現在のパスを取得
      const settings = await invoke<ConfigProps>("get_settings");

      let ytDlpPathToUse: string | undefined;
      let ffmpegPathToUse: string | undefined;

      if (useBundle) {
        ytDlpPathToUse = settings.yt_dlp_path;
        ffmpegPathToUse = settings.ffmpeg_path;
      } else {
        ytDlpPathToUse = ytDlpPath || undefined;
        ffmpegPathToUse = ffmpegPath || undefined;
      }

      const ytDlpResult = await invoke<string>("is_program_available", {
        programName: "yt-dlp",
        customPath: ytDlpPathToUse,
      });

      const ffmpegResult = await invoke<string>("is_program_available", {
        programName: "ffmpeg",
        customPath: ffmpegPathToUse,
      });

      setCheckResults({
        ytDlp: ytDlpResult.includes("found"),
        ffmpeg: ffmpegResult.includes("found"),
      });

      if (ytDlpResult.includes("found") && ffmpegResult.includes("found")) {
        toast.success("すべてのツールが利用可能です");
      } else {
        const failedTools = [];
        if (!ytDlpResult.includes("found")) failedTools.push("yt-dlp");
        if (!ffmpegResult.includes("found")) failedTools.push("FFmpeg");
        toast.error(`以下のツールが利用できません: ${failedTools.join(", ")}`);
      }
    } catch (error) {
      console.error("Tool check failed:", error);
      const errorMsg = error instanceof Error ? error.message : String(error);

      // エラーメッセージからどのツールが失敗したかを特定
      if (errorMsg.includes("yt-dlp")) {
        toast.error(`yt-dlpのチェックに失敗しました: ${errorMsg}`);
      } else if (errorMsg.includes("ffmpeg")) {
        toast.error(`FFmpegのチェックに失敗しました: ${errorMsg}`);
      } else {
        toast.error(`ツールのチェックに失敗しました: ${errorMsg}`);
      }

      setCheckResults({ ytDlp: false, ffmpeg: false });
    } finally {
      setIsChecking(false);
    }
  };

  const handleModeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setUseBundle(event.target.value === "bundle");
  };

  const isConfigValid = useBundle ? true : ytDlpPath.trim() !== "" && ffmpegPath.trim() !== "";

  return (
    <div className="tool-setup-root">
      <div className="tool-setup-container">
        <StyledPaper elevation={3}>
          <Typography variant="h4" component="h1" gutterBottom style={{ color: 'var(--text-primary)', marginBottom: '2rem' }}>
            初期設定 - ツール設定
          </Typography>

          <Typography variant="body1" style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>
            yt-dlp GUIを使用するために必要なツールを設定します。初心者の方は「バンドル版を使用」をお勧めします。
          </Typography>

          <Box mb={3}>
            <Typography variant="h6" gutterBottom style={{ color: 'var(--text-primary)' }}>
              ツールの使用方法を選択
            </Typography>
            <StyledRadioGroup
              value={useBundle ? "bundle" : "path"}
              onChange={handleModeChange}
            >
              <FormControlLabel
                value="bundle"
                control={<Radio />}
                label={
                  <Box>
                    <Typography variant="body1" fontWeight="bold">
                      初心者向け: バンドル版を使用
                    </Typography>
                    <Typography variant="body2" color="textSecondary">
                      アプリに内蔵されたツールを自動的に使用します（推奨）
                    </Typography>
                  </Box>
                }
              />
              <FormControlLabel
                value="path"
                control={<Radio />}
                label={
                  <Box>
                    <Typography variant="body1" fontWeight="bold">
                      上級者向け: システムのツールを使用
                    </Typography>
                    <Typography variant="body2" color="textSecondary">
                      パスが通っているツールまたは指定したパスのツールを使用します
                    </Typography>
                  </Box>
                }
              />
            </StyledRadioGroup>
          </Box>

          {!useBundle && (
            <Box mb={3}>
              <Typography variant="h6" gutterBottom style={{ color: 'var(--text-primary)' }}>
                ツールのパス設定
              </Typography>

              <Box mb={2}>
                <StyledTextField
                  fullWidth
                  label="yt-dlp のパス"
                  placeholder="yt-dlp"
                  value={ytDlpPath}
                  onChange={(e) => setYtDlpPath(e.target.value)}
                  margin="normal"
                  helperText="yt-dlp実行ファイルへのパスを入力してください"
                />
              </Box>

              <Box mb={2}>
                <StyledTextField
                  fullWidth
                  label="FFmpeg のパス"
                  placeholder="ffmpeg"
                  value={ffmpegPath}
                  onChange={(e) => setFfmpegPath(e.target.value)}
                  margin="normal"
                  helperText="FFmpeg実行ファイルへのパスを入力してください"
                />
              </Box>
            </Box>
          )}

          <Box mb={3}>
            {useBundle && (
              <CustomButton
                variant="contained"
                onClick={downloadBundleTools}
                disabled={isDownloading || isChecking || (downloadedOnce && checkResults.ytDlp && checkResults.ffmpeg)}
                style={{ marginRight: '1rem' }}
              >
                {isDownloading ? <CircularProgress size={20} /> : "バンドルツールをダウンロード"}
              </CustomButton>
            )}

            <CustomButton
              variant="contained"
              onClick={checkTools}
              disabled={isChecking || isDownloading || (!useBundle && !isConfigValid) || (downloadedOnce && checkResults.ytDlp && checkResults.ffmpeg)}
              style={{ marginRight: '1rem' }}
            >
              {isChecking ? <CircularProgress size={20} /> : "ツールの状態を確認"}
            </CustomButton>

            <CustomButton
              variant="contained"
              onClick={saveSettings}
              disabled={!checkResults.ytDlp || !checkResults.ffmpeg}
            >
              設定を完了してアプリを開始
            </CustomButton>
          </Box>

          {/* ダウンロード進捗表示 */}
          {downloadProgress && (
            <Box mb={2}>
              <Typography variant="body2" gutterBottom>
                {downloadProgress.tool_name} - {downloadProgress.status}
              </Typography>
              <LinearProgress
                variant="determinate"
                value={downloadProgress.progress}
                sx={{
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: 'var(--surface-secondary)',
                  '& .MuiLinearProgress-bar': {
                    backgroundColor: 'var(--accent-primary)',
                  }
                }}
              />
              <Typography variant="caption" display="block" mt={1}>
                {downloadProgress.progress.toFixed(1)}%
              </Typography>
            </Box>
          )}

          {(checkResults.ytDlp || checkResults.ffmpeg) && (
            <Box mb={2}>
              <Alert
                severity={checkResults.ytDlp && checkResults.ffmpeg ? "success" : "warning"}
              >
                <Typography variant="body2">
                  yt-dlp: {checkResults.ytDlp ? "✓ 利用可能" : "✗ 利用不可"}
                  <br />
                  FFmpeg: {checkResults.ffmpeg ? "✓ 利用可能" : "✗ 利用不可"}
                </Typography>
              </Alert>
            </Box>
          )}

          <Alert severity="info" style={{ marginTop: '1rem' }}>
            <Typography variant="body2">
              <strong>ヒント:</strong>
              <br />
              • バンドル版を使用すると、ツールのインストールやパス設定が不要で簡単に始められます
              <br />
              • 上級者向けモードでは、最新バージョンのツールやカスタムビルドを使用できます
              <br />
              • ツールが見つからない場合は、公式サイトからダウンロードしてインストールしてください
            </Typography>
          </Alert>
        </StyledPaper>
      </div>
    </div>
  );
}