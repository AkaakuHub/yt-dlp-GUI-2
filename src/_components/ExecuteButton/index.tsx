import PropTypes from "prop-types";
import clsx from "clsx";
import { readText } from "@tauri-apps/api/clipboard";

import "./index.css"

interface ExecuteButtonProps {
  executeButtonOnClick: (url: string) => void
  isRunning: boolean
}

const ExecuteButton: React.FC<ExecuteButtonProps> = ({
  executeButtonOnClick,
  isRunning
}) => {

  const onClickHandler = async () => {
    let url = await readText();
    if (!url) {
      url = "";
    }
    executeButtonOnClick(url)
  }

  return (
    <div
      className={clsx("execute-button", isRunning && "execute-button-disabled")}
      onClick={() => {
        if (isRunning) { return; }
        onClickHandler();
      }}
      role="button"
      tabIndex={isRunning ? -1 : 0}
      aria-label={isRunning ? "実行中..." : "クリップボードのURLでダウンロードを実行"}
      aria-disabled={isRunning}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && !isRunning) {
          e.preventDefault();
          onClickHandler();
        }
      }}
    >
      {isRunning ? "実行中..." : "ここをクリックして実行"}
    </div>
  )
}

ExecuteButton.propTypes = {
  executeButtonOnClick: PropTypes.func.isRequired,
  isRunning: PropTypes.bool.isRequired
};

export default ExecuteButton
