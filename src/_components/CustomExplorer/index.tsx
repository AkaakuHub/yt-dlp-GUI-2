import React, { useEffect, useState } from "react";
import { resolve, dirname } from "@tauri-apps/api/path";
import { startDrag } from "@crabnebula/tauri-plugin-drag";
import { invoke } from "@tauri-apps/api/tauri";
import {
  IconButton, InputBase, ListItem, ListItemIcon, ListItemText,
  Paper, Toolbar, styled
} from "@mui/material";
import {
  Folder as FolderIcon, InsertDriveFile as FileIcon, Refresh as RefreshIcon,
  ArrowUpward as UpIcon, ArrowBack as BackIcon, ArrowForward as ForwardIcon
} from "@mui/icons-material";
import { useAppContext } from "../AppContext";
import { eventEmitter } from "../EventEmitter";

import "./index.css";

interface FileInfo {
  name: string;
  is_dir: boolean;
  last_modified: number;
  file_size: number;
}

const PathInput = styled(InputBase)(({ theme }) => ({
  marginLeft: theme.spacing(1),
  flex: 1,
  fontSize: "0.75rem",
}));

const StyledListItem = styled(ListItem)(({ theme }) => ({
  padding: theme.spacing(0.25, 0.5),
  "&:hover": {
    backgroundColor: theme.palette.action.hover,
  },
}));

const Item: React.FC<{
  handleClick: (fileName: string) => void;
  file: FileInfo;
  fullPath: string;
}> = ({ handleClick, file, fullPath }) => {

  const calculateFileSize = (size: number): string => {
    if (size < 1024) {
      return `${size} B`;
    } else if (size < 1024 * 1024) {
      return `${(size / 1024).toFixed(1)} KB`;
    } else if (size < 1024 * 1024 * 1024) {
      return `${(size / 1024 / 1024).toFixed(1)} MB`;
    } else {
      return `${(size / 1024 / 1024 / 1024).toFixed(1)} GB`;
    }
  };

  return (
    <StyledListItem
      onClick={() => {
        if (file.is_dir) {
          handleClick(file.name);
        } else {
          invoke("open_file", { path: fullPath });
        }
      }}
      draggable={!file.is_dir}
      onDragStart={() => {
        if (!file.is_dir) {
          startDrag({ item: [fullPath], icon: "📄" });
        }
      }}
      style={{
        cursor: file.is_dir ? "pointer" : "grab",
      }}
    >
      <ListItemIcon style={{ minWidth: 24 }}>
        {file.is_dir ? <FolderIcon fontSize="small" /> : <FileIcon fontSize="small" />}
      </ListItemIcon>
      <ListItemText
        primary={file.name}
        primaryTypographyProps={{ variant: "body2", noWrap: true }}
        style={{ flex: "1 1 auto", marginRight: 8 }}
      />
      <ListItemText
        primary={file.is_dir ? "" : calculateFileSize(file.file_size)}
        primaryTypographyProps={{ variant: "caption", noWrap: true }}
        style={{ flex: "0 0 auto", textAlign: "right", marginRight: 8 }}
      />
      <ListItemText
        primary={new Date(file.last_modified * 1000).toLocaleString()}
        primaryTypographyProps={{ variant: "caption", noWrap: true }}
        style={{ flex: "0 0 auto", textAlign: "right" }}
      />
    </StyledListItem>
  );
}

const CustomExplorer: React.FC = () => {
  const { saveDir } = useAppContext();
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [currentPath, setCurrentPath] = useState<string>("");
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  useEffect(() => {
    if (saveDir && saveDir !== "") {
      navigateTo(saveDir);
    }
  }, [saveDir]);

  const fetchFiles = async () => {
    console.log("Fetching directory contents...");
    if (!currentPath) return;
    try {
      const contents: FileInfo[] = await invoke("get_sorted_directory_contents", { path: currentPath });
      setFiles(contents);
    } catch (error) {
      console.error("Error fetching directory contents:", error);
    }
  };

  useEffect(() => {
    eventEmitter.on("refreshFiles", fetchFiles);

    return () => {
      eventEmitter.off("refreshFiles", fetchFiles);
    };
  }, []);

  useEffect(() => {
    fetchFiles();
  }, [currentPath]);

  const navigateTo = (newPath: string) => {
    setCurrentPath(newPath);
    setHistory(prev => [...prev.slice(0, historyIndex + 1), newPath]);
    setHistoryIndex(prev => prev + 1);
  };

  const handleClick = async (name: string) => {
    const newPath = await resolve(currentPath, name);
    navigateTo(newPath);
  };

  const goBack = () => {
    if (historyIndex > 0) {
      setHistoryIndex(prev => prev - 1);
      setCurrentPath(history[historyIndex - 1]);
    }
  };

  const goForward = () => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(prev => prev + 1);
      setCurrentPath(history[historyIndex + 1]);
    }
  };

  const goUp = async () => {
    const parentDir = await dirname(currentPath);
    navigateTo(parentDir);
  };

  return (
    <div className="explorer-wrapper">
      <Paper elevation={1} sx={{ mb: 0.5 }}>
        <Toolbar variant="dense" sx={{ minHeight: 40, px: 0.5 }}>
          <IconButton size="small" onClick={goBack} disabled={historyIndex <= 0}>
            <BackIcon fontSize="small" />
          </IconButton>
          <IconButton size="small" onClick={goForward} disabled={historyIndex >= history.length - 1}>
            <ForwardIcon fontSize="small" />
          </IconButton>
          <IconButton size="small" onClick={goUp}>
            <UpIcon fontSize="small" />
          </IconButton>
          <PathInput
            value={currentPath}
            onChange={(e) => setCurrentPath(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === "Enter") {
                navigateTo(currentPath);
              }
            }}
            placeholder="パスを入力..."
          />
          <IconButton size="small" onClick={fetchFiles}>
            <RefreshIcon fontSize="small" />
          </IconButton>
        </Toolbar>
      </Paper>
      <div className="explorer-list">
        {files.map((file: FileInfo, index: number) => (
          <Item
            key={index}
            handleClick={handleClick}
            file={file}
            fullPath={`${currentPath}/${file.name}`}
          />
        ))}
      </div>
    </div>
  );
};

export default CustomExplorer;