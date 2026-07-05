import { ArrowDown } from "lucide-react";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { cn } from "../../utils/className";
import type { ConsoleLogState } from "./consoleLog";

interface ConsoleBoxProps {
	consoleLog: ConsoleLogState;
}

const ROW_HEIGHT_PX = 20;
const OVERSCAN_ROW_COUNT = 24;
const INITIAL_VISIBLE_ROW_COUNT = 120;

export default function ConsoleBox({ consoleLog }: ConsoleBoxProps) {
	const [isPinnedToBottom, setIsPinnedToBottom] = useState(true);
	const [viewport, setViewport] = useState({ scrollTop: 0, clientHeight: 0 });
	const scrollAreaRef = useRef<HTMLDivElement>(null);
	const lastScrollTopRef = useRef(0);
	const lineCount = consoleLog.lines.length;
	const visibleRowCount =
		viewport.clientHeight === 0
			? INITIAL_VISIBLE_ROW_COUNT
			: Math.ceil(viewport.clientHeight / ROW_HEIGHT_PX) +
				OVERSCAN_ROW_COUNT * 2;
	const startIndex = Math.max(
		0,
		Math.floor(viewport.scrollTop / ROW_HEIGHT_PX) - OVERSCAN_ROW_COUNT,
	);
	const endIndex = Math.min(lineCount, startIndex + visibleRowCount);
	const visibleLines = consoleLog.lines.slice(startIndex, endIndex);
	const topSpacerHeight = startIndex * ROW_HEIGHT_PX;
	const bottomSpacerHeight = (lineCount - endIndex) * ROW_HEIGHT_PX;

	const updateLastScrollTop = useCallback(() => {
		const scrollArea = scrollAreaRef.current;
		if (!scrollArea) {
			return;
		}
		lastScrollTopRef.current = scrollArea.scrollTop;
	}, []);

	const updateViewport = useCallback(() => {
		const scrollArea = scrollAreaRef.current;
		if (!scrollArea) {
			return;
		}
		setViewport({
			scrollTop: scrollArea.scrollTop,
			clientHeight: scrollArea.clientHeight,
		});
	}, []);

	const scrollToBottom = useCallback(() => {
		const scrollArea = scrollAreaRef.current;
		if (!scrollArea) {
			return;
		}
		scrollArea.scrollTop = scrollArea.scrollHeight;
		updateLastScrollTop();
		updateViewport();
	}, [updateLastScrollTop, updateViewport]);

	useLayoutEffect(() => {
		updateViewport();
		if (!isPinnedToBottom) {
			return;
		}
		if (lineCount === 0) {
			return;
		}
		scrollToBottom();
	}, [isPinnedToBottom, lineCount, scrollToBottom, updateViewport]);

	const handleScroll = () => {
		const scrollArea = scrollAreaRef.current;
		if (!scrollArea) {
			return;
		}
		const distanceFromBottom =
			scrollArea.scrollHeight - scrollArea.scrollTop - scrollArea.clientHeight;
		const isAtBottom = distanceFromBottom < 8;
		const isScrollingUp = scrollArea.scrollTop < lastScrollTopRef.current;

		if (isAtBottom) {
			setIsPinnedToBottom(true);
		} else if (isScrollingUp) {
			setIsPinnedToBottom(false);
		}
		updateLastScrollTop();
		updateViewport();
	};

	const handleFollowButtonClick = () => {
		setIsPinnedToBottom(true);
		scrollToBottom();
	};

	if (consoleLog.lines.length === 0) {
		return <div className="h-full min-h-0 bg-base-100" />;
	}

	return (
		<div className="relative h-full min-h-0 bg-base-100">
			<div
				ref={scrollAreaRef}
				className="h-full overflow-auto py-2 font-mono text-xs leading-5"
				onScroll={handleScroll}
			>
				{consoleLog.truncatedLineCount > 0 ? (
					<div className="h-5 px-3 text-base-content/45">
						古いログ{consoleLog.truncatedLineCount}行を省略
					</div>
				) : null}
				<div style={{ height: topSpacerHeight }} />
				{visibleLines.map((line) => (
					<div
						key={line.id}
						className="grid h-5 grid-cols-[42px_minmax(0,1fr)] text-base-content hover:bg-base-200"
					>
						<span className="border-r border-base-300 px-2 text-right text-base-content/40">
							{line.lineNumber}
						</span>
						<span className="min-w-0 whitespace-pre px-3">
							{line.text || " "}
						</span>
					</div>
				))}
				<div style={{ height: bottomSpacerHeight }} />
			</div>
			<button
				aria-label="最下部に移動"
				aria-pressed={isPinnedToBottom}
				className={cn(
					"btn btn-sm absolute right-3 bottom-3 h-9 min-h-9 w-9 rounded-full p-0 shadow",
					isPinnedToBottom
						? "btn-primary"
						: "btn-ghost bg-base-200 hover:bg-base-300",
				)}
				type="button"
				onClick={handleFollowButtonClick}
			>
				<ArrowDown size={16} />
			</button>
		</div>
	);
}
