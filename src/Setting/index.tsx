/* eslint-disable @typescript-eslint/no-unused-vars */
import { useEffect, useState } from "react";
import { useAppContext } from "../_components/AppContext";
import ThemeSelector from "../_components/ThemeSelector";
import {
  IconButton,
  Container,
  Paper,
  TextField,
  Box,
  Typography,
  Link,
  Switch,
} from "@mui/material";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import { invoke } from "@tauri-apps/api/tauri";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/api/dialog";
import { debounce } from "lodash";
import {
  checkUpdate,
  installUpdate,
} from '@tauri-apps/api/updater'
import { relaunch } from '@tauri-apps/api/process'

import "./index.css";

import { toast } from "react-toastify";
import { dialog } from "@tauri-apps/api";

export default function Settings() {
  const { saveDir, setSaveDir } = useAppContext();
  const { browser, setBrowser } = useAppContext();
  const { serverPort, setServerPort } = useAppContext();
  const { isSendNotification, setIsSendNotification } = useAppContext();
  const { isServerEnabled, setIsServerEnabled } = useAppContext();

  const [currentVersion, setCurrentVersion] = useState("");
  const [isUpdateAvailable, setIsUpdateAvailable] = useState(false);

  const executeUpdate = async () => {
    // Install the update. This will also restart the app on Windows!
    await installUpdate();
    // On macOS and Linux you will need to restart the app manually.
    // You could use this step to display another confirmation dialog.
    await relaunch();
  }

  useEffect(() => {
    const checkForUpdates = async () => {
      // await emit("tauri://update");
      // const unlisten = await onUpdaterEvent(({ error, status }) => {
      //   console.log('Updater event', error, status)
      // })
      try {
        const { shouldUpdate, manifest } = await checkUpdate()
        if (shouldUpdate) {
          setIsUpdateAvailable(true);
          const yes = await dialog.ask(`最新バージョン(${manifest?.version})があります！アップデートしますか？`, {
            "okLabel": "はい",
            "cancelLabel": "いいえ",
          });
          // \n\nリリースノート: ${manifest?.body}
          if (yes) {
            executeUpdate();
          } else {
            toast.info("アップデートはキャンセルされました。設定タブから行うこともできます。");
          }
        }
      } catch (error) {
        alert(error);
      }
      // unlisten();
    }
    checkForUpdates();
  }, []);

  useEffect(() => {
    const getCurrentVersion = async () => {
      const version = await invoke<string>("get_current_version");
      setCurrentVersion(version);
    };
    getCurrentVersion();
  }, []);

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

  const saveNotificationChanged = debounce(async (temp_notification: boolean) => {
    await invoke("set_is_send_notification", { newIsSendNotification: temp_notification });
  }, 500);

  const saveServerEnabledChanged = debounce(async (temp_serverEnabled: boolean) => {
    await invoke("set_is_server_enabled", { newIsServerEnabled: temp_serverEnabled });
  }, 500);

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

  useEffect(() => {
    if (serverPort === 0 || isNaN(serverPort)) { return; }

    invoke("toggle_server", { enable: isServerEnabled, port: serverPort });
  }, [isServerEnabled, serverPort]);


  useEffect(() => {
    const unlistenStartServerOutput = listen<string>("start-server-output", (event) => {
      const data = event.payload;
      // console.log(data);
      if (data === "失敗") {
        toast.error("サーバーの起動に失敗しました。ポート番号が他のプログラムで使用されています。");

        saveServerEnabledChanged(false);
        setIsServerEnabled(false);
      } else {
        saveServerEnabledChanged(true);
      }
    });

    return () => {
      unlistenStartServerOutput.then((fn) => fn());
    }
  }, [])

  return (
    <Box sx={{ flexGrow: 1 }} className="settings-container">
      <Container maxWidth="sm" sx={{ mt: 3 }}>
        <div className="settings-paper">
          <Box sx={{ mb: 2 }}>
            <ThemeSelector />
          </Box>

          <Box component="form" sx={{ "& > :not(style)": { m: 1 } }}>
            <Box sx={{ display: "flex", alignItems: "center", pb: 1 }} className="input-group">
              <TextField
                fullWidth
                label="保存先"
                variant="outlined"
                value={saveDir}
                onChange={(e) => {
                  setSaveDir(e.target.value);
                  saveDirChanged(e.target.value);
                }}
                className="settings-input"
              />
              <IconButton
                color="primary"
                aria-label="フォルダを開く"
                onClick={openDirectoryDialog}
                sx={{ ml: 1 }}
                className="folder-button"
              >
                <FolderOpenIcon />
              </IconButton>
            </Box>
            <Box sx={{ mb: 2, display: "flex", gap: 2 }} className="input-group">
              <TextField
                label="Cookie取得元のブラウザ"
                variant="outlined"
                value={browser}
                onChange={(e) => {
                  setBrowser(e.target.value);
                  saveBrowserChanged(e.target.value);
                }}
                className="settings-input"
                sx={{
                  flexGrow: 1,
                  width: "50%",
                }}
              />
              <TextField
                label="使用するポート番号"
                variant="outlined"
                value={serverPort}
                disabled={isServerEnabled}
                onChange={(e) => {
                  try {
                    parseInt(e.target.value);
                  } catch (error) {
                    return;
                  }
                  if (isNaN(parseInt(e.target.value))) return;
                  if (parseInt(e.target.value) > 65535) return;

                  setServerPort(parseInt(e.target.value));
                  saveServerPortChanged(parseInt(e.target.value));
                }}
                className="settings-input"
                sx={{
                  flexGrow: 1,
                  width: "50%",
                }}
              />
            </Box>
            <div className="switch-group">
              <Switch
                checked={isSendNotification}
                onChange={(e) => {
                  setIsSendNotification(e.target.checked);
                  saveNotificationChanged(e.target.checked);
                }}
                className="settings-switch"
              />
              <span className="switch-label">ダウンロード完了時に通知を受け取る</span>
            </div>
            <div className="switch-group">
              <Switch
                checked={isServerEnabled}
                onChange={(e) => {
                  setIsServerEnabled(e.target.checked);
                }}
                className="settings-switch"
              />
              <span className="switch-label">ポート{serverPort}でサーバーを起動する</span>
            </div>
          </Box>
        </div>

        <Box sx={{ mt: 4, textAlign: "center" }} className="version-info">
          <Typography variant="body2" color="textSecondary" className="version-text">
            <Link href="https://github.com/AkaakuHub/yt-dlp-GUI-2" target="_blank" rel="noopener" className="github-link">
              GitHub
            </Link>
            ・ バージョン {currentVersion || ""}
            {isUpdateAvailable ? (
              <span>・ <Link href={""} onClick={(e) => {
                e.preventDefault();
                executeUpdate();
              }} className="update-link">ここをクリックしてアップデート</Link>
              </span>
            ) : (
              <span>・ 最新です</span>
            )}
          </Typography>
        </Box>
      </Container>
    </Box>
  );
}
