import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import { listen } from "@tauri-apps/api/event";
import "./index.css";

import CustomButton from "../_components/CustomButton";
import { useAppContext } from "../_components/AppContext";
import { toast } from "react-toastify";

import {
  Box,
  Typography,
  Container,
  TextField,
  RadioGroup,
  FormControlLabel,
  Radio,
  Alert,
  CircularProgress,
  LinearProgress,
} from "@mui/material";
import {
  Download,
  CheckCircle,
  PlayArrow,
  Storage,
  Settings,
} from "@mui/icons-material";
import { styled } from "@mui/material/styles";
import { checkToolAvailability } from "../_utils/toolAvailability";

// プロジェクト既存のスタイルを適用
const StyledTextField = styled(TextField)(() => ({
  '& .MuiInputBase-root': {
    borderRadius: '12px',
  },
  '& .MuiOutlinedInput-root': {
    backgroundColor: 'var(--input-background)',
    color: 'var(--text-primary)',
    transition: 'all 0.2s ease-in-out',
    '&:hover': {
      backgroundColor: 'var(--input-background-hover)',
      '& .MuiOutlinedInput-notchedOutline': {
        borderColor: 'var(--accent-primary)',
      }
    },
    '&.Mui-focused': {
      backgroundColor: 'var(--input-background-focus)',
      '& .MuiOutlinedInput-notchedOutline': {
        borderColor: 'var(--accent-primary)',
        borderWidth: '2px',
      }
    },
    '& .MuiOutlinedInput-notchedOutline': {
      borderColor: 'var(--border-primary)',
      transition: 'all 0.2s ease-in-out',
    }
  },
  '& .MuiInputLabel-root': {
    color: 'var(--text-secondary)',
    '&.Mui-focused': {
      color: 'var(--accent-primary)',
    }
  },
  '& .MuiInputBase-input': {
    color: 'var(--text-primary)',
  }
}));

