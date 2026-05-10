import { startDrag } from "@crabnebula/tauri-plugin-drag";
import { invoke } from "@tauri-apps/api/core";
import { dirname, resolve } from "@tauri-apps/api/path";
import {
	ArrowLeft,
	ArrowRight,
	ArrowUp,
	File,
	Folder,
	Home,
	RefreshCw,
} from "lucide-react";
import {
	type ChangeEvent,
	type KeyboardEvent,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { useAppContext } from "../AppContext";
import { eventEmitter } from "../EventEmitter";

interface FileInfo {
	name: string;
	is_dir: boolean;
	last_modified: number;
	file_size: number;
}

interface FileRowProps {
	file: FileInfo;
	fullPath: string;
	onOpenDirectory: (fileName: string) => void;
}

const formatFileSize = (size: number): string => {
	if (size < 1024) {
		return `${size} B`;
	}
	if (size < 1024 * 1024) {
		return `${(size / 1024).toFixed(1)} KB`;
	}
	if (size < 1024 * 1024 * 1024) {
		return `${(size / 1024 / 1024).toFixed(1)} MB`;
	}
	return `${(size / 1024 / 1024 / 1024).toFixed(1)} GB`;
};

const formatDateTime = (timestamp: number): string => {
	return new Intl.DateTimeFormat("ja-JP", {
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
	}).format(new Date(timestamp * 1000));
};

function FileRow({ file, fullPath, onOpenDirectory }: FileRowProps) {
	const openItem = () => {
		if (file.is_dir) {
			onOpenDirectory(file.name);
			return;
		}
		void invoke("open_file", { path: fullPath });
	};

	const startFileDrag = () => {
		if (!file.is_dir) {
			void startDrag({ item: [fullPath], icon: "📄" });
		}
	};

	return (
		<button
			className="grid h-11 w-full grid-cols-[22px_minmax(0,1fr)_72px_116px] items-center gap-2 border-b border-base-300 px-3 text-left text-sm hover:bg-base-300/55"
			type="button"
			draggable={!file.is_dir}
			onClick={openItem}
			onDragStart={startFileDrag}
		>
			<span className={file.is_dir ? "text-warning" : "text-info"}>
				{file.is_dir ? <Folder size={17} /> : <File size={17} />}
			</span>
			<span className="truncate font-medium">{file.name}</span>
			<span className="text-right text-xs text-base-content/55">
				{file.is_dir ? "" : formatFileSize(file.file_size)}
			</span>
			<span className="truncate text-right font-mono text-xs text-base-content/55">
				{formatDateTime(file.last_modified)}
			</span>
		</button>
	);
}

export default function CustomExplorer() {
	const { saveDir } = useAppContext();
	const [files, setFiles] = useState<FileInfo[]>([]);
	const [currentPath, setCurrentPath] = useState(saveDir);
	const [history, setHistory] = useState<string[]>([]);
	const [historyIndex, setHistoryIndex] = useState(-1);
	const [isLoading, setIsLoading] = useState(false);
	const [errorText, setErrorText] = useState("");

	const currentPathRef = useRef(currentPath);
	const historyIndexRef = useRef(historyIndex);

	const navigateTo = useCallback((nextPath: string) => {
		if (currentPathRef.current === nextPath) {
			return;
		}
		setHistory((prev) => [
			...prev.slice(0, historyIndexRef.current + 1),
			nextPath,
		]);
		setHistoryIndex((prev) => {
			const nextIndex = prev + 1;
			historyIndexRef.current = nextIndex;
			return nextIndex;
		});
		currentPathRef.current = nextPath;
		setCurrentPath(nextPath);
	}, []);

	useEffect(() => {
		if (saveDir !== "") {
			navigateTo(saveDir);
		}
	}, [navigateTo, saveDir]);

	const fetchFiles = useCallback(async () => {
		if (currentPath === "") {
			return;
		}
		setIsLoading(true);
		setErrorText("");
		try {
			const contents = await invoke<FileInfo[]>(
				"get_sorted_directory_contents",
				{
					path: currentPath,
				},
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
		void fetchFiles();
	}, [fetchFiles]);

	useEffect(() => {
		const refreshFiles = () => {
			void fetchFiles();
		};
		eventEmitter.on("refreshFiles", refreshFiles);
		return () => {
			eventEmitter.off("refreshFiles", refreshFiles);
		};
	}, [fetchFiles]);

	const openDirectory = async (name: string) => {
		navigateTo(await resolve(currentPath, name));
	};

	const goBack = () => {
		if (historyIndex <= 0) {
			return;
		}
		const nextIndex = historyIndex - 1;
		const nextPath = history[nextIndex];
		historyIndexRef.current = nextIndex;
		currentPathRef.current = nextPath;
		setHistoryIndex(nextIndex);
		setCurrentPath(nextPath);
	};

	const goForward = () => {
		if (historyIndex >= history.length - 1) {
			return;
		}
		const nextIndex = historyIndex + 1;
		const nextPath = history[nextIndex];
		historyIndexRef.current = nextIndex;
		currentPathRef.current = nextPath;
		setHistoryIndex(nextIndex);
		setCurrentPath(nextPath);
	};

	const goUp = async () => {
		navigateTo(await dirname(currentPath));
	};

	const goHome = () => {
		if (saveDir !== "") {
			navigateTo(saveDir);
		}
	};

	const changePath = (event: ChangeEvent<HTMLInputElement>) => {
		const nextPath = event.target.value;
		currentPathRef.current = nextPath;
		setCurrentPath(nextPath);
	};

	const submitPath = (event: KeyboardEvent<HTMLInputElement>) => {
		if (event.key === "Enter") {
			navigateTo(currentPath);
		}
	};

	return (
		<div className="flex h-full min-h-0 flex-col overflow-hidden bg-base-200">
			<div className="grid h-12 shrink-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 border-b border-base-300 bg-base-100 px-2">
				<div className="flex items-center gap-1">
					<button
						className="btn btn-ghost btn-sm h-8 min-h-8 w-8 rounded-md p-0"
						type="button"
						disabled={historyIndex <= 0}
						onClick={goBack}
						aria-label="戻る"
					>
						<ArrowLeft size={17} />
					</button>
					<button
						className="btn btn-ghost btn-sm h-8 min-h-8 w-8 rounded-md p-0"
						type="button"
						disabled={historyIndex >= history.length - 1}
						onClick={goForward}
						aria-label="進む"
					>
						<ArrowRight size={17} />
					</button>
					<button
						className="btn btn-ghost btn-sm h-8 min-h-8 w-8 rounded-md p-0"
						type="button"
						onClick={() => void goUp()}
						aria-label="上の階層"
					>
						<ArrowUp size={17} />
					</button>
					<button
						className="btn btn-ghost btn-sm h-8 min-h-8 w-8 rounded-md p-0"
						type="button"
						onClick={goHome}
						aria-label="保存先"
					>
						<Home size={17} />
					</button>
				</div>
				<input
					className="input input-bordered h-9 min-h-9 w-full rounded-md bg-base-200 font-mono text-sm"
					value={currentPath}
					onChange={changePath}
					onKeyDown={submitPath}
					placeholder="保存先"
				/>
				<button
					className="btn btn-ghost btn-sm h-8 min-h-8 w-8 rounded-md p-0"
					type="button"
					onClick={() => void fetchFiles()}
					aria-label="更新"
				>
					<RefreshCw size={17} />
				</button>
			</div>
			<div className="grid h-9 shrink-0 grid-cols-[22px_minmax(0,1fr)_72px_116px] items-center gap-2 border-b border-base-300 bg-base-300/55 px-3 text-xs font-semibold text-base-content/55">
				<span />
				<span>名前</span>
				<span className="text-right">サイズ</span>
				<span className="text-right">更新日時</span>
			</div>
			<div className="min-h-0 flex-1 overflow-auto">
				{isLoading ? (
					<div className="flex h-full items-center justify-center text-sm text-base-content/45">
						読み込み中
					</div>
				) : null}
				{!isLoading && errorText !== "" ? (
					<div className="flex h-full items-center justify-center text-sm text-error">
						{errorText}
					</div>
				) : null}
				{!isLoading && errorText === "" && files.length === 0 ? (
					<div className="flex h-full items-center justify-center text-sm text-base-content/45">
						ファイルなし
					</div>
				) : null}
				{!isLoading && errorText === ""
					? files.map((file) => (
							<FileRow
								key={`${currentPath}/${file.name}`}
								file={file}
								fullPath={`${currentPath}/${file.name}`}
								onOpenDirectory={(name) => void openDirectory(name)}
							/>
						))
					: null}
			</div>
		</div>
	);
}
