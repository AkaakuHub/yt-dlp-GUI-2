export interface ConsoleLine {
	id: number;
	lineNumber: number;
	text: string;
}

export interface ConsoleLogState {
	lines: ConsoleLine[];
	nextLineId: number;
	nextLineNumber: number;
	truncatedLineCount: number;
}

const MAX_CONSOLE_LINES = 5000;
const MAX_CONSOLE_LINE_CHARS = 4000;

export const createConsoleLogState = (): ConsoleLogState => ({
	lines: [],
	nextLineId: 1,
	nextLineNumber: 1,
	truncatedLineCount: 0,
});

export const appendConsoleOutput = (
	state: ConsoleLogState,
	output: string,
): ConsoleLogState => {
	if (output === "") {
		return state;
	}
	const outputLines =
		state.lines.length === 0 && state.truncatedLineCount === 0
			? output.trimStart().split("\n")
			: output.split("\n");
	const appendedLines = outputLines.map((line, index) => ({
		id: state.nextLineId + index,
		lineNumber: state.nextLineNumber + index,
		text:
			line.length > MAX_CONSOLE_LINE_CHARS
				? `${line.slice(0, MAX_CONSOLE_LINE_CHARS)}...`
				: line,
	}));
	const lines = [...state.lines, ...appendedLines];
	const overflowLineCount = Math.max(0, lines.length - MAX_CONSOLE_LINES);

	return {
		lines: overflowLineCount === 0 ? lines : lines.slice(overflowLineCount),
		nextLineId: state.nextLineId + appendedLines.length,
		nextLineNumber: state.nextLineNumber + appendedLines.length,
		truncatedLineCount: state.truncatedLineCount + overflowLineCount,
	};
};
