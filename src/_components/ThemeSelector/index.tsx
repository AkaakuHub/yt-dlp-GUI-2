import { Computer, DarkMode, LightMode } from "@mui/icons-material";
import type React from "react";
import { type ThemeMode, useTheme } from "../ThemeContext";
import "./index.css";

const ThemeSelector: React.FC = () => {
	const { themeMode, setThemeMode } = useTheme();

	const themes: { mode: ThemeMode; label: string; icon: React.ReactElement }[] =
		[
			{ mode: "light", label: "ライト", icon: <LightMode /> },
			{ mode: "dark", label: "ダーク", icon: <DarkMode /> },
			{ mode: "system", label: "システム", icon: <Computer /> },
		];

	return (
		<div className="theme-selector">
			<label className="theme-selector-label">テーマ</label>
			<div className="theme-options">
				{themes.map((theme) => (
					<button
						key={theme.mode}
						className={`theme-option ${themeMode === theme.mode ? "active" : ""}`}
						onClick={() => setThemeMode(theme.mode)}
						type="button"
					>
						<span className="theme-icon">{theme.icon}</span>
						<span className="theme-label">{theme.label}</span>
					</button>
				))}
			</div>
		</div>
	);
};

export default ThemeSelector;
