import React, { useEffect, useState, useRef, useCallback } from "react";
import { FixedSizeList, ListOnScrollProps } from "react-window";
import { Fab, Tooltip } from "@mui/material";
import { ArrowDownward, KeyboardArrowUp } from "@mui/icons-material";
import PropTypes from "prop-types";
import "./index.css";

interface ConsoleBoxProps {
  consoleText: string;
}

const ConsoleBox: React.FC<ConsoleBoxProps> = ({ consoleText }) => {
  const [consoleLines, setConsoleLines] = useState<string[]>([]);
  const [isUserScrolled, setIsUserScrolled] = useState<boolean>(false);
  const [isAtBottom, setIsAtBottom] = useState<boolean>(true);
  const [listHeight, setListHeight] = useState<number>(400);

  const listRef = useRef<FixedSizeList>(null);
  const isScrollingRef = useRef<boolean>(false);
  const scrollTimerRef = useRef<number | null>(null);
  const lastScrollOffsetRef = useRef<number>(0);

  // テキストを行ごとに分割
  useEffect(() => {
    setConsoleLines(consoleText.split("\n"));
  }, [consoleText]);

  // コンテナの高さを計算
  const updateListHeight = useCallback(() => {
    const height = window.innerHeight - 110 - 290 - 46;
    setListHeight(height);
  }, []);

  useEffect(() => {
    updateListHeight();
    window.addEventListener("resize", updateListHeight);
    return () => window.removeEventListener("resize", updateListHeight);
  }, [updateListHeight]);

  // 最下部にいるかチェック（より厳密に）
  const checkIsAtBottom = useCallback((scrollOffset: number) => {
    if (consoleLines.length === 0) return true;

    const contentHeight = consoleLines.length * 20;
    const maxScrollOffset = Math.max(0, contentHeight - listHeight);
    const threshold = 3; // 3pxのマージン（さらに厳密）

    return scrollOffset >= maxScrollOffset - threshold;
  }, [consoleLines.length, listHeight]);

  // スクロールハンドラー（react-window対応版）
  const handleScroll = useCallback(({ scrollOffset, scrollUpdateWasRequested }: ListOnScrollProps) => {
    if (scrollUpdateWasRequested) return;

    const scrollDirection = scrollOffset - lastScrollOffsetRef.current;
    const currentlyAtBottom = checkIsAtBottom(scrollOffset);

    // スクロール中フラグを立てる
    isScrollingRef.current = true;

    // 既存のタイマーをクリア
    if (scrollTimerRef.current) {
      clearTimeout(scrollTimerRef.current);
    }

    // スクロール方向に応じて状態を更新
    if (scrollDirection < 0) {
      // 上にスクロールしたら追従を解除
      if (!isUserScrolled) {
        setIsUserScrolled(true);
      }
    } else if (scrollDirection > 0 && currentlyAtBottom) {
      // 下にスクロールして最下部に到達したら追従を再開
      if (isUserScrolled) {
        setIsUserScrolled(false);
        setIsAtBottom(true);
      }
    }

    setIsAtBottom(currentlyAtBottom);
    lastScrollOffsetRef.current = scrollOffset;

    // スクロールが終わったことを検知
    scrollTimerRef.current = setTimeout(() => {
      isScrollingRef.current = false;
    }, 100) as unknown as number;
  }, [checkIsAtBottom, isUserScrolled]);

  // 自動スクロール（追従中のみ） - 遅延を追加して確実に最下部に
  useEffect(() => {
    if (!isUserScrolled && !isScrollingRef.current && consoleLines.length > 0) {
      // 少し遅延してからスクロール
      const timer = setTimeout(() => {
        requestAnimationFrame(() => {
          listRef.current?.scrollToItem(consoleLines.length - 1, "end");
        });
      }, 10);

      return () => clearTimeout(timer);
    }
  }, [consoleLines.length, isUserScrolled]);

  // 手動で最下部にスクロール
  const scrollToBottom = useCallback(() => {
    setIsUserScrolled(false);
    setIsAtBottom(true);
    if (consoleLines.length > 0) {
      // 即時実行
      listRef.current?.scrollToItem(consoleLines.length - 1, "end");
    }
  }, [consoleLines.length]);

  // 選択ハンドラー
  const handleLineDoubleClick = useCallback((lineNumber: number) => {
    const element = document.getElementById(`console-line-${lineNumber}`);
    if (element) {
      const range = document.createRange();
      range.selectNodeContents(element);
      const selection = window.getSelection();
      if (selection) {
        selection.removeAllRanges();
        selection.addRange(range);
      }
    }
  }, []);

  // Row renderer for react-window
  const Row = useCallback(({ index, style }: { index: number; style: React.CSSProperties }) => {
    const text = consoleLines[index];
    const lineNumber = index + 1;
    const isEmpty = text.trim() === "";

    return (
      <div
        style={{
          ...style,
          top: style.top, // react-windowのpositionを維持
          left: 0,
          right: 0,
        }}
        className={`console-line ${isEmpty ? "empty-line" : ""}`}
        onDoubleClick={() => handleLineDoubleClick(lineNumber)}
      >
        <span className="line-number">{lineNumber}</span>
        <span
          id={`console-line-${lineNumber}`}
          className="line-content"
        >
          {text || " "}
        </span>
      </div>
    );
  }, [consoleLines, handleLineDoubleClick]);

  return (
    <div className="console-box-wrapper">
      <div className="console-box">
        <FixedSizeList
          ref={listRef}
          height={listHeight}
          width="100%"
          itemCount={consoleLines.length}
          itemSize={20}
          className="console-list"
          onScroll={handleScroll}
          overscanCount={5} // パフォーマンス向上のためのoverscan
        >
          {Row}
        </FixedSizeList>
      </div>

      {/* 追従状況を示すフローティングボタン */}
      <Tooltip title={isAtBottom ? "追従中" : "最下部に移動して追従"}>
        <Fab
          className={`scroll-fab ${isAtBottom ? "following" : "not-following"}`}
          size="small"
          onClick={scrollToBottom}
          color={isAtBottom ? "primary" : "secondary"}
        >
          {isAtBottom ? <ArrowDownward /> : <KeyboardArrowUp />}
        </Fab>
      </Tooltip>
    </div>
  );
};

ConsoleBox.propTypes = {
  consoleText: PropTypes.string.isRequired,
};

export default ConsoleBox;