import PropTypes from "prop-types";

import "./index.css"

interface ExecuteButtonProps {
  executeButtonOnClick: () => void
}

const ExecuteButton: React.FC<ExecuteButtonProps> = ({
  executeButtonOnClick,
}) => {
  return (
    <div
      className="execute-button"
      onClick={() => {
        executeButtonOnClick()
      }}
    >
      ここをクリックして実行
    </div>
  )
}

ExecuteButton.propTypes = {
  executeButtonOnClick: PropTypes.func.isRequired
};

export default ExecuteButton
