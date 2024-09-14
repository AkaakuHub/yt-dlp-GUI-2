import React, { useEffect, useState } from "react";
import { FixedSizeList, ListOnScrollProps } from "react-window";
import PropTypes from "prop-types";
import "./index.css";

interface ConsoleBoxProps {
  consoleText: string;
}

const ConsoleBox: React.FC<ConsoleBoxProps> = ({ consoleText }) => {
  const [consoleLines, setConsoleLines] = useState<string[]>([]);
  const [autoScrollEnabled, setAutoScrollEnabled] = useState<boolean>(true);
  const [listHeight, setListHeight] = useState<number>(0);

  useEffect(() => {
    setConsoleLines(consoleText.split("\n"));
  }, [consoleText]);

  const updateListHeight = () => {
    const boxHeight = window.innerHeight - 90 - 290 - 46;
    setListHeight(boxHeight);
  };

  useEffect(() => {
    updateListHeight();
    window.addEventListener("resize", updateListHeight);
    return () => {
      window.removeEventListener("resize", updateListHeight);
    };
  }, []);

  const handleScroll = ({ scrollOffset, scrollUpdateWasRequested }: ListOnScrollProps) => {
    const contentHeight = consoleLines.length * 16 - 34;

    setTimeout(() => {
      if (!scrollUpdateWasRequested && scrollOffset + listHeight < contentHeight) {
        setAutoScrollEnabled(false);
        console.log("disable");
      } else {
        setAutoScrollEnabled(true);
        console.log("enable");
      }
    }, 100);
  };

  useEffect(() => {
    if (autoScrollEnabled) {
      const scrollElement = document.querySelector(".console-list");
      if (scrollElement) {
        scrollElement.scrollTop = scrollElement.scrollHeight;
      }
    }
  }, [consoleText, autoScrollEnabled]);

  return (
    <div className="console-box-wrapper">
      <div className="console-box">
        <FixedSizeList
          height={listHeight}
          width={"100%"}
          itemCount={consoleLines.length}
          itemSize={16}
          className="console-list"
          onScroll={handleScroll}
        >
          {({ index, style }: { index: number; style: React.CSSProperties }) => {
            const text = consoleLines[index];
            if (text !== "") {
              return (
                <div style={style}>
                  {text}
                </div>
              )
            }
          }}
        </FixedSizeList>
      </div >
    </div >
  );
};

ConsoleBox.propTypes = {
  consoleText: PropTypes.string.isRequired,
};

export default ConsoleBox;
