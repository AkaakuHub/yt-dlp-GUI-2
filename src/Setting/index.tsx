import { useEffect, useState } from 'react';
import { useNavigate } from "react-router-dom";
import {
  Toolbar,
  IconButton,
  Typography,
  Container,
  Paper,
  TextField,
  Box,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import FolderOpenIcon from '@mui/icons-material/FolderOpen'; // フォルダーアイコン
import { invoke } from '@tauri-apps/api';
import { open } from '@tauri-apps/api/dialog'; // ダイアログを開くためのimport
import { debounce } from 'lodash';

import CustomAppBar from "../_components/CustomAppBar";

export default function Settings() {
  const navigate = useNavigate();

  const [saveDir, setSaveDir] = useState("");
  const [browser, setBrowser] = useState("");

  interface Config {
    save_dir: string;
    browser: string;
  }

  useEffect(() => {
    invoke<Config>("get_settings").then((config) => {
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

  const goToHomeHandler = () => {
    navigate("/");
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

  return (
    <Box sx={{ flexGrow: 1 }}>
      <CustomAppBar position="static">
        <Toolbar>
          <IconButton
            size="small"
            edge="start"
            color="inherit"
            aria-label="back"
            onClick={goToHomeHandler}
            sx={{ mr: 2 }}
          >
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            設定
          </Typography>
        </Toolbar>
      </CustomAppBar>
      <Container maxWidth="sm" sx={{ mt: 4 }}>
        <Paper elevation={3} sx={{ p: 4 }}>
          <Box component="form" sx={{ '& > :not(style)': { m: 1 } }}>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
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
              label="ブラウザ"
              variant="outlined"
              value={browser}
              onChange={(e) => {
                setBrowser(e.target.value);
                saveBrowserChanged(e.target.value);
              }}
            />
          </Box>
        </Paper>
      </Container>
    </Box>
  );
}
