import { invoke } from "@tauri-apps/api/core";

export const installAvailableUpdate = async (): Promise<void> => {
	await invoke("install_available_update");
};
