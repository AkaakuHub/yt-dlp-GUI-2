import { useEffect } from "react"
import { useAppContext } from "../AppContext"
import { Select } from "../../ui/select"
import CustomButton from "../CustomButton"
import { PlayIcon } from "../../ui/icons"
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
    <div className="form-control-wrapper" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <div className="select-control" style={{ flex: 1 }}>
        <label htmlFor="mode-select" className="select-label" style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>モード</label>
        <Select
          id="mode-select"
          value={selectedIndexNumber}
          onChange={(e) => setSelectedIndexNumber(parseInt(e.target.value as unknown as string))}
          disabled={!isSettingLoaded}
          className="select-input"
        >
          {dropdownOptions.map((option, index) =>
            option ? (
              <option key={index} value={option.value}>{option.label}</option>
            ) : (
              <option key={index} disabled>――――――――</option>
            )
          )}
        </Select>
      </div>
      <div className="arrow-buttons-wrapper" style={{ display: 'flex', gap: 4 }}>
        <CustomButton
          onClick={handlePrevious}
          disabled={!isSettingLoaded}
          aria-label="前へ"
          variant="secondary"
        >
          <PlayIcon style={{ transform: 'rotate(180deg)' }} />
        </CustomButton>
        <CustomButton
          onClick={handleNext}
          disabled={!isSettingLoaded}
          aria-label="次へ"
          variant="secondary"
        >
          <PlayIcon />
        </CustomButton>
      </div>
    </div>
  );
}

DropDownWithArrows.propTypes = {
  selectedIndexNumber: PropTypes.number.isRequired,
  setSelectedIndexNumber: PropTypes.func.isRequired
};

export default DropDownWithArrows
