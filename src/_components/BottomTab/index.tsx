import clsx from "clsx";
import type React from "react";
import { useState } from "react";
import ConsoleBox from "../ConsoleBox";
import CustomExplorer from "../CustomExplorer";

import "./index.css";

interface TabbedExplorerConsoleProps {
	consoleText: string;
}

const TabbedExplorerConsole: React.FC<TabbedExplorerConsoleProps> = ({
	consoleText,
}) => {
	const [activeTab, setActiveTab] = useState<"explorer" | "console">(
		"explorer",
	);

	return (
		<div className="bottom-tab-container">
			<div className="bottom-tab-buttons">
				<button
					className={clsx("tabButton", activeTab === "explorer" && "active")}
					onClick={() => setActiveTab("explorer")}
				>
					エクスプローラー
				</button>
				<button
					className={clsx("tabButton", activeTab === "console" && "active")}
					onClick={() => setActiveTab("console")}
				>
					コンソール
				</button>
			</div>
			<div className="content-container">
				{activeTab === "explorer" ? (
					<CustomExplorer />
				) : (
					<ConsoleBox consoleText={consoleText} />
				)}
			</div>
		</div>
	);
};

export default TabbedExplorerConsole;
