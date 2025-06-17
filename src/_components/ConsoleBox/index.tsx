import React, { useEffect, useState, useRef } from "react";
import { FixedSizeList, ListOnScrollProps } from "react-window";
import PropTypes from "prop-types";
import "./index.css";

interface ConsoleBoxProps {
  consoleText: string;
}

const ConsoleBox: React.FC<ConsoleBoxProps> = ({ consoleText }) => {
  const [consoleLines, setConsoleLines] = useState<string[]>([]);
  const [listHeight, setListHeight] = useState<number>(0);
  const [isUserScrolling, setIsUserScrolling] = useState<boolean>(false);
  const listRef = useRef<FixedSizeList>(null);
  const scrollTimeoutRef = useRef<number | null>(null);

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

  const handleScroll = ({ scrollOffset, scrollUpdateWasRequested }: ListOnScrollProps) => {
    if (scrollUpdateWasRequested) return;

    setIsUserScrolling(true);

    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }

    scrollTimeoutRef.current = setTimeout(() => {
      setIsUserScrolling(false);
    }, 1000);

    const contentHeight = consoleLines.length * 20;
    const maxScrollTop = Math.max(0, contentHeight - listHeight);

    if (scrollOffset >= maxScrollTop - 50) {
      setIsUserScrolling(false);
    }
  };

  useEffect(() => {
    if (!isUserScrolling && consoleLines.length > 0) {
      requestAnimationFrame(() => {
        listRef.current?.scrollToItem(consoleLines.length - 1, "end");
      });
    }
  }, [consoleLines, isUserScrolling]);

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
