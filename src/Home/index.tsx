import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/tauri";
import { useCallback, useEffect, useRef, useState } from "react";
import "./index.css";

import { Input, Switch, TextField } from "@mui/material";
import { styled } from "@mui/material/styles";

import { toast } from "react-toastify";
import { useAppContext } from "../_components/AppContext";
import BottomTab from "../_components/BottomTab";
import CustomButton from "../_components/CustomButton";

import DropDownWithArrows from "../_components/DropDownWithArrows";
import ExecuteButton from "../_components/ExecuteButton";

const StyledInput = styled(Input)(() => ({
	backgroundColor: "var(--input-background)",
	color: "var(--text-primary)",
	borderRadius: "8px",
	border: "1px solid var(--border-primary)",
	transition: "all 0.2s ease-in-out",
	paddingLeft: "8px",
	paddingRight: "8px",
	"&::before": {
		display: "none",
	},
	"&::after": {
		display: "none",
	},
	"&:hover": {
		backgroundColor: "var(--input-background-hover)",
		borderColor: "var(--accent-primary)",
	},
	"&.Mui-focused": {
		backgroundColor: "var(--input-background-focus)",
		borderColor: "var(--accent-primary)",
	},
	"& input": {
		Padding: 4,
	},
}));

const StyledTextField = styled(TextField)(() => ({
	"& .MuiInputBase-root": {
		borderRadius: "8px",
		backgroundColor: "var(--input-background)",
		color: "var(--text-primary)",
		transition: "all 0.2s ease-in-out",
	},
	"& .MuiOutlinedInput-root": {
		"&:hover": {
			backgroundColor: "var(--input-background-hover)",
			"& .MuiOutlinedInput-notchedOutline": {
				borderColor: "var(--accent-primary)",
			},
		},
		"&.Mui-focused": {
			backgroundColor: "var(--input-background-focus)",
			"& .MuiOutlinedInput-notchedOutline": {
				borderColor: "var(--accent-primary)",
				borderWidth: "2px",
			},
		},
		"& .MuiOutlinedInput-notchedOutline": {
			borderColor: "var(--border-primary)",
			transition: "all 0.2s ease-in-out",
		},
	},
	"& .MuiInputLabel-root": {
		color: "var(--text-secondary)",
		"&.Mui-focused": {
			color: "var(--accent-primary)",
		},
	},
	"& .MuiInputBase-input::placeholder": {
		color: "var(--text-placeholder)",
		opacity: 1,
	},
	"& .MuiInputBase-input": {
		color: "var(--text-primary)",
	},
}));

const StyledSwitch = styled(Switch)(() => ({
	"& .MuiSwitch-switchBase": {
		color: "var(--border-primary)",
		"&.Mui-checked": {
			color: "var(--accent-primary)",
			"& + .MuiSwitch-track": {
				backgroundColor: "var(--accent-primary)",
				opacity: 0.7,
			},
		},
	},
	"& .MuiSwitch-track": {
		backgroundColor: "var(--border-primary)",
		opacity: 0.5,
	},
}));

interface Param {
	codec_id?: string;
	subtitle_lang?: string;
	output_name?: string;
	start_time?: string;
	end_time?: string;
	is_cookie: boolean;
}

interface QueueState {
	active: boolean;
	index: number;
	items: string[];
}

