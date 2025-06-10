import React, { useEffect, useState, useRef } from "react";
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
  const listRef = useRef<FixedSizeList>(null);

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
    const contentHeight = consoleLines.length * 20;
    const maxScrollTop = Math.max(0, contentHeight - listHeight);

    setTimeout(() => {
      if (!scrollUpdateWasRequested && scrollOffset < maxScrollTop - 50) {
        setAutoScrollEnabled(false);
      } else if (scrollOffset >= maxScrollTop - 50) {
        setAutoScrollEnabled(true);
      }
    }, 100);
  };

  useEffect(() => {
    if (autoScrollEnabled && consoleLines.length > 0) {
      // FixedSizeListの最後の項目にスクロール
      listRef.current?.scrollToItem(consoleLines.length - 1, "end");
    }
  }, [consoleLines, autoScrollEnabled]);

  return (
    <div className="console-box-wrapper">
      <div className="console-box">
        <FixedSizeList
          ref={listRef}
          height={listHeight}
          width={"100%"}
          itemCount={consoleLines.length}
          itemSize={20}
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
