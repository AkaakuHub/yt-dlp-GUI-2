export type WebServerStatus = {
	running: boolean;
	address: string;
	phase: string;
	detail: string;
	error: string;
	updatedAtMs: number;
};

export type WebServerStatusView = {
	heading: string;
	detail: string;
	tone: "normal" | "error";
};

export const webServerStatusView = (
	status: WebServerStatus | null,
	serverPort: number,
): WebServerStatusView => {
	if (status === null) {
		return {
			heading: "Webサーバー状態を確認しています",
			detail: "",
			tone: "normal",
		};
	}
	if (status.error.length > 0) {
		return {
			heading: "Webサーバー起動失敗",
			detail: `${status.error}${statusDetailSuffix(status)}`,
			tone: "error",
		};
	}
	if (status.running) {
		return {
			heading: "Webサーバー起動中",
			detail: `待受:全ネットワーク:${serverPort}${statusDetailSuffix(status)}`,
			tone: "normal",
		};
	}
	return {
		heading: "Webサーバー停止中",
		detail: statusDetailSuffix(status).replace(/^ /, ""),
		tone: "normal",
	};
};

const statusDetailSuffix = (status: WebServerStatus): string => {
	const details = [webServerPhaseLabel(status.phase), status.detail]
		.filter((value) => value.length > 0)
		.join(" / ");
	const updatedAt = formatUpdatedAt(status.updatedAtMs);
	return [details, updatedAt]
		.filter((value) => value.length > 0)
		.map((value) => ` ${value}`)
		.join("");
};

const webServerPhaseLabel = (phase: string): string => {
	switch (phase) {
		case "starting":
			return "起動中";
		case "binding":
			return "ポート確認中";
		case "tls":
			return "HTTPS準備中";
		case "listening":
			return "待受中";
		case "restarting":
			return "再起動中";
		case "failed":
			return "失敗";
		default:
			return phase;
	}
};

const formatUpdatedAt = (updatedAtMs: number): string => {
	if (updatedAtMs <= 0) {
		return "";
	}
	return `更新:${new Date(updatedAtMs).toLocaleTimeString("ja-JP", {
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	})}`;
};
