import { ArrowDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface ConsoleBoxProps {
	consoleText: string;
}

export default function ConsoleBox({ consoleText }: ConsoleBoxProps) {
	const [isPinnedToBottom, setIsPinnedToBottom] = useState(true);
	const scrollAreaRef = useRef<HTMLDivElement>(null);
	const lines = consoleText === "" ? [] : consoleText.split("\n");
	const lineCount = lines.length;

	useEffect(() => {
		if (!isPinnedToBottom) {
			return;
		}
		if (lineCount === 0) {
			return;
		}
		const scrollArea = scrollAreaRef.current;
		if (!scrollArea) {
			return;
		}
		scrollArea.scrollTop = scrollArea.scrollHeight;
	}, [isPinnedToBottom, lineCount]);

	const handleScroll = () => {
		const scrollArea = scrollAreaRef.current;
		if (!scrollArea) {
			return;
		}
		const distanceFromBottom =
			scrollArea.scrollHeight - scrollArea.scrollTop - scrollArea.clientHeight;
		setIsPinnedToBottom(distanceFromBottom < 8);
	};

	const scrollToBottom = () => {
		const scrollArea = scrollAreaRef.current;
		if (!scrollArea) {
			return;
		}
		scrollArea.scrollTop = scrollArea.scrollHeight;
		setIsPinnedToBottom(true);
	};

	if (lines.length === 0) {
		return (
			<div className="flex h-full min-h-0 items-center justify-center bg-base-100 text-sm text-base-content/45">
				出力待機
			</div>
		);
	}

	return (
		<div className="relative h-full min-h-0 bg-base-100">
			<div
				ref={scrollAreaRef}
				className="h-full overflow-auto py-2 font-mono text-xs leading-5"
				onScroll={handleScroll}
			>
				{lines.map((line, index) => (
					<div
						key={`${index}-${line}`}
						className="grid grid-cols-[42px_minmax(0,1fr)] text-base-content hover:bg-base-200"
					>
						<span className="border-r border-base-300 px-2 text-right text-base-content/40">
							{index + 1}
						</span>
						<span className="min-w-0 whitespace-pre px-3">{line || " "}</span>
					</div>
				))}
			</div>
			<button
				aria-label="最下部に移動"
				className="btn btn-primary btn-sm absolute right-3 bottom-3 h-9 min-h-9 w-9 rounded-full p-0 shadow"
				type="button"
				onClick={scrollToBottom}
			>
				<ArrowDown size={16} />
			</button>
		</div>
	);
}
