import { startDrag } from "@crabnebula/tauri-plugin-drag";
import { dirname, resolve } from "@tauri-apps/api/path";
import { invoke } from "@tauri-apps/api/tauri";
import {
	ArrowLeft,
	ArrowRight,
	ArrowUp,
	File,
	Folder,
	Home,
	RefreshCw,
} from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAppContext } from "../AppContext";
import { eventEmitter } from "../EventEmitter";

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
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
			hour12: false,
		};
		return new Intl.DateTimeFormat("ja-JP", options).format(date);
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
			className="grid cursor-pointer grid-cols-[24px_minmax(0,1fr)_90px_170px] items-center gap-3 border-b border-base-300 px-4 py-3 text-sm text-base-content hover:bg-base-300/60"
			onClick={handleItemClick}
			draggable={!file.is_dir}
			onDragStart={handleDragStart}
		>
			<div className={file.is_dir ? "text-warning" : "text-info"}>
				{file.is_dir ? <Folder size={18} /> : <File size={18} />}
			</div>
			<div className="truncate font-medium">{file.name}</div>
			<div className="text-right text-xs text-base-content/55">
				{file.is_dir ? "" : calculateFileSize(file.file_size)}
			</div>
			<div className="text-right font-mono text-xs text-base-content/55">
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
	const [isLoading, setIsLoading] = useState(false);
	const [errorText, setErrorText] = useState("");

	const currentPathRef = useRef(currentPath);
	const historyIndexRef = useRef(historyIndex);

	const navigateTo = useCallback((newPath: string) => {
		if (currentPathRef.current !== newPath) {
			setHistory((prev) => {
				const updatedHistory = [
					...prev.slice(0, historyIndexRef.current + 1),
					newPath,
				];
				return updatedHistory;
			});
			setHistoryIndex((prev) => {
				const nextIndex = prev + 1;
				historyIndexRef.current = nextIndex;
				return nextIndex;
			});
			currentPathRef.current = newPath;
			setCurrentPath(newPath);
		}
	}, []);

	useEffect(() => {
		if (saveDir && saveDir !== "") {
			navigateTo(saveDir);
		}
	}, [navigateTo, saveDir]);

	const fetchFiles = useCallback(async () => {
		if (!currentPath) {
			return;
		}
		setIsLoading(true);
		setErrorText("");
		try {
			const contents: FileInfo[] = await invoke(
				"get_sorted_directory_contents",
				{ path: currentPath },
			);
			setFiles(contents);
		} catch {
			setFiles([]);
			setErrorText("読み込み失敗");
		} finally {
			setIsLoading(false);
		}
	}, [currentPath]);

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
	}, [fetchFiles]);

	useEffect(() => {
		fetchFiles();
	}, [fetchFiles]);

	const handleClick = async (name: string) => {
		const newPath = await resolve(currentPath, name);
		navigateTo(newPath);
	};

	const goBack = () => {
		if (historyIndex > 0) {
			setHistoryIndex((prev) => {
				const nextIndex = prev - 1;
				historyIndexRef.current = nextIndex;
				return nextIndex;
			});
			const nextPath = history[historyIndex - 1];
			currentPathRef.current = nextPath;
			setCurrentPath(nextPath);
		}
	};

	const goForward = () => {
		if (historyIndex < history.length - 1) {
			setHistoryIndex((prev) => {
				const nextIndex = prev + 1;
				historyIndexRef.current = nextIndex;
				return nextIndex;
			});
			const nextPath = history[historyIndex + 1];
			currentPathRef.current = nextPath;
			setCurrentPath(nextPath);
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
		const nextPath = e.target.value;
		currentPathRef.current = nextPath;
		setCurrentPath(nextPath);
	};

	const handlePathSubmit = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === "Enter") {
			navigateTo(currentPath);
		}
	};

	return (
		<div className="flex h-full min-h-0 flex-col overflow-hidden bg-base-200">
			<div className="flex min-h-14 items-center gap-2 border-b border-base-300 bg-base-100 px-3">
				<div className="flex items-center gap-1">
					<button
						className="btn btn-ghost btn-sm h-9 min-h-9 w-9 rounded-md p-0 text-base-content/70 disabled:text-base-content/25"
						onClick={goBack}
						disabled={historyIndex <= 0}
						title="戻る"
					>
						<ArrowLeft size={18} />
					</button>
					<button
						className="btn btn-ghost btn-sm h-9 min-h-9 w-9 rounded-md p-0 text-base-content/70 disabled:text-base-content/25"
						onClick={goForward}
						disabled={historyIndex >= history.length - 1}
						title="進む"
					>
						<ArrowRight size={18} />
					</button>
					<button
						className="btn btn-ghost btn-sm h-9 min-h-9 w-9 rounded-md p-0 text-base-content/70"
						onClick={goUp}
						title="上の階層"
					>
						<ArrowUp size={18} />
					</button>
					<button
						className="btn btn-ghost btn-sm h-9 min-h-9 w-9 rounded-md p-0 text-base-content/70"
						onClick={goHome}
						title="ホーム"
					>
						<Home size={18} />
					</button>
				</div>
				<div className="min-w-0 flex-1">
					<input
						className="input input-bordered h-10 w-full rounded-md bg-base-200 font-mono text-sm focus:outline-primary"
						value={currentPath}
						onChange={handlePathChange}
						onKeyPress={handlePathSubmit}
						placeholder="パスを入力..."
					/>
				</div>
				<button
					className="btn btn-ghost btn-sm h-9 min-h-9 w-9 rounded-md p-0 text-base-content/70"
					onClick={fetchFiles}
					title="更新"
				>
					<RefreshCw size={18} />
				</button>
			</div>
			<div className="grid grid-cols-[24px_minmax(0,1fr)_90px_170px] gap-3 border-b border-base-300 bg-base-300/55 px-4 py-2 text-xs font-semibold text-base-content/55">
				<div />
				<div>名前</div>
				<div className="text-right">サイズ</div>
				<div className="text-right">更新日時</div>
			</div>
			<div className="min-h-0 flex-1 overflow-y-auto">
				{isLoading && (
					<div className="flex h-full items-center justify-center text-sm text-base-content/45">
						読み込み中
					</div>
				)}
				{!isLoading && errorText !== "" && (
					<div className="flex h-full items-center justify-center text-sm text-error">
						{errorText}
					</div>
				)}
				{!isLoading && errorText === "" && files.length === 0 && (
					<div className="flex h-full items-center justify-center text-sm text-base-content/45">
						ファイルなし
					</div>
				)}
				{!isLoading &&
					errorText === "" &&
					files.map((file: FileInfo, index: number) => (
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
