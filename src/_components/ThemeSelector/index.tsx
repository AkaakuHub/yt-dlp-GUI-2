import { Laptop, Moon, Palette, Sun } from "lucide-react";
import type React from "react";
import { type ThemeMode, useTheme } from "../ThemeContext";

const ThemeSelector: React.FC = () => {
	const { themeMode, setThemeMode } = useTheme();

	const themes: { mode: ThemeMode; label: string; icon: React.ReactElement }[] =
		[
			{ mode: "light", label: "ライト", icon: <Sun size={16} /> },
			{ mode: "dark", label: "ダーク", icon: <Moon size={16} /> },
			{ mode: "system", label: "システム", icon: <Laptop size={16} /> },
		];

	return (
		<div className="grid min-w-0 gap-2">
			<label className="flex items-center gap-2 text-xs font-semibold text-base-content/65">
				<Palette size={14} className="text-primary" />
				テーマ
			</label>
			<div className="grid min-w-0 grid-cols-3 gap-2">
				{themes.map((theme) => (
					<button
						key={theme.mode}
						className={`btn h-9 min-h-9 min-w-0 rounded-md px-2 text-xs ${
							themeMode === theme.mode
								? "btn-primary"
								: "btn-ghost bg-base-100 text-base-content hover:bg-base-300"
						}`}
						onClick={() => setThemeMode(theme.mode)}
						type="button"
					>
						{theme.icon}
						<span className="whitespace-nowrap">{theme.label}</span>
					</button>
				))}
			</div>
		</div>
	);
};

export default ThemeSelector;
