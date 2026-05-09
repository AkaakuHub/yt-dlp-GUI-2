import { ArrowDown } from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { FixedSizeList, type ListOnScrollProps } from "react-window";

interface ConsoleBoxProps {
	consoleText: string;
}

const ConsoleBox: React.FC<ConsoleBoxProps> = ({ consoleText }) => {
	const [consoleLines, setConsoleLines] = useState<string[]>([]);
	const [isUserScrolled, setIsUserScrolled] = useState<boolean>(false);
	const [isAtBottom, setIsAtBottom] = useState<boolean>(true);
	const [listHeight, setListHeight] = useState<number>(400);

	const wrapperRef = useRef<HTMLDivElement>(null);
	const listRef = useRef<FixedSizeList>(null);
	const isScrollingRef = useRef<boolean>(false);
	const scrollTimerRef = useRef<number | null>(null);
	const lastScrollOffsetRef = useRef<number>(0);

	useEffect(() => {
		setConsoleLines(consoleText === "" ? [] : consoleText.split("\n"));
	}, [consoleText]);

	useEffect(() => {
		const wrapper = wrapperRef.current;
		if (!wrapper) {
			return;
		}

		const observer = new ResizeObserver(([entry]) => {
			setListHeight(Math.max(120, Math.floor(entry.contentRect.height)));
		});
		observer.observe(wrapper);

		return () => observer.disconnect();
	}, []);

	const checkIsAtBottom = useCallback(
		(scrollOffset: number) => {
			if (consoleLines.length === 0) return true;

			const contentHeight = consoleLines.length * 20;
			const maxScrollOffset = Math.max(0, contentHeight - listHeight);
			const threshold = 3;

			return scrollOffset >= maxScrollOffset - threshold;
		},
		[consoleLines.length, listHeight],
	);

	const handleScroll = useCallback(
		({ scrollOffset, scrollUpdateWasRequested }: ListOnScrollProps) => {
			if (scrollUpdateWasRequested) return;

			const scrollDirection = scrollOffset - lastScrollOffsetRef.current;
			const currentlyAtBottom = checkIsAtBottom(scrollOffset);

			isScrollingRef.current = true;

			if (scrollTimerRef.current) {
				clearTimeout(scrollTimerRef.current);
			}

			if (scrollDirection < 0) {
				if (!isUserScrolled) {
					setIsUserScrolled(true);
				}
			} else if (scrollDirection > 0 && currentlyAtBottom) {
				if (isUserScrolled) {
					setIsUserScrolled(false);
					setIsAtBottom(true);
				}
			}

			setIsAtBottom(currentlyAtBottom);
			lastScrollOffsetRef.current = scrollOffset;

			scrollTimerRef.current = window.setTimeout(() => {
				isScrollingRef.current = false;
			}, 100);
		},
		[checkIsAtBottom, isUserScrolled],
	);

	useEffect(() => {
		if (!isUserScrolled && !isScrollingRef.current && consoleLines.length > 0) {
			const timer = setTimeout(() => {
				requestAnimationFrame(() => {
					listRef.current?.scrollToItem(consoleLines.length - 1, "end");
				});
			}, 10);

			return () => clearTimeout(timer);
		}
	}, [consoleLines.length, isUserScrolled]);

	const scrollToBottom = useCallback(() => {
		setIsUserScrolled(false);
		setIsAtBottom(true);
		if (consoleLines.length > 0) {
			listRef.current?.scrollToItem(consoleLines.length - 1, "end");
		}
	}, [consoleLines.length]);

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

	const Row = useCallback(
		({ index, style }: { index: number; style: React.CSSProperties }) => {
			const text = consoleLines[index];
			const lineNumber = index + 1;
			const isEmpty = text.trim() === "";

			return (
				<div
					style={{
						...style,
						top: style.top,
						left: 0,
						right: 0,
					}}
					className="flex min-h-5 cursor-text items-center text-xs text-base-content hover:bg-base-200"
					onDoubleClick={() => handleLineDoubleClick(lineNumber)}
				>
					<span className="w-11 shrink-0 border-r border-base-300 bg-base-200 px-2 text-right font-mono text-[11px] leading-5 text-base-content/45">
						{lineNumber}
					</span>
					<span
						id={`console-line-${lineNumber}`}
						className={`min-w-0 flex-1 whitespace-pre px-3 font-mono leading-5 ${isEmpty ? "opacity-60" : ""}`}
					>
						{text || " "}
					</span>
				</div>
			);
		},
		[consoleLines, handleLineDoubleClick],
	);

	return (
		<div
			className="relative h-full min-h-0 overflow-hidden bg-base-100"
			ref={wrapperRef}
		>
			{consoleLines.length === 0 ? (
				<div className="flex h-full items-center justify-center text-sm text-base-content/45">
					出力待機
				</div>
			) : (
				<>
					<div className="h-full">
						<FixedSizeList
							ref={listRef}
							height={listHeight}
							width="100%"
							itemCount={consoleLines.length}
							itemSize={20}
							className="scrollbar-thin"
							onScroll={handleScroll}
							overscanCount={5}
						>
							{Row}
						</FixedSizeList>
					</div>

					<button
						aria-label={isAtBottom ? "追従中" : "最下部に移動して追従"}
						className={`absolute right-4 bottom-4 inline-flex h-9 w-9 items-center justify-center rounded-full border shadow-lg transition-colors ${
							isAtBottom
								? "border-primary bg-primary text-primary-content"
								: "border-base-300 bg-base-200 text-base-content hover:bg-base-300"
						}`}
						type="button"
						onClick={scrollToBottom}
					>
						<ArrowDown size={18} />
					</button>
				</>
			)}
		</div>
	);
};

export default ConsoleBox;
