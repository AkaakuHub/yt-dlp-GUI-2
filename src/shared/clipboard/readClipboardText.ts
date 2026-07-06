import { readText } from "@tauri-apps/plugin-clipboard-manager";
import { isTauriRuntime } from "../backend/runtime";

export const readClipboardText = async (): Promise<string> => {
	if (isTauriRuntime()) {
		return (await readText()) || "";
	}
	if (!window.isSecureContext) {
		throw new Error("Web UIをHTTPSで開くとクリップボードを読めます。");
	}
	if (navigator.clipboard?.readText === undefined) {
		throw new Error("このブラウザではクリップボードを読めません。");
	}
	return await navigator.clipboard.readText();
};
