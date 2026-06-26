import { invoke } from "@tauri-apps/api/core";
import { message } from "@tauri-apps/plugin-dialog";
import { relaunch } from "@tauri-apps/plugin-process";

const WINDOWS_OS_TYPE = "windows";

export const installAvailableUpdate = async (
	osType?: string,
): Promise<void> => {
	const currentOsType = osType || (await invoke<string>("get_os_type"));
	await invoke("install_available_update");
	if (currentOsType === WINDOWS_OS_TYPE) {
		return;
	}
	await message(
		"アップデートが完了しました。アプリケーションを再起動します。",
		{
			title: "アップデート完了",
			kind: "info",
		},
	);
	await relaunch();
};
