import { Laptop, Moon, Sun } from "lucide-react";
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
		<div className="grid gap-2">
			<label className="text-sm font-semibold text-base-content">テーマ</label>
			<div className="grid grid-cols-3 gap-2">
				{themes.map((theme) => (
					<button
						key={theme.mode}
						className={`btn h-10 min-h-10 rounded-md text-sm ${
							themeMode === theme.mode
								? "btn-primary"
								: "btn-ghost bg-base-100 text-base-content hover:bg-base-300"
						}`}
						onClick={() => setThemeMode(theme.mode)}
						type="button"
					>
						{theme.icon}
						<span>{theme.label}</span>
					</button>
				))}
			</div>
		</div>
	);
};

export default ThemeSelector;