export default function Home() {
	const { setLatestConsoleText } = useAppContext();
	const { saveDir } = useAppContext();
	const [pid, setPid] = useState<number | null>(null);

	const [consoleText, setConsoleText] = useState<string>("");
	const [arbitraryCode, setArbitraryCode] = useState<string>("");
	const [urlQueueText, setUrlQueueText] = useState<string>("");

	const [queueProgress, setQueueProgress] = useState<{
		current: number;
		total: number;
	}>({ current: 0, total: 0 });
	const queueStateRef = useRef<QueueState>({
		active: false,
		index: -1,
		items: [],
	});

	const { selectedIndexNumber, setSelectedIndexNumber } = useAppContext();
	const selectedIndexRef = useRef(selectedIndexNumber);

	const resetQueueState = useCallback(() => {
		queueStateRef.current = { active: false, index: -1, items: [] };
		setQueueProgress({ current: 0, total: 0 });
	}, []);

	useEffect(() => {
		// ツールチェックは初期設定画面で行うため、ここでは不要
	}, []);

	useEffect(() => {
		selectedIndexRef.current = selectedIndexNumber;
	}, [selectedIndexNumber]);

	const [param, setParam] = useState<Param>({
		codec_id: undefined,
		subtitle_lang: undefined,
		output_name: "",
		start_time: "",
		end_time: "",
		is_cookie: false,
	});

	const deleteQuery = useCallback((url: string) => {
		let pattern: string;
		if (url.includes("playlist")) {
			pattern = "([&?](si|index|ab_channel|pp)[^&]*)";
		} else {
			pattern = "([&?](si|list|index|ab_channel|pp|spm_id_from)[^&]*)";
		}
		url = url.replace(new RegExp(pattern, "g"), "");
		url = url.replace(/[&?]$/g, "");
		return url;
	}, []);

	const parseQueueItems = useCallback((value: string): string[] => {
		return value
			.split(/[,\r\n]+/)
			.map((url) => url.trim())
			.filter((url) => url !== "");
	}, []);
	const normalizeTimestamp = useCallback((value: string): string | null => {
		const trimmed = value.trim().replace(/\s+/g, "").replace(/：/g, ":");
		if (trimmed === "") {
			return "";
		}
		const parts = trimmed.split(":");
		if (parts.length === 0 || parts.length > 3) {
			return null;
		}
		if (parts.some((part) => part === "" || !/^\d+$/.test(part))) {
			return null;
		}
		if (parts.length === 1) {
			const seconds = Number(parts[0]);
			if (!Number.isInteger(seconds) || seconds < 0) {
				return null;
			}
			const hh = Math.floor(seconds / 3600);
			const mm = Math.floor((seconds % 3600) / 60);
			const ss = seconds % 60;
			return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
		}
		if (parts.length === 2) {
			const minutes = Number(parts[0]);
			const seconds = Number(parts[1]);
			if (
				!Number.isInteger(minutes) ||
				minutes < 0 ||
				!Number.isInteger(seconds) ||
				seconds < 0 ||
				seconds >= 60
			) {
				return null;
			}
			const totalSeconds = minutes * 60 + seconds;
			const hh = Math.floor(totalSeconds / 3600);
			const mm = Math.floor((totalSeconds % 3600) / 60);
			const ss = totalSeconds % 60;
			return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
		}
		const [hoursText, minutesText, secondsText] = parts;
		const hours = Number(hoursText);
		const minutes = Number(minutesText);
		const seconds = Number(secondsText);
		if (
			!Number.isInteger(hours) ||
			hours < 0 ||
			!Number.isInteger(minutes) ||
			minutes < 0 ||
			minutes >= 60 ||
			!Number.isInteger(seconds) ||
			seconds < 0 ||
			seconds >= 60
		) {
			return null;
		}
		return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
	}, []);
	const isValidTimestamp = useCallback(
		(value: string): boolean => normalizeTimestamp(value) !== null,
		[normalizeTimestamp],
	);
	const invalidTimestampRef = useRef({
		start_time: false,
		end_time: false,
	});

	const validateTimestamp = useCallback(
		(field: "start_time" | "end_time", value: string): void => {
			if (value === "") {
				invalidTimestampRef.current[field] = false;
				return;
			}
			if (isValidTimestamp(value)) {
				invalidTimestampRef.current[field] = false;
				return;
			}
			if (!invalidTimestampRef.current[field]) {
				toast.error(
					`${field === "start_time" ? "開始時間" : "終了時間"}は 10, 0:10, 01:20:30 のいずれかの形式で入力してください。`,
				);
				invalidTimestampRef.current[field] = true;
			}
		},
		[isValidTimestamp],
	);

	const hasInvalidTimestamp = useCallback((): boolean => {
		if (!isValidTimestamp(param.start_time || "")) {
			toast.error(
				"開始時間は、10 (10秒), 0:10 (0分10秒), 01:10:20 (1時間10分20秒)形式で入力できます。",
			);
			return true;
		}
		if (!isValidTimestamp(param.end_time || "")) {
			toast.error(
				"終了時間は、10 (10秒), 0:10 (0分10秒), 01:10:20 (1時間10分20秒)形式で入力できます。",
			);
			return true;
		}
		return false;
	}, [isValidTimestamp, param.start_time, param.end_time]);
	const runArbitraryCommand = useCallback(async () => {
		const currentSelectedIndex = selectedIndexRef.current;
		if (hasInvalidTimestamp()) {
			return;
		}
		if (arbitraryCode === "") {
			toast.error("任意コードが空です。");
			return;
		}
		const startTime = normalizeTimestamp(param.start_time || "");
		const endTime = normalizeTimestamp(param.end_time || "");
		if (startTime === null || endTime === null) {
			toast.error("開始時間/終了時間の形式が不正です。");
			return;
		}
		const processId = (await invoke("run_command", {
			param: {
				is_cookie: param.is_cookie,
				output_name: param.output_name,
				start_time: startTime,
				end_time: endTime,
				arbitrary_code: arbitraryCode,
				kind: currentSelectedIndex,
			},
		})) as number;
		setPid(processId);
	}, [arbitraryCode, hasInvalidTimestamp, normalizeTimestamp, param]);

	const resolveOutputName = useCallback(
		(outputName: string, queueIndex?: number): string => {
			if (queueIndex === undefined) {
				return outputName;
			}
			const indexText = `${queueIndex + 1}`;
			const formatQueueIndex = (rawWidth?: string): string => {
				if (rawWidth === undefined) {
					return indexText;
				}
				const width = Number.parseInt(rawWidth, 10);
				if (!Number.isInteger(width) || width <= 0) {
					return indexText;
				}
				return indexText.padStart(width, "0");
			};
			return outputName.replace(
				/\{i(?::(\d+))?\}/g,
				(_match, rawWidth?: string) => formatQueueIndex(rawWidth),
			);
		},
		[],
	);

	const runCommandFromUrl = useCallback(
		async (urlInput: string, queueIndex?: number) => {
			const currentSelectedIndex = selectedIndexRef.current;
			const startTime = normalizeTimestamp(param.start_time || "");
			const endTime = normalizeTimestamp(param.end_time || "");
			if (startTime === null || endTime === null) {
				toast.error("開始時間/終了時間の形式が不正です。");
				throw new Error("invalid_timestamp");
			}
			let url = urlInput;
			if (!url || url === "") {
				toast.error("URLが空です。");
				throw new Error("empty_url");
			}
			if (!url.startsWith("http")) {
				if (url.length > 100) {
					url = `${url.slice(0, 97)}…`;
				}
				toast.error(`"${url}"は有効なURLではありません。`);
				throw new Error("invalid_url");
			}
			url = deleteQuery(url);
			const processId = (await invoke("run_command", {
				param: {
					...param,
					output_name: resolveOutputName(param.output_name || "", queueIndex),
					start_time: startTime,
					end_time: endTime,
					url,
					kind: currentSelectedIndex,
				},
			})) as number;
			setPid(processId);
		},
		[deleteQuery, normalizeTimestamp, param, resolveOutputName],
	);

	const executeButtonOnClick = useCallback(
		async (urlInput: string) => {
			const currentSelectedIndex = selectedIndexRef.current;
			if (hasInvalidTimestamp()) {
				return;
			}
			if (currentSelectedIndex === 13) {
				try {
					await runArbitraryCommand();
				} catch (err) {
					toast.error(`エラー: ${err}`);
				}
				return;
			}

			const queueInput = parseQueueItems(urlQueueText);
			const isQueueMode = queueInput.length > 0;

			const urls = queueInput.length > 0 ? queueInput : [urlInput];
			if (urls.length === 0 || urls.every((url) => url === "")) {
				toast.error("URLが空です。");
				return;
			}

			const invalidUrl = urls.find(
				(url) => url.length > 0 && !url.startsWith("http"),
			);
			if (invalidUrl) {
				const invalid =
					invalidUrl.length > 100 ? `${invalidUrl.slice(0, 97)}…` : invalidUrl;
				toast.error(`"${invalid}"は有効なURLではありません。`);
				return;
			}

			queueStateRef.current = {
				active: true,
				index: 0,
				items: urls,
			};
			setQueueProgress({ current: 1, total: urls.length });
			const queueIndex = isQueueMode ? 0 : undefined;

			try {
				await runCommandFromUrl(urls[0] ?? "", queueIndex);
			} catch {
				resetQueueState();
			}
		},
		[
			parseQueueItems,
			runArbitraryCommand,
			runCommandFromUrl,
			resetQueueState,
			urlQueueText,
			hasInvalidTimestamp,
		],
	);

	const runQueueNext = useCallback(() => {
		if (!queueStateRef.current.active) {
			return;
		}

		const nextIndex = queueStateRef.current.index + 1;
		if (nextIndex >= queueStateRef.current.items.length) {
			resetQueueState();
			return;
		}

		queueStateRef.current = {
			...queueStateRef.current,
			index: nextIndex,
		};
		setQueueProgress((prev) => ({ current: nextIndex + 1, total: prev.total }));
		void runCommandFromUrl(
			queueStateRef.current.items[nextIndex] ?? "",
			nextIndex,
		).catch((err) => {
			toast.error(`エラー: ${err}`);
			resetQueueState();
		});
	}, [resetQueueState, runCommandFromUrl]);

	useEffect(() => {
		const unlistenOutput = listen<string>("process-output", (event) => {
			if (event.payload === "") {
				return;
			}
			setConsoleText((prev) => {
				if (prev === "") {
					return event.payload.trimStart();
				}
				setLatestConsoleText(event.payload);
				return `${prev}\n${event.payload}`;
			});
		});

		const unlistenExit = listen<string>("process-exit", () => {
			setPid(null);
			runQueueNext();
		});

		const unlistenServerOutput = listen<string>("server-output", (event) => {
			const data = event.payload;
			try {
				const dataJson = JSON.parse(data);
				const url = dataJson.url;
				executeButtonOnClick(url);
			} catch (err) {
				toast.error(`エラー: ${err}`);
			}
		});

		return () => {
			unlistenOutput.then((fn) => fn());
			unlistenExit.then((fn) => fn());
			unlistenServerOutput.then((fn) => fn());
		};
	}, [executeButtonOnClick, runQueueNext, setLatestConsoleText]);

	const stopProcessHanlder = async () => {
		resetQueueState();
		await invoke("stop_command", { pid });
		setPid(null);
	};

	const openDirectory = async () => {
		await invoke("open_directory", { path: saveDir });
	};

	const queueProgressLabel =
		queueProgress.total > 0
			? ` キュー(${queueProgress.current}/${queueProgress.total})`
			: "";
	const isQueueRunning = queueProgress.total > 0;

	return (
		<div className="root-home">
			<div className="main-row">
				<div className="line-1">
					<div className="line-children">
						<p>コーデックID</p>
						<StyledInput
							value={param.codec_id || ""}
							onChange={(e) => setParam({ ...param, codec_id: e.target.value })}
						/>
					</div>
					<div className="line-children">
						<p>字幕言語</p>
						<StyledInput
							value={param.subtitle_lang || ""}
							onChange={(e) =>
								setParam({ ...param, subtitle_lang: e.target.value })
							}
						/>
					</div>
					<DropDownWithArrows
						{...{ selectedIndexNumber, setSelectedIndexNumber }}
					/>
					<div className="is-running-label-wrapper">
						{pid !== null ? (
							<div className="is-running-inner">
								<div className="is-running-label">
									PID {pid}で実行中です{queueProgressLabel}
								</div>
								<CustomButton
									variant="contained"
									onClick={() => {
										stopProcessHanlder();
									}}
								>
									中止
								</CustomButton>
							</div>
						) : (
							<div className="is-not-running-label"></div>
						)}
					</div>
					<div>
						<CustomButton
							variant="contained"
							onClick={openDirectory}
							sx={{
								width: "8rem",
							}}
						>
							保存先を開く
						</CustomButton>
						<StyledSwitch
							checked={param.is_cookie}
							onChange={(e) =>
								setParam({ ...param, is_cookie: e.target.checked })
							}
						/>
						クッキーを使う
					</div>
				</div>
				<div className="line-2">
					<ExecuteButton
						executeButtonOnClick={executeButtonOnClick}
						isRunning={isQueueRunning || pid !== null}
					/>
					<StyledTextField
						className="queue-textarea"
						label="一括URLリスト"
						variant="outlined"
						multiline
						minRows={3}
						maxRows={3}
						value={urlQueueText}
						onChange={(e) => setUrlQueueText(e.target.value)}
						placeholder="改行またはカンマ区切り"
					/>
					<div className="line-children">
						<p>開始</p>
						<StyledInput
							sx={{ flex: 1 }}
							value={param.start_time || ""}
							onChange={(e) => {
								const value = e.target.value;
								setParam((prev) => ({ ...prev, start_time: value }));
								validateTimestamp("start_time", value);
							}}
							type="text"
							inputProps={{
								inputMode: "text",
								placeholder: "00:00:00",
							}}
						/>
						<p>終了</p>
						<StyledInput
							sx={{ flex: 1 }}
							value={param.end_time || ""}
							onChange={(e) => {
								const value = e.target.value;
								setParam((prev) => ({ ...prev, end_time: value }));
								validateTimestamp("end_time", value);
							}}
							type="text"
							inputProps={{
								inputMode: "text",
								placeholder: "00:00:00",
							}}
						/>
					</div>
					<div className="line-children">
						<p>出力ファイル名</p>
						<StyledInput
							sx={{ flex: 1 }}
							value={param.output_name || ""}
							onChange={(e) =>
								setParam((prev) => ({ ...prev, output_name: e.target.value }))
							}
							placeholder="{i}で連番"
						/>
					</div>
					<div className="line-children">
						<span className="arbitrary-code-label">任意コード</span>
						<StyledInput
							sx={{
								width: "100%",
							}}
							value={arbitraryCode}
							onChange={(e) => {
								setArbitraryCode(e.target.value);
							}}
							onKeyDown={(e) => {
								if (e.key === "Enter") {
									executeButtonOnClick("");
								}
							}}
						/>
					</div>
				</div>
			</div>
			<BottomTab consoleText={consoleText} />
		</div>
	);
}
