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
  null,
  { label: "リストを表示" },
  { label: "コーデックIDを指定ダウンロード" },
  null,
  { label: "配信録画(最初から)" },
  { label: "配信録画(現在から)" },
  { label: "サムネイル" },
  { label: "字幕" },
  { label: "任意コード >yt-dlp" },
].reduce((acc: ({ value: number; label: string } | null)[], option) => {
  const currentValue = acc.filter(opt => opt !== null).length + 1;
  if (option) {
    acc.push({ ...option, value: currentValue });
  } else {
    acc.push(null);
  }
  return acc;
}, []);

console.log(dropdownOptions);


interface DropDownWithArrowsProps {
  selectedIndexNumber: number
  setSelectedIndexNumber: React.Dispatch<React.SetStateAction<number>>
}

const DropDownWithArrows: React.FC<DropDownWithArrowsProps> = (
  { selectedIndexNumber, setSelectedIndexNumber }
) => {

  console.log(dropdownOptions)

  const { isSettingLoaded } = useAppContext();

  let maxValue = 0
  dropdownOptions.map((option, index) => {
    if (option) {
      if (option.value > maxValue) {
        maxValue = index
      }
    }
  })

  const handleNext = () => {
    setSelectedIndexNumber((prev) => {
      let next = prev + 1;
      while (dropdownOptions[next - 1] === null) {
        next = (next === dropdownOptions.length) ? 1 : next + 1;
      }
      return next > dropdownOptions.length ? 1 : next;
    });
  };

  const handlePrevious = () => {
    setSelectedIndexNumber((prev) => {
      let next = prev - 1;
      while (dropdownOptions[next - 1] === null) {
        next = (next === 1) ? dropdownOptions.length : next - 1;
      }
      return next < 1 ? dropdownOptions.length : next;
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
      <FormControl fullWidth>
        <InputLabel id="demo-simple-select-label">モード</InputLabel>
        <Select
          labelId="demo-simple-select-label"
          label="モード"
          id="demo-simple-select"
          value={selectedIndexNumber}
          onChange={(e) => setSelectedIndexNumber(e.target.value as number)}
          disabled={!isSettingLoaded}
        >
          {dropdownOptions.map((option, index) =>
            option ? (
              <MenuItem key={index} value={option.value}>
                {option.label}
              </MenuItem>
            ) : (
              <MenuItem key={index} disabled>
                {"――――――――"}
              </MenuItem>
            )
          )}
        </Select>
      </FormControl>
      <div className="arrow-buttons-wrapper">
        <IconButton
          size="large"
          className="arrow-buttons"
          onClick={handlePrevious}>
          <PlayArrowIcon sx={{ transform: "rotate(180deg)" }} />
        </IconButton>
        <IconButton
          size="large"
          className="arrow-buttons"
          onClick={handleNext}>
          <PlayArrowIcon />
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
