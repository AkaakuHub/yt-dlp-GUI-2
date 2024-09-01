import { useEffect, useState } from "react"
import { MenuItem, Select, InputLabel, FormControl } from "@mui/material"
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import { IconButton } from "@mui/material"
import { invoke } from "@tauri-apps/api";
import { debounce } from "lodash";
import PropTypes from "prop-types";

import "./index.css"

import { ConfigProps } from "../../types";

const dropdownOptions = [
  { label: "1.通常DL", value: 1 },
  { label: "2.音声DL", value: 2 },
  { label: "3.最高品質DL", value: 3 },
  { label: "4.サムネイルDL", value: 4 },
  { label: "5.フォーマット自動DL", value: 5 },
  { label: "6.字幕DL", value: 6 },
  { label: "----------", value: 999, separator: true },
  { label: "7.リストを表示", value: 7 },
  { label: "8.コーデックIDを指定DL", value: 8 },
  { label: "----------", value: 999, separator: true },
  { label: "9.(Pre)リストを表示", value: 9 },
  { label: "10.(Pre)コーデックIDを指定DL", value: 10 },
  { label: "----------", value: 999, separator: true },
  { label: "11.コーデックID141", value: 11 },
  { label: "12.配信録画", value: 12 },
  { label: "13.任意コード >yt-dlp", value: 13 },
]

// TODO: カスタム追加

interface DropDownWithArrowsProps {
  selectedIndexNumber: number
  setSelectedIndexNumber: React.Dispatch<React.SetStateAction<number>>
}

const DropDownWithArrows: React.FC<DropDownWithArrowsProps> = (
  { selectedIndexNumber, setSelectedIndexNumber }
) => {
  const [isLoading, setIsLoading] = useState<boolean>(true);

  let maxValue = 0
  dropdownOptions.map((option, index) => {
    if (!option.separator) {
      if (option.value > maxValue) {
        maxValue = index
      }
    }
  })

  const handleNext = () => {
    setSelectedIndexNumber((prev) => {
      if (prev === maxValue) {
        return 1
      } else {
        return prev + 1
      }
    })
  }

  const handlePrevious = () => {
    setSelectedIndexNumber((prev) => {
      if (prev === 1) {
        return maxValue
      } else {
        return prev - 1
      }
    })
  }

  useEffect(() => {
    invoke<ConfigProps>("get_settings").then((config) => {
      console.log(config.index);
      setSelectedIndexNumber(config.index);
    });
    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (selectedIndexNumber !== null) {
      saveDropDownIndex(selectedIndexNumber);
    }
  }, [selectedIndexNumber])

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
          disabled={isLoading}
        >
          {dropdownOptions.map((option, index) =>
            option.separator ? (
              <MenuItem key={index} disabled>
                {option.label}
              </MenuItem>
            ) : (
              <MenuItem key={index} value={option.value}>
                {option.label}
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
  )
}

DropDownWithArrows.propTypes = {
  selectedIndexNumber: PropTypes.number.isRequired,
  setSelectedIndexNumber: PropTypes.func.isRequired
};

export default DropDownWithArrows
