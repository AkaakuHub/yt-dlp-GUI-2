import { Clock, FileText, Settings2, Terminal } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import { AppInput } from "../../../shared/components/FormControls";
import type { DownloadParam, TimestampField } from "../domain/downloadForm";
import { PanelToggleButton } from "./PanelToggleButton";

type AdvancedDownloadPanelProps = {
	isOpen: boolean;
	param: DownloadParam;
	arbitraryCode: string;
	usesCodecId: boolean;
	usesSubtitleLang: boolean;
	usesArbitraryCode: boolean;
	onToggle: () => void;
	onParamChange: Dispatch<SetStateAction<DownloadParam>>;
	onArbitraryCodeChange: (value: string) => void;
	onValidateTimestamp: (field: TimestampField, value: string) => void;
	onExecuteArbitraryCode: () => void;
};

export function AdvancedDownloadPanel({
	isOpen,
	param,
	arbitraryCode,
	usesCodecId,
	usesSubtitleLang,
	usesArbitraryCode,
	onToggle,
	onParamChange,
	onArbitraryCodeChange,
	onValidateTimestamp,
	onExecuteArbitraryCode,
}: AdvancedDownloadPanelProps) {
	return (
		<div className="relative">
			<PanelToggleButton
				className="flex h-10 w-full items-center gap-2 rounded-md bg-base-100 px-3 text-left text-xs font-semibold ring-1 transition"
				icon={<Settings2 size={14} />}
				isOpen={isOpen}
				label="詳細設定"
				onClick={onToggle}
			/>
			{isOpen ? (
				<div className="absolute top-12 right-0 left-0 z-50 grid gap-3 rounded-lg border border-primary/20 bg-base-100 p-3 shadow-xl ring-1 ring-base-300">
					<div className="grid gap-2 md:grid-cols-4">
						<label className="grid gap-1">
							<span className="flex items-center gap-1 text-xs text-base-content/60">
								<Clock size={13} />
								開始
							</span>
							<AppInput
								className="w-full bg-base-200"
								value={param.start_time || ""}
								onChange={(event) => {
									const value = event.target.value;
									onParamChange((prev) => ({ ...prev, start_time: value }));
									onValidateTimestamp("start_time", value);
								}}
								placeholder="00:00:00"
								type="text"
							/>
						</label>
						<label className="grid gap-1">
							<span className="flex items-center gap-1 text-xs text-base-content/60">
								<Clock size={13} />
								終了
							</span>
							<AppInput
								className="w-full bg-base-200"
								value={param.end_time || ""}
								onChange={(event) => {
									const value = event.target.value;
									onParamChange((prev) => ({ ...prev, end_time: value }));
									onValidateTimestamp("end_time", value);
								}}
								placeholder="00:00:00"
								type="text"
							/>
						</label>
						<label className="grid gap-1 md:col-span-2">
							<span className="flex items-center gap-1 text-xs text-base-content/60">
								<FileText size={13} />
								出力ファイル名
							</span>
							<AppInput
								className="w-full bg-base-200"
								value={param.output_name || ""}
								onChange={(event) =>
									onParamChange((prev) => ({
										...prev,
										output_name: event.target.value,
									}))
								}
								placeholder="{i}で連番"
								type="text"
							/>
						</label>
						{usesCodecId ? (
							<label className="grid gap-1 md:col-span-2">
								<span className="text-xs text-base-content/60">
									コーデックID
								</span>
								<AppInput
									className="w-full bg-base-200"
									value={param.codec_id || ""}
									onChange={(event) =>
										onParamChange((prev) => ({
											...prev,
											codec_id: event.target.value,
										}))
									}
									type="text"
								/>
							</label>
						) : null}
						{usesSubtitleLang ? (
							<label className="grid gap-1 md:col-span-2">
								<span className="text-xs text-base-content/60">字幕言語</span>
								<AppInput
									className="w-full bg-base-200"
									value={param.subtitle_lang || ""}
									onChange={(event) =>
										onParamChange((prev) => ({
											...prev,
											subtitle_lang: event.target.value,
										}))
									}
									type="text"
								/>
							</label>
						) : null}
						{usesArbitraryCode ? (
							<label className="grid gap-1 md:col-span-4">
								<span className="flex items-center gap-1 text-xs text-base-content/60">
									<Terminal size={13} />
									任意コード
								</span>
								<AppInput
									className="w-full bg-base-200"
									value={arbitraryCode}
									onChange={(event) =>
										onArbitraryCodeChange(event.target.value)
									}
									onKeyDown={(event) => {
										if (event.key === "Enter") {
											onExecuteArbitraryCode();
										}
									}}
									type="text"
								/>
							</label>
						) : null}
					</div>
				</div>
			) : null}
		</div>
	);
}
