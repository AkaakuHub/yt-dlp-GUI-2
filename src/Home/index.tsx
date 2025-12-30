import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/tauri";
import { useCallback, useEffect, useRef, useState } from "react";
import "./index.css";

import { Input, Switch } from "@mui/material";
import { styled } from "@mui/material/styles";

import { toast } from "react-toastify";
import { useAppContext } from "../_components/AppContext";
import BottomTab from "../_components/BottomTab";
import CustomButton from "../_components/CustomButton";

import DropDownWithArrows from "../_components/DropDownWithArrows";
import ExecuteButton from "../_components/ExecuteButton";

// StyledComponents for dark mode support
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

export default function Home() {
	const { setLatestConsoleText } = useAppContext();
	const { saveDir } = useAppContext();
	const [pid, setPid] = useState<number | null>(null);

	const [consoleText, setConsoleText] = useState<string>("");
	const [arbitraryCode, setArbitraryCode] = useState<string>("");

	const { selectedIndexNumber, setSelectedIndexNumber } = useAppContext();
	const selectedIndexRef = useRef(selectedIndexNumber);

	useEffect(() => {
		// ツールチェックは初期設定画面で行うため、ここでは不要
	}, []);

	useEffect(() => {
		selectedIndexRef.current = selectedIndexNumber;
	}, [selectedIndexNumber]);

	interface Param {
		codec_id?: string;
		subtitle_lang?: string;
		is_cookie: boolean;
	}

	const [param, setParam] = useState<Param>({
		codec_id: undefined,
		subtitle_lang: undefined,
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

	const executeButtonOnClick = useCallback(
		async (url_input: string) => {
			try {
				let processId: number;
				const currentSelectedIndex = selectedIndexRef.current;

				let url = url_input;
				if (currentSelectedIndex !== 13) {
					if (!url || url === "") {
						toast.error("URLが空です。");
						return;
					} else if (!url.startsWith("http")) {
						if (url.length > 100) {
							url = `${url.slice(0, 97)}…`;
						}
						toast.error(`"${url}"は有効なURLではありません。`);
						return;
					}
					url = deleteQuery(url);
					processId = (await invoke("run_command", {
						param: {
							...param,
							url,
							kind: currentSelectedIndex,
						},
					})) as number;
				} else {
					if (arbitraryCode === "") {
						toast.error("任意コードが空です。");
						return;
					}
					processId = (await invoke("run_command", {
						param: {
							is_cookie: param.is_cookie,
							arbitrary_code: arbitraryCode,
							kind: currentSelectedIndex,
						},
					})) as number;
				}
				setPid(processId);
			} catch (err) {
				toast.error(`エラー: ${err}`);
			}
		},
		[arbitraryCode, deleteQuery, param],
	);

	useEffect(() => {
		const unlistenOutput = listen<string>("process-output", (event) => {
			if (event.payload === "") {
				return;
			}
			// const maxLength = 10000;
			// 仮想化に移行
			setConsoleText((prev) => {
				// prev が空なら最初の改行を削除した新しいテキストをセット
				if (prev === "") {
					return event.payload.trimStart();
				}
				// console.log("payl", event.payload);
				setLatestConsoleText(event.payload);
				// if (prev.length > maxLength) {
				//   return prev.slice(prev.length - maxLength) + "\n" + event.payload;
				// }
				// そうでなければ改行して追加
				return `${prev}\n${event.payload}`;
			});
		});

		const unlistenExit = listen<string>("process-exit", () => {
			setPid(null);
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
	}, [executeButtonOnClick, setLatestConsoleText]);

	const stopProcessHanlder = async () => {
		await invoke("stop_command", { pid });
		setPid(null);
	};

	const openDirectory = async () => {
		await invoke("open_directory", { path: saveDir });
	};

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
								<div className="is-running-label">PID {pid}で実行中です</div>
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
						isRunning={pid !== null}
					/>
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
