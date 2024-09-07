import React, { useEffect, useRef } from "react"
import "./index.css"

interface ConsoleBoxProps {
  consoleText: string
}

const ConsoleBox: React.FC<ConsoleBoxProps> = ({ consoleText }) => {
  const consoleBoxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (consoleBoxRef.current) {
      consoleBoxRef.current.scrollTop = consoleBoxRef.current.scrollHeight
    }
  }, [consoleText])

  return (
    <div className="console-box" ref={consoleBoxRef}>
      <div className="console-box-text">{consoleText}</div>
    </div>
  )
}

export default ConsoleBox
