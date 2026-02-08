import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import {
	FormControl,
	IconButton,
	InputLabel,
	MenuItem,
	Select,
} from "@mui/material";
import { invoke } from "@tauri-apps/api";
import { debounce } from "lodash";
import { useEffect, useMemo } from "react";
import { useAppContext } from "../AppContext";

import "./index.css";

const dropdownOptions = [
	{ label: "通常ダウンロード" },
	{ label: "音声のみダウンロード" },
	{ label: "1080p" },
	{ label: "720p" },
	{ label: "480p" },
	{ label: "360p" },
	{ label: "リストを表示" },
	{ label: "IDを指定" },
	{ label: "配信録画(最初から)" },
	{ label: "配信録画(現在から)" },
	{ label: "サムネイル" },
	{ label: "字幕" },
	{ label: "任意コード >yt-dlp" },
].map((option, index) => {
	return { ...option, value: index + 1 }; // インデックスベースでvalueを設定(1から始まる)
});

console.log(dropdownOptions);

interface DropDownWithArrowsProps {
	selectedIndexNumber: number;
	setSelectedIndexNumber: React.Dispatch<React.SetStateAction<number>>;
}

const DropDownWithArrows: React.FC<DropDownWithArrowsProps> = ({
	selectedIndexNumber,
	setSelectedIndexNumber,
}) => {
	const { isSettingLoaded } = useAppContext();

	// 有効な選択肢のvalue値を取得
	const validValues = dropdownOptions.map((option) => option.value);

	const saveDropDownIndex = useMemo(
		() =>
			debounce(async (temp: number) => {
				await invoke("set_index", { newIndex: temp });
			}, 500),
		[],
	);

	const persistIndex = (next: number) => {
		if (!isSettingLoaded) return;
		setSelectedIndexNumber(next);
		saveDropDownIndex(next);
	};

	const handleNext = () => {
		const currentIndex = validValues.indexOf(selectedIndexNumber);
		if (currentIndex === -1) {
			persistIndex(validValues[0]);
			return;
		}
		const nextIndex = (currentIndex + 1) % validValues.length;
		persistIndex(validValues[nextIndex]);
	};

	const handlePrevious = () => {
		const currentIndex = validValues.indexOf(selectedIndexNumber);
		if (currentIndex === -1) {
			persistIndex(validValues[0]);
			return;
		}
		const prevIndex =
			currentIndex === 0 ? validValues.length - 1 : currentIndex - 1;
		persistIndex(validValues[prevIndex]);
	};

	useEffect(() => {
		return () => {
			saveDropDownIndex.cancel();
		};
	}, [saveDropDownIndex]);

	return (
		<div className="form-control-wrapper">
			<FormControl fullWidth className="select-control">
				<InputLabel id="mode-select-label" className="select-label">
					モード
				</InputLabel>
				<Select
					labelId="mode-select-label"
					label="モード"
					id="mode-select"
					value={selectedIndexNumber}
					onChange={(e) => persistIndex(e.target.value as number)}
					disabled={!isSettingLoaded}
					className="select-input"
					MenuProps={{
						PaperProps: {
							className: "select-menu",
						},
					}}
				>
					{dropdownOptions.map((option) => (
						<MenuItem
							key={option.value}
							value={option.value}
							className="menu-item"
						>
							{option.label}
						</MenuItem>
					))}
				</Select>
			</FormControl>
			<div className="arrow-buttons-wrapper">
				<IconButton
					size="large"
					className="arrow-button arrow-button-prev"
					onClick={handlePrevious}
					disabled={!isSettingLoaded}
				>
					<PlayArrowIcon
						className="arrow-icon"
						sx={{ transform: "rotate(180deg)" }}
					/>
				</IconButton>
				<IconButton
					size="large"
					className="arrow-button arrow-button-next"
					onClick={handleNext}
					disabled={!isSettingLoaded}
				>
					<PlayArrowIcon className="arrow-icon" />
				</IconButton>
			</div>
		</div>
	);
};

export default DropDownWithArrows;
