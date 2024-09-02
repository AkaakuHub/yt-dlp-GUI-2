import { useEffect, useState } from "react";
import {
  IconButton,
  Container,
  Paper,
  TextField,
  Box,
  Typography,
  Link,
} from "@mui/material";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import { invoke } from "@tauri-apps/api";
import { open } from "@tauri-apps/api/dialog";
import { debounce } from "lodash";

import { toast } from "react-toastify";

import { ConfigProps } from "../types";

export default function Settings() {
  const [saveDir, setSaveDir] = useState("");
  const [browser, setBrowser] = useState("");

  const [currentVersion, setCurrentVersion] = useState("");

  useEffect(() => {
    const checkVersionAndUpdate = async () => {
      try {
        const message = await invoke<string>("check_version_and_update");
        if (message !== "最新です") {
          toast.info(message);
          const currentVersion = message.split("\n")[1].split(":")[1].trim();
          setCurrentVersion(currentVersion);
        }
      } catch (error) {
        console.error(`check_version_and_update: ${error}`);
      }
    };
    checkVersionAndUpdate();
  }, []);

  useEffect(() => {
    invoke<ConfigProps>("get_settings").then((config) => {
      setSaveDir(config.save_dir);
      setBrowser(config.browser);
    });
  }, []);

  // デバウンスで遅延
  const saveDirChanged = debounce(async (temp_saveDir: string) => {
    await invoke("set_save_dir", { newSaveDir: temp_saveDir }); // ここのkeyをrust側と合わせる
  }, 500);

  const saveBrowserChanged = debounce(async (temp_browser: string) => {
    await invoke("set_browser", { newBrowser: temp_browser });
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

  return (
    <Box sx={{ flexGrow: 1 }}>
      <Container maxWidth="sm" sx={{ mt: 4 }}>
        <Paper elevation={3} sx={{ p: 4 }}>
          <Box component="form" sx={{ "& > :not(style)": { m: 1 } }}>
            <Box sx={{ display: "flex", alignItems: "center" }}>
              <TextField
                fullWidth
                label="保存先"
                variant="outlined"
                value={saveDir}
                onChange={(e) => {
                  setSaveDir(e.target.value);
                  saveDirChanged(e.target.value);
                }}
              />
              <IconButton
                color="primary"
                aria-label="フォルダを開く"
                onClick={openDirectoryDialog}
                sx={{ ml: 1 }}
              >
                <FolderOpenIcon />
              </IconButton>
            </Box>
            <TextField
              fullWidth
              label="Cookie取得元のブラウザ"
              variant="outlined"
              value={browser}
              onChange={(e) => {
                setBrowser(e.target.value);
                saveBrowserChanged(e.target.value);
              }}
            />
          </Box>
        </Paper>

        <Box sx={{ mt: 4, textAlign: "center" }}>
          <Typography variant="body2" color="textSecondary">
            <Link href="https://github.com/AkaakuHub/yt-dlp-GUI-2/releases" target="_blank" rel="noopener">
              GitHub
            </Link>
            ・ バージョン {currentVersion || ""}
          </Typography>
        </Box>
      </Container>
    </Box>
  );
}
