import type {
	ChangeEventHandler,
	KeyboardEventHandler,
	ReactNode,
} from "react";

type AppInputProps = {
	value: string | number;
	onChange: ChangeEventHandler<HTMLInputElement>;
	placeholder?: string;
	type?: string;
	inputMode?: "numeric";
	disabled?: boolean;
	onKeyDown?: KeyboardEventHandler<HTMLInputElement>;
	className?: string;
};

export function AppInput({
	value,
	onChange,
	placeholder,
	type = "text",
	inputMode,
	disabled = false,
	onKeyDown,
	className = "",
}: AppInputProps) {
	return (
		<input
			className={`input input-bordered h-9 min-h-9 min-w-0 rounded-md border-base-300 bg-base-100 text-sm focus:border-primary focus:outline-none ${className}`}
			value={value}
			onChange={onChange}
			placeholder={placeholder}
			type={type}
			inputMode={inputMode}
			disabled={disabled}
			onKeyDown={onKeyDown}
		/>
	);
}

type AppTextareaProps = {
	value: string;
	onChange: ChangeEventHandler<HTMLTextAreaElement>;
	placeholder?: string;
	className?: string;
};

export function AppTextarea({
	value,
	onChange,
	placeholder,
	className = "",
}: AppTextareaProps) {
	return (
		<textarea
			className={`textarea textarea-bordered h-20 min-h-20 resize-none rounded-md border-base-300 bg-base-200 font-mono text-xs break-all focus:border-primary focus:outline-none ${className}`}
			value={value}
			onChange={onChange}
			placeholder={placeholder}
		/>
	);
}

type AppSelectProps = {
	value: string | number;
	onChange: ChangeEventHandler<HTMLSelectElement>;
	children: ReactNode;
	disabled?: boolean;
	className?: string;
};

export function AppSelect({
	value,
	onChange,
	children,
	disabled = false,
	className = "",
}: AppSelectProps) {
	return (
		<select
			className={`select select-bordered h-10 min-h-10 w-full rounded-md border-base-300 bg-base-200 text-sm focus:border-primary focus:outline-none ${className}`}
			disabled={disabled}
			value={value}
			onChange={onChange}
		>
			{children}
		</select>
	);
}
