import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useRef,
	useState,
} from "react";
import {
	parseThemePreference,
	resolveColorMode,
	THEME_STORAGE_KEY,
	type ColorMode,
	type ThemePreference,
} from "~/lib/theme";

interface ThemeContextValue {
	preference: ThemePreference;
	colorMode: ColorMode;
	setPreference: (preference: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
	const [preference, setPreferenceState] = useState<ThemePreference>("system");
	const [colorMode, setColorMode] = useState<ColorMode>(() =>
		typeof document !== "undefined" &&
		document.documentElement.dataset.mode === "dark"
			? "dark"
			: "light",
	);
	const preferenceRef = useRef<ThemePreference>("system");

	const applyPreference = useCallback((next: ThemePreference) => {
		preferenceRef.current = next;
		setPreferenceState(next);
		const mode = resolveColorMode(
			next,
			window.matchMedia("(prefers-color-scheme: dark)").matches,
		);
		document.documentElement.dataset.mode = mode;
		setColorMode(mode);
	}, []);

	useEffect(() => {
		let saved: ThemePreference = "system";
		try {
			saved = parseThemePreference(localStorage.getItem(THEME_STORAGE_KEY));
		} catch {
			// Theme switching still works when browser storage is unavailable.
		}
		applyPreference(saved);

		const media = window.matchMedia("(prefers-color-scheme: dark)");
		const onSystemChange = () => {
			if (preferenceRef.current === "system") applyPreference("system");
		};
		const onStorage = (event: StorageEvent) => {
			if (
				event.storageArea === localStorage &&
				(event.key === THEME_STORAGE_KEY || event.key === null)
			) {
				applyPreference(parseThemePreference(event.newValue));
			}
		};
		media.addEventListener("change", onSystemChange);
		window.addEventListener("storage", onStorage);
		return () => {
			media.removeEventListener("change", onSystemChange);
			window.removeEventListener("storage", onStorage);
		};
	}, [applyPreference]);

	const setPreference = useCallback(
		(next: ThemePreference) => {
			applyPreference(next);
			try {
				localStorage.setItem(THEME_STORAGE_KEY, next);
			} catch {
				// Keep the chosen theme for this session even if persistence is blocked.
			}
		},
		[applyPreference],
	);

	return (
		<ThemeContext.Provider value={{ preference, colorMode, setPreference }}>
			{children}
		</ThemeContext.Provider>
	);
}

export function useTheme() {
	const theme = useContext(ThemeContext);
	if (!theme) throw new Error("useTheme must be used within ThemeProvider");
	return theme;
}
