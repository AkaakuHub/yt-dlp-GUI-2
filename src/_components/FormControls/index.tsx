import type { ChangeEventHandler } from "react";

type AppInputProps = {
	value: string | number;
	onChange: ChangeEventHandler<HTMLInputElement>;
	placeholder?: string;
	type?: string;
	inputMode?: "numeric";
	disabled?: boolean;
};

export function AppInput({
	value,
	onChange,
	placeholder,
	type = "text",
	inputMode,
	disabled = false,
}: AppInputProps) {
	return (
		<input
			className="input input-bordered h-9 min-h-9 min-w-0 rounded-md bg-base-200 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
			value={value}
			onChange={onChange}
			placeholder={placeholder}
			type={type}
			inputMode={inputMode}
			disabled={disabled}
		/>
	);
}

type AppTextareaProps = {
	value: string;
	onChange: ChangeEventHandler<HTMLTextAreaElement>;
};

export function AppTextarea({ value, onChange }: AppTextareaProps) {
	return (
		<textarea
			className="textarea textarea-bordered h-20 min-h-20 resize-none rounded-md bg-base-200 font-mono text-xs break-all focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
			value={value}
			onChange={onChange}
		/>
	);
}
