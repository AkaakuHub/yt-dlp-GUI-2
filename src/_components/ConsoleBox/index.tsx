import React, { useEffect, useState, useRef } from "react";
import PropTypes from "prop-types";
import "./index.css";

interface ConsoleBoxProps {
  consoleText: string;
}

const ConsoleBox: React.FC<ConsoleBoxProps> = ({ consoleText }) => {
  const [consoleLines, setConsoleLines] = useState<string[]>([]);
  const [listHeight, setListHeight] = useState<number>(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setConsoleLines(consoleText.split("\n"));
  }, [consoleText]);

  const updateListHeight = () => {
    const boxHeight = window.innerHeight - 110 - 290 - 46;
    setListHeight(boxHeight);
  };

  useEffect(() => {
    updateListHeight();
    window.addEventListener("resize", updateListHeight);
    return () => {
      window.removeEventListener("resize", updateListHeight);
    };
  }, []);

  return (
    <div className="console-box-wrapper">
      <div className="console-box">
        <div
          ref={listRef}
          style={{ height: listHeight, width: "100%" }}
          className="console-list"
        >
          {consoleLines.map((text, index) => {
            if (text !== "") {
              return (
                <div key={index} className="console-line">
                  {text}
                </div>
              );
            }
            return null;
          })}
        </div>
      </div >
    </div >
  );
};

ConsoleBox.propTypes = {
  consoleText: PropTypes.string.isRequired,
};

export default ConsoleBox;
