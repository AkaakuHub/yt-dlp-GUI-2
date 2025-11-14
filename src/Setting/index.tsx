import { useEffect, useState } from "react";
import { useAppContext } from "../_components/AppContext";
import ThemeSelector from "../_components/ThemeSelector";
import CustomButton from "../_components/CustomButton";
import { Input } from "../ui/input";
import { Switch } from "../ui/switch";
import { HomeIcon } from "../ui/icons";
import { invoke } from "@tauri-apps/api/tauri";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/api/dialog";
import { debounce } from "lodash";
import { checkUpdate, installUpdate } from '@tauri-apps/api/updater'
import { relaunch } from '@tauri-apps/api/process'

import "./index.css";

import { toast } from "react-toastify";
import { dialog } from "@tauri-apps/api";
import { isPermissionGranted, requestPermission } from "@tauri-apps/api/notification";

export default function Settings() {
  const { saveDir, setSaveDir } = useAppContext();
  const { browser, setBrowser } = useAppContext();
  const { serverPort, setServerPort } = useAppContext();
  const { isSendNotification, setIsSendNotification } = useAppContext();
  const { isServerEnabled, setIsServerEnabled } = useAppContext();

  const [currentVersion, setCurrentVersion] = useState("");
  const [isUpdateAvailable, setIsUpdateAvailable] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<boolean | null>(null);
  const [osType, setOsType] = useState<string>("");

  const executeUpdate = async () => {
    await installUpdate();
    await dialog.message("アップデートが完了しました。再起動します。");
    await invoke("exit_app");
    await relaunch();
  }

  useEffect(() => {
    const checkForUpdates = async () => {
      try {
        const { shouldUpdate, manifest } = await checkUpdate()
        if (shouldUpdate) {
          setIsUpdateAvailable(true);
          const yes = await dialog.ask(`新しいバージョン(${manifest?.version})が見つかりました。\n\nアップデートを実行しますか？`, {
            okLabel: "はい",
            cancelLabel: "いいえ",
          });
          if (yes) {
            executeUpdate();
          } else {
            toast.info("アップデートをキャンセルしました。設定タブから行うこともできます。");
          }
        }
      } catch (error) {
        alert(error);
      }
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

  useEffect(() => {
    const getOsType = async () => {
      const os = await invoke<string>("get_os_type");
      setOsType(os);
    };
    getOsType();
  }, []);

  useEffect(() => {
    const checkNP = async () => {
      try {
        const granted = await isPermissionGranted();
        setNotificationPermission(granted);
      } catch {
        setNotificationPermission(false);
      }
    };
    checkNP();
  }, []);

  const requestNotificationPermissionHandler = async () => {
    try {
      const permission = await requestPermission();
      const granted = permission === "granted";
      setNotificationPermission(granted);
      if (granted) {
        toast.success("通知権限が許可されました");
      } else {
        toast.error("通知権限が拒否されました。システム設定で手動で許可してください。");
      }
    } catch {
      toast.error("通知権限の要求に失敗しました");
    }
  };

  // デバウンス保存
  const saveDirChanged = debounce(async (temp_saveDir: string) => {
    await invoke("set_save_dir", { newSaveDir: temp_saveDir });
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
    const selectedDir = await open({ directory: true, multiple: false });
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
      if (data === "失敗") {
        toast.error("サーバーの起動に失敗しました。ポート番号が他のプログラムで使用されています。");
        saveServerEnabledChanged(false);
        setIsServerEnabled(false);
      } else {
        saveServerEnabledChanged(true);
      }
    });
    return () => { unlistenStartServerOutput.then((fn) => fn()); }
  }, [])

  return (
    <div className="settings-container" style={{ display: 'flex', justifyContent: 'center' }}>
      <div style={{ width: 'min(960px, 100%)', padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <ThemeSelector />

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <label className="block text-xs text-[var(--text-secondary)] mb-1">保存先</label>
            <Input value={saveDir}
              onChange={(e) => {
                setSaveDir(e.target.value);
                saveDirChanged(e.target.value);
              }} />
          </div>
          <CustomButton aria-label="フォルダを開く" onClick={openDirectoryDialog} variant="secondary">
            <HomeIcon />
          </CustomButton>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <label className="block text-xs text-[var(--text-secondary)] mb-1">Cookie取得用のブラウザ</label>
            <Input value={browser} onChange={(e) => {
              setBrowser(e.target.value);
              saveBrowserChanged(e.target.value);
            }} />
          </div>
          <div style={{ flex: 1 }}>
            <label className="block text-xs text-[var(--text-secondary)] mb-1">使用するポート番号</label>
            <Input value={serverPort}
              disabled={isServerEnabled}
              onChange={(e) => {
                try { parseInt(e.target.value) } catch { return }
                if (isNaN(parseInt(e.target.value))) return
                if (parseInt(e.target.value) > 65535) return
                setServerPort(parseInt(e.target.value))
                saveServerPortChanged(parseInt(e.target.value))
              }} />
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label className="flex items-center gap-3 p-3 rounded-xl border border-[var(--border-primary)] bg-[var(--surface-primary)]">
            <Switch checked={isSendNotification} onChange={(v) => {
              setIsSendNotification(v)
              saveNotificationChanged(v)
            }} />
            <div>
              <div>ダウンロード完了時に通知を受け取る</div>
              {osType === 'macos' && (
                <div className="text-xs italic text-[var(--text-secondary)]">macOSでは「通知パネル」設定でバナー通知が表示されます</div>
              )}
            </div>
          </label>

          {isSendNotification && notificationPermission === false && (
            <div className="p-3 rounded-lg border border-yellow-300 bg-yellow-50 text-yellow-800 flex items-center gap-2">
              <span>通知権限が許可されていません。</span>
              <CustomButton size="sm" onClick={requestNotificationPermissionHandler} variant="secondary">権限を要求</CustomButton>
            </div>
          )}

          <label className="flex items-center gap-3 p-3 rounded-xl border border-[var(--border-primary)] bg-[var(--surface-primary)]">
            <Switch checked={isServerEnabled} onChange={(v) => setIsServerEnabled(v)} />
            <div>{`ポート${serverPort}でサーバーを起動する`}</div>
          </label>
        </div>

        <div className="version-info" style={{ marginTop: 16, textAlign: 'center' }}>
          <div className="version-text text-[var(--text-secondary)]">
            <a href="https://github.com/AkaakuHub/yt-dlp-GUI-2" target="_blank" rel="noopener" className="github-link underline">GitHub</a>
            <span> ・ バージョン {currentVersion || ''}</span>
            {isUpdateAvailable ? (
              <span> ・ <a href="#" onClick={(e) => { e.preventDefault(); executeUpdate(); }} className="update-link underline">ここをクリックしてアップデート</a></span>
            ) : (
              <span> ・ 最新です</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