const StyledFormControlLabel = styled(FormControlLabel)(() => ({
  margin: '8px 0',
  padding: '14px 16px',
  borderRadius: '12px',
  border: '1px solid var(--border-primary)',
  backgroundColor: 'var(--surface-primary)',
  transition: 'all 0.2s ease-in-out',
  '&:hover': {
    backgroundColor: 'var(--surface-hover)',
    borderColor: 'var(--accent-primary)',
    transform: 'translateY(-1px)',
    boxShadow: 'var(--shadow-md)',
  },
  '& .MuiFormControlLabel-label': {
    color: 'var(--text-primary)',
    fontWeight: 500,
  }
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

interface ToolSetupProps {
  onComplete: () => void;
}

interface DownloadProgress {
  tool_name: string;
  progress: number;
  status: string;
}

export default function ToolSetup({ onComplete }: ToolSetupProps) {
  const [isChecking, setIsChecking] = useState(false);
  const [checkResults, setCheckResults] = useState<{ ytDlp: boolean; ffmpeg: boolean }>({ ytDlp: false, ffmpeg: false });
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);
  const [downloadedOnce, setDownloadedOnce] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const {
    useBundleTools,
    setUseBundleTools,
    ytDlpPath,
    setYtDlpPath,
    ffmpegPath,
    setFfmpegPath,
    isSettingLoaded,
    setIsSettingLoaded
  } = useAppContext();

  useEffect(() => {
    // AppContextの設定が読み込まれたら処理
    if (isSettingLoaded) {
      checkInitialSetup();
    }

    // ダウンロード進捗リスナーを設定
    const unlisten = listen<DownloadProgress>('download-progress', (event) => {
      setDownloadProgress(event.payload);
    });

    return () => {
      unlisten.then(fn => fn());
    };
  }, [isSettingLoaded, ytDlpPath, ffmpegPath, useBundleTools]);

  const checkInitialSetup = async () => {
    try {
      const status = await checkToolAvailability(useBundleTools, ytDlpPath, ffmpegPath);
      if (status.ok) {
        setCheckResults({ ytDlp: true, ffmpeg: true });
        // 少し待ってから完了通知を送信（ローディング画面との遷移をスムーズにするため）
        setTimeout(() => {
          setIsSettingLoaded(true);
          onComplete();
        }, 500);
        return;
      }
    } catch {
      // noop: 失敗時は通常のセットアップ画面を表示
    }

    setIsLoading(false);
  };

  const saveSettings = async () => {
    try {
      await invoke("set_use_bundle_tools", { useBundleTools: useBundleTools });

      if (!useBundleTools) {
        await invoke("set_yt_dlp_path", { ytDlpPath });
        await invoke("set_ffmpeg_path", { ffmpegPath });
      }

      // 設定完了後、少し待ってから完了通知（スムーズな体験のため）
      setTimeout(() => {
        onComplete();
      }, 1000);
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
      const status = await checkToolAvailability(useBundleTools, ytDlpPath, ffmpegPath);
      if (!status.ok) {
        toast.error(status.ytDlpError || status.ffmpegError || "ツールが見つかりません。先にダウンロードまたはパス設定を行ってください。");
        setCheckResults({ ytDlp: false, ffmpeg: false });
        return;
      }

      setCheckResults({
        ytDlp: status.ytDlpFound,
        ffmpeg: status.ffmpegFound,
      });

      if (status.ok) {
        toast.success("すべてのツールが利用可能です");
      } else {
        const failedTools = [];
        if (!status.ytDlpFound) failedTools.push("yt-dlp");
        if (!status.ffmpegFound) failedTools.push("FFmpeg");
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
    setUseBundleTools(event.target.value === "bundle");
  };

  const isConfigValid = useBundleTools ? true : ytDlpPath.trim() !== "" && ffmpegPath.trim() !== "";

  // ローディング中はローディング画面を表示
  if (isLoading) {
    return (
      <div className="tool-setup-root">
        <Container maxWidth="sm" sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          gap: 3
        }}>
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: "3rem",
              backgroundColor: 'var(--surface-primary)',
              border: '1px solid var(--border-primary)',
              borderRadius: '12px',
              boxShadow: 'var(--shadow-lg)',
              backdropFilter: 'var(--backdrop-blur)',
              textAlign: 'center'
            }}
          >
            <CircularProgress size={60} sx={{
              color: 'var(--accent-primary)',
              marginBottom: '1rem'
            }} />
            <Typography variant="h6" component="h2" sx={{
              color: 'var(--text-primary)',
              marginBottom: '0.5rem',
              fontWeight: 600
            }}>
              設定を読み込み中...
            </Typography>
            <Typography variant="body2" sx={{
              color: 'var(--text-secondary)'
            }}>
              ツールの状態を確認しています
            </Typography>
          </Box>
        </Container>
      </div>
    );
  }

  return (
    <div className="tool-setup-root">
      <Container maxWidth="md" className="tool-setup-container" sx={{ py: 4, px: { xs: 2, sm: 3 } }}>
        <Box
          className="tool-setup-panel"
          sx={{
            padding: { xs: "1.25rem", sm: "1.75rem" },
            backgroundColor: 'var(--surface-primary)',
            border: '1px solid var(--border-primary)',
            borderRadius: '12px',
            boxShadow: 'var(--shadow-lg)',
            backdropFilter: 'var(--backdrop-blur)',
          }}
        >
          <Typography variant="h4" component="h1" sx={{
            color: 'var(--text-primary)',
            marginBottom: '0.35rem',
            fontWeight: 700,
            textAlign: 'center',
            fontSize: { xs: '1.35rem', sm: '1.6rem' }
          }}>
            初期設定
          </Typography>

          <Typography variant="h6" sx={{
            color: 'var(--accent-primary)',
            marginBottom: '0.75rem',
            textAlign: 'center',
            fontWeight: 500,
            fontSize: { xs: '0.95rem', sm: '1rem' }
          }}>
            ツール設定
          </Typography>

          <Typography variant="body2" sx={{
            color: 'var(--text-secondary)',
            marginBottom: '1rem',
            textAlign: 'center',
            fontSize: { xs: '0.9rem', sm: '0.95rem' },
            lineHeight: 1.5
          }}>
            必要なツールを設定
          </Typography>

          <Box>
            <Typography variant="subtitle1" sx={{
              color: 'var(--text-primary)',
              fontWeight: 600,
              fontSize: { xs: '0.95rem', sm: '1rem' }
            }}>
              ツールの使用方法
            </Typography>
            <StyledRadioGroup
              value={useBundleTools ? "bundle" : "path"}
              onChange={handleModeChange}
              sx={{ gap: 1, marginTop: 1 }}
            >
              <StyledFormControlLabel
                value="bundle"
                control={<Radio size="small" />}
                label={
                  <Box sx={{ ml: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Storage sx={{ fontSize: 20, color: 'var(--accent-primary)' }} />
                    <Box>
                      <Typography variant="body2" fontWeight="600" sx={{ color: 'var(--text-primary)', fontSize: { xs: '0.95rem', sm: '1rem' }, lineHeight: 1.3 }}>
                        バンドル版（初心者向け）
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'var(--text-secondary)', fontSize: '0.85rem', display: 'block', mt: 0.4 }}>
                        アプリ内蔵ツールを自動で設定・使用
                      </Typography>
                    </Box>
                  </Box>
                }
              />
              <StyledFormControlLabel
                value="path"
                control={<Radio size="small" />}
                label={
                  <Box sx={{ ml: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Settings sx={{ fontSize: 20, color: 'var(--accent-primary)' }} />
                    <Box>
                      <Typography variant="body2" fontWeight="600" sx={{ color: 'var(--text-primary)', fontSize: { xs: '0.95rem', sm: '1rem' }, lineHeight: 1.3 }}>
                        カスタムパス（上級者向け）
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'var(--text-secondary)', fontSize: '0.85rem', display: 'block', mt: 0.4 }}>
                        手動でインストールしたツールを指定
                      </Typography>
                    </Box>
                  </Box>
                }
              />
            </StyledRadioGroup>
          </Box>

          {!useBundleTools && (
            <Box sx={{ marginBottom: '1.5rem', marginTop: 1.25 }}>
              <Typography variant="subtitle1" sx={{
                color: 'var(--text-primary)',
                fontWeight: 600,
                marginBottom: '0.5rem',
                fontSize: { xs: '0.95rem', sm: '1rem' }
              }}>
                ツールパス設定
              </Typography>

              <Box sx={{ marginBottom: '0.5rem' }}>
                <StyledTextField
                  fullWidth
                  size="small"
                  label="yt-dlp のパス"
                  placeholder="yt-dlp"
                  value={ytDlpPath}
                  onChange={(e) => setYtDlpPath(e.target.value)}
                  margin="dense"
                  helperText="yt-dlp実行ファイルのパス"
                />
              </Box>

              <Box sx={{ marginBottom: '0.5rem' }}>
                <StyledTextField
                  fullWidth
                  size="small"
                  label="FFmpeg のパス"
                  placeholder="ffmpeg"
                  value={ffmpegPath}
                  onChange={(e) => setFfmpegPath(e.target.value)}
                  margin="dense"
                  helperText="FFmpeg実行ファイルのパス"
                />
              </Box>
            </Box>
          )}

          <Box sx={{ display: "flex", flexDirection: "column", gap: 1, marginBottom: '1rem' }}>
            {useBundleTools && (
              <CustomButton
                variant="contained"
                className="variant-primary"
                onClick={downloadBundleTools}
                disabled={isDownloading || isChecking || (downloadedOnce && checkResults.ytDlp && checkResults.ffmpeg)}
                sx={{
                  width: '100%',
                  height: '48px',
                  fontSize: '0.95rem'
                }}
                startIcon={isDownloading ? <CircularProgress size={16} color="inherit" /> : <Download />}
              >
                {isDownloading ? "ダウンロード中..." : "ツールをダウンロード"}
              </CustomButton>
            )}

            <Box sx={{ display: "flex", gap: 1, flexWrap: { xs: "wrap", sm: "nowrap" } }}>
              <CustomButton
                variant="outlined"
                className="variant-secondary"
                onClick={checkTools}
                disabled={isChecking || isDownloading || (!useBundleTools && !isConfigValid) || (downloadedOnce && checkResults.ytDlp && checkResults.ffmpeg)}
                sx={{
                  flex: '1 1 0px',
                  height: '48px',
                  fontSize: '0.95rem',
                  minWidth: { xs: "100%", sm: "auto" }
                }}
                startIcon={isChecking ? <CircularProgress size={16} color="inherit" /> : <CheckCircle />}
              >
                {isChecking ? "確認中..." : "ツールを確認"}
              </CustomButton>

              <CustomButton
                variant="contained"
                className="variant-primary"
                onClick={saveSettings}
                disabled={!checkResults.ytDlp || !checkResults.ffmpeg}
                sx={{
                  flex: '1 1 0px',
                  height: '48px',
                  fontSize: '0.95rem',
                  minWidth: { xs: "100%", sm: "auto" }
                }}
                startIcon={<PlayArrow />}
              >
                設定完了して開始
              </CustomButton>
            </Box>
          </Box>

          {/* ダウンロード進捗表示 */}
          {downloadProgress && (
            <Box sx={{ marginBottom: '0.75rem' }}>
              <Typography variant="caption" sx={{ color: 'var(--text-primary)', fontSize: '0.8rem' }}>
                {downloadProgress.tool_name} - {downloadProgress.status}
              </Typography>
              <LinearProgress
                variant="determinate"
                value={downloadProgress.progress}
                sx={{
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: 'var(--surface-secondary)',
                  '& .MuiLinearProgress-bar': {
                    backgroundColor: 'var(--accent-primary)',
                  }
                }}
              />
              <Typography variant="caption" sx={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                {downloadProgress.progress.toFixed(1)}%
              </Typography>
            </Box>
          )}

          {(checkResults.ytDlp || checkResults.ffmpeg) && (
            <Box sx={{ marginBottom: '0.75rem' }}>
              <Alert
                severity={checkResults.ytDlp && checkResults.ffmpeg ? "success" : "warning"}
                sx={{
                  backgroundColor: 'var(--surface-primary)',
                  border: '1px solid var(--border-primary)',
                  borderRadius: '6px',
                  padding: '0.4rem 0.6rem'
                }}
              >
                <Typography variant="caption" sx={{ fontSize: '0.8rem' }}>
                  yt-dlp: {checkResults.ytDlp ? "OK" : "NG"} |
                  FFmpeg: {checkResults.ffmpeg ? "OK" : "NG"}
                </Typography>
              </Alert>
            </Box>
          )}

          <Alert
            severity="info"
            sx={{
              backgroundColor: 'var(--surface-primary)',
              border: '1px solid var(--border-primary)',
              borderRadius: '6px',
              padding: '0.4rem 0.6rem'
            }}
          >
            <Typography variant="caption" sx={{ fontSize: '0.8rem', lineHeight: 1.4 }}>
              <strong>ヒント:</strong><br />
              ・ バンドル版: インストール不要で簡単<br />
              ・ 上級者向け: 最新ツールを使用可能
            </Typography>
          </Alert>
        </Box>
      </Container>
    </div>
  );
}



