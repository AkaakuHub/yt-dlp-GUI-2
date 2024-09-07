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
    const url = await readText();
    if (!url) { return; }
    executeButtonOnClick(url)
  }

  return (
    <div
      className={clsx("execute-button", isRunning && "execute-button-disabled")}
      onClick={() => {
        if (isRunning) { return; }
        onClickHandler();
      }}
    >
      ここをクリックして実行
    </div>
  )
}

ExecuteButton.propTypes = {
  executeButtonOnClick: PropTypes.func.isRequired,
  isRunning: PropTypes.bool.isRequired
};

export default ExecuteButton
