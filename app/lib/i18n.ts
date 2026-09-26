import { FOLDER_DISPLAY_NAMES, getFolderDisplayName } from "shared/folders";
import { zh } from "~/locales/zh";

export type Locale = "en" | "zh";
export type TranslationValues = Record<string, string | number>;
export const LOCALE_STORAGE_KEY = "agentic-inbox-language";
export const localeTags = { en: "en-US", zh: "zh-CN" } as const;
const messages: Record<string, string> = zh;
// Existing setup responses contain Chinese labels. Recognized labels can also
// be displayed in English; unknown service errors retain their original detail.
const englishByChinese = new Map<string, string>(
	Object.entries(zh).map(([en, cn]) => [cn, en]),
);

// These are known status templates from the setup API, not email content.
const statusTemplates: [RegExp, string, string][] = [
	[
		/^Catch-all 已指向 Worker: (.+)$/,
		"Catch-all points to Worker: {worker}",
		"worker",
	],
	[/^Resend 域名: (.+)$/, "Resend domain: {domain}", "domain"],
	[/^已添加 (\d+) 条 DNS 记录$/, "{count} DNS records added", "count"],
];

export function resolveLocale(
	saved: string | null,
	browserLanguage: string,
): Locale {
	return saved === "en" || saved === "zh"
		? saved
		: browserLanguage.toLowerCase().startsWith("zh")
			? "zh"
			: "en";
}

function readPreference(): Locale {
	let saved: string | null = null;
	try {
		saved = localStorage.getItem(LOCALE_STORAGE_KEY);
	} catch {}
	return resolveLocale(saved, navigator.language);
}

export function getLocale(): Locale {
	if (typeof document === "undefined") return "en";
	const locale = document.documentElement.dataset.locale;
	return locale === "en" || locale === "zh" ? locale : readPreference();
}

const listeners = new Set<() => void>();
function applyLocale(locale: Locale) {
	document.documentElement.dataset.locale = locale;
	document.documentElement.lang = localeTags[locale];
	listeners.forEach((listener) => listener());
}

export function setLocale(locale: Locale) {
	try {
		localStorage.setItem(LOCALE_STORAGE_KEY, locale);
	} catch {}
	applyLocale(locale);
}

function onStorage(event: StorageEvent) {
	if (event.key === LOCALE_STORAGE_KEY || event.key === null)
		applyLocale(readPreference());
}

export function subscribeLocale(listener: () => void) {
	listeners.add(listener);
	if (listeners.size === 1) window.addEventListener("storage", onStorage);
	return () => {
		listeners.delete(listener);
		if (!listeners.size) window.removeEventListener("storage", onStorage);
	};
}

export function translate(
	message: string,
	values: TranslationValues = {},
	locale = getLocale(),
): string {
	let key = englishByChinese.get(message) || message;
	for (const [pattern, template, parameter] of statusTemplates) {
		const match = message.match(pattern);
		if (match) {
			key = template;
			values = { ...values, [parameter]: match[1] };
			break;
		}
	}
	const text =
		locale === "zh"
			? Object.hasOwn(messages, key)
				? messages[key]
				: message
			: key;
	return text.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
		values[name] === undefined ? placeholder : String(values[name]),
	);
}

export function getLocalizedFolderName(
	id: string,
	name: string | null | undefined,
	locale: Locale,
): string {
	return Object.hasOwn(FOLDER_DISPLAY_NAMES, id)
		? translate(FOLDER_DISPLAY_NAMES[id], {}, locale)
		: name || getFolderDisplayName(id);
}

export const localeBootstrapScript = `(() => {
	let saved = null;
	try { saved = localStorage.getItem("${LOCALE_STORAGE_KEY}"); } catch {}
	const locale = saved === "en" || saved === "zh" ? saved : navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en";
	document.documentElement.dataset.locale = locale;
	document.documentElement.lang = locale === "zh" ? "zh-CN" : "en-US";
})();`;
