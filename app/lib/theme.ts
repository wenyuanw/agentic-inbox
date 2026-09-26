export type ThemePreference = "light" | "dark" | "system";
export type ColorMode = "light" | "dark";

export const THEME_STORAGE_KEY = "agentic-inbox-theme";

export function parseThemePreference(value: string | null): ThemePreference {
	return value === "light" || value === "dark" ? value : "system";
}

export function resolveColorMode(
	preference: ThemePreference,
	systemDark: boolean,
): ColorMode {
	return preference === "system" ? (systemDark ? "dark" : "light") : preference;
}

// Runs before styles load so a saved dark theme never flashes a light page.
// Keep this self-contained: it also covers the loading and error screens.
export const themeBootstrapScript = `(() => {
	let preference = "system";
	try { const saved = localStorage.getItem("${THEME_STORAGE_KEY}"); if (saved === "light" || saved === "dark") preference = saved; } catch {}
	document.documentElement.dataset.mode = preference === "system" ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : preference;
})();`;
