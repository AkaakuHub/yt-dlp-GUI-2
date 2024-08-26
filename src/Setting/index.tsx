import { useState } from 'react';
import { useNavigate } from "react-router-dom";
import {
  AppBar,
  Toolbar,
  IconButton,
  Typography,
  Container,
  Paper,
  TextField,
  Button,
  Box,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import SaveIcon from "@mui/icons-material/Save";

import CustomAppBar from "../_components/CustomAppBar";

export default function Settings() {
  const navigate = useNavigate();
  const [savePath, setSavePath] = useState('');
  const [browser, setBrowser] = useState('');

  const goToHomeHandler = () => {
    navigate("/");
  };

  const handleSave = () => {
    // モック関数: 実際の保存ロジックをここに実装
    console.log('設定を保存:', { savePath, browser });
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
            <TextField
              fullWidth
              label="保存先"
              variant="outlined"
              value={savePath}
              onChange={(e) => setSavePath(e.target.value)}
            />
            <TextField
              fullWidth
              label="ブラウザ"
              variant="outlined"
              value={browser}
              onChange={(e) => setBrowser(e.target.value)}
            />
            <Button
              variant="contained"
              startIcon={<SaveIcon />}
              onClick={handleSave}
              sx={{ mt: 2 }}
            >
              保存
            </Button>
          </Box>
        </Paper>
      </Container>
    </Box>
  );
}