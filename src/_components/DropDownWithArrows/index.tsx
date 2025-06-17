import { useEffect } from "react"
import { useAppContext } from "../AppContext"
import { MenuItem, Select, InputLabel, FormControl } from "@mui/material"
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import { IconButton } from "@mui/material"
import { invoke } from "@tauri-apps/api";
import { debounce } from "lodash";
import PropTypes from "prop-types";

import "./index.css"

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
  selectedIndexNumber: number
  setSelectedIndexNumber: React.Dispatch<React.SetStateAction<number>>
}

const DropDownWithArrows: React.FC<DropDownWithArrowsProps> = (
  { selectedIndexNumber, setSelectedIndexNumber }
) => {
  const { isSettingLoaded } = useAppContext();

  // 有効な選択肢のvalue値を取得
  const validValues = dropdownOptions
    .filter(option => option !== null)
    .map(option => option!.value);

  const handleNext = () => {
    setSelectedIndexNumber((prev) => {
      const currentIndex = validValues.indexOf(prev);
      if (currentIndex === -1) {
        // 現在の値が有効でない場合は最初の値を返す
        return validValues[0];
      }
      // 次の値に移動、最後の場合は最初に戻る
      const nextIndex = (currentIndex + 1) % validValues.length;
      return validValues[nextIndex];
    });
  };

  const handlePrevious = () => {
    setSelectedIndexNumber((prev) => {
      const currentIndex = validValues.indexOf(prev);
      if (currentIndex === -1) {
        // 現在の値が有効でない場合は最初の値を返す
        return validValues[0];
      }
      // 前の値に移動、最初の場合は最後に移動
      const prevIndex = currentIndex === 0 ? validValues.length - 1 : currentIndex - 1;
      return validValues[prevIndex];
    });
  };

  useEffect(() => {
    if (selectedIndexNumber !== null) {
      setSelectedIndexNumber(selectedIndexNumber);
      saveDropDownIndex(selectedIndexNumber);
    }
  }, [selectedIndexNumber]);

  const saveDropDownIndex = debounce(async (temp: number) => {
    await invoke("set_index", { newIndex: temp });
  }, 500);

  return (
    <div className="form-control-wrapper">
      <FormControl fullWidth className="select-control">
        <InputLabel id="mode-select-label" className="select-label">モード</InputLabel>
        <Select
          labelId="mode-select-label"
          label="モード"
          id="mode-select"
          value={selectedIndexNumber}
          onChange={(e) => setSelectedIndexNumber(e.target.value as number)}
          disabled={!isSettingLoaded}
          className="select-input"
          MenuProps={{
            PaperProps: {
              className: "select-menu"
            }
          }}
        >
          {dropdownOptions.map((option, index) =>
            option ? (
              <MenuItem key={index} value={option.value} className="menu-item">
                {option.label}
              </MenuItem>
            ) : (
              <MenuItem key={index} disabled className="menu-divider">
                {"――――――――"}
              </MenuItem>
            )
          )}
        </Select>
      </FormControl>
      <div className="arrow-buttons-wrapper">
        <IconButton
          size="large"
          className="arrow-button arrow-button-prev"
          onClick={handlePrevious}
          disabled={!isSettingLoaded}>
          <PlayArrowIcon className="arrow-icon" sx={{ transform: "rotate(180deg)" }} />
        </IconButton>
        <IconButton
          size="large"
          className="arrow-button arrow-button-next"
          onClick={handleNext}
          disabled={!isSettingLoaded}>
          <PlayArrowIcon className="arrow-icon" />
        </IconButton>
      </div>
    </div>
  );
}

DropDownWithArrows.propTypes = {
  selectedIndexNumber: PropTypes.number.isRequired,
  setSelectedIndexNumber: PropTypes.func.isRequired
};

export default DropDownWithArrows
