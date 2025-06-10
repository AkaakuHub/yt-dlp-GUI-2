import React, { useEffect, useState } from "react";
import { resolve, dirname } from "@tauri-apps/api/path";
import { startDrag } from "@crabnebula/tauri-plugin-drag";
import { invoke } from "@tauri-apps/api/tauri";
import {
  Folder as FolderIcon, 
  InsertDriveFile as FileIcon, 
  Refresh as RefreshIcon,
  ArrowUpward as UpIcon, 
  ArrowBack as BackIcon, 
  ArrowForward as ForwardIcon,
  Home as HomeIcon
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

interface ItemProps {
  handleClick: (fileName: string) => void;
  file: FileInfo;
  fullPath: string;
}

const Item: React.FC<ItemProps> = ({ handleClick, file, fullPath }) => {
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

  const formatDateTime = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    const options: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    };
    return new Intl.DateTimeFormat('ja-JP', options).format(date);
  };

  const handleItemClick = () => {
    if (file.is_dir) {
      handleClick(file.name);
    } else {
      invoke("open_file", { path: fullPath });
    }
  };

  const handleDragStart = () => {
    if (!file.is_dir) {
      startDrag({ item: [fullPath], icon: "📄" });
    }
  };

  return (
    <div
      className={`explorer-item ${file.is_dir ? 'directory' : 'file'}`}
      onClick={handleItemClick}
      draggable={!file.is_dir}
      onDragStart={handleDragStart}
    >
      <div className="explorer-item-icon">
        {file.is_dir ? <FolderIcon fontSize="small" /> : <FileIcon fontSize="small" />}
      </div>
      <div className="explorer-item-name">
        {file.name}
      </div>
      <div className="explorer-item-size">
        {file.is_dir ? "" : calculateFileSize(file.file_size)}
      </div>
      <div className="explorer-item-date">
        {formatDateTime(file.last_modified)}
      </div>
    </div>
  );
};

const CustomExplorer: React.FC = () => {
  const { saveDir } = useAppContext();
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [currentPath, setCurrentPath] = useState<string>(saveDir);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  useEffect(() => {
    if (saveDir && saveDir !== "") {
      navigateTo(saveDir);
    }
  }, [saveDir]);

  const fetchFiles = async () => {
    if (!currentPath) return;
    try {
      const contents: FileInfo[] = await invoke("get_sorted_directory_contents", { path: currentPath });
      setFiles(contents);
    } catch (error) {
      console.error("Error fetching directory contents:", error);
    }
  };

  useEffect(() => {
    const handleRefreshFiles = () => {
      setTimeout(() => {
        fetchFiles();
      }, 100);
    };

    eventEmitter.on("refreshFiles", handleRefreshFiles);

    return () => {
      eventEmitter.off("refreshFiles", handleRefreshFiles);
    };
  }, []);

  useEffect(() => {
    fetchFiles();
  }, [currentPath]);

  const navigateTo = (newPath: string) => {
    if (currentPath !== newPath) {
      setHistory(prev => {
        const updatedHistory = [...prev.slice(0, historyIndex + 1), newPath];
        return updatedHistory;
      });
      setHistoryIndex(prev => prev + 1);
      setCurrentPath(newPath);
    }
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

  const goHome = () => {
    if (saveDir) {
      navigateTo(saveDir);
    }
  };

  const handlePathChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCurrentPath(e.target.value);
  };

  const handlePathSubmit = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      navigateTo(currentPath);
    }
  };

  return (
    <div className="explorer-wrapper">
      <div className="explorer-toolbar">
        <div className="explorer-navigation">
          <button 
            className="explorer-button" 
            onClick={goBack} 
            disabled={historyIndex <= 0}
            title="戻る"
          >
            <BackIcon fontSize="small" />
          </button>
          <button 
            className="explorer-button" 
            onClick={goForward} 
            disabled={historyIndex >= history.length - 1}
            title="進む"
          >
            <ForwardIcon fontSize="small" />
          </button>
          <button 
            className="explorer-button" 
            onClick={goUp}
            title="上の階層"
          >
            <UpIcon fontSize="small" />
          </button>
          <button 
            className="explorer-button" 
            onClick={goHome}
            title="ホーム"
          >
            <HomeIcon fontSize="small" />
          </button>
        </div>
        <div className="explorer-path-container">
          <input
            className="explorer-path-input"
            value={currentPath}
            onChange={handlePathChange}
            onKeyPress={handlePathSubmit}
            placeholder="パスを入力..."
          />
        </div>
        <button 
          className="explorer-button" 
          onClick={fetchFiles}
          title="更新"
        >
          <RefreshIcon fontSize="small" />
        </button>
      </div>
      <div className="explorer-header">
        <div className="explorer-header-name">名前</div>
        <div className="explorer-header-size">サイズ</div>
        <div className="explorer-header-date">更新日時</div>
      </div>
      <div className="explorer-list">
        {files.map((file: FileInfo, index: number) => (
          <Item
            key={`${file.name}-${index}`}
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