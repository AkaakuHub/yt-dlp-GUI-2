import PropTypes from "prop-types";
import clsx from "clsx";

import "./index.css"

interface ExecuteButtonProps {
  executeButtonOnClick: () => void,
  isRunning: boolean
}

const ExecuteButton: React.FC<ExecuteButtonProps> = ({
  executeButtonOnClick,
  isRunning
}) => {
  return (
    <div
      className={clsx("execute-button", isRunning && "execute-button-disabled")}
      onClick={() => {
        if (isRunning) { return; }
        executeButtonOnClick()
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
