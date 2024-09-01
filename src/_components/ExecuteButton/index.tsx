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

export default ExecuteButton
