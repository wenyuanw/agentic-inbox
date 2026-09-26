import { useMemo, useSyncExternalStore } from "react";
import {
	getLocale,
	getLocalizedFolderName,
	localeTags,
	setLocale,
	subscribeLocale,
	translate,
	type TranslationValues,
} from "~/lib/i18n";

export function useI18n() {
	// A fixed SSR snapshot keeps hydration consistent; the browser preference
	// is applied immediately afterwards without changing routes or email data.
	const locale = useSyncExternalStore(
		subscribeLocale,
		getLocale,
		() => "en" as const,
	);
	return useMemo(() => {
		const t = (message: string, values?: TranslationValues) =>
			translate(message, values, locale);
		return {
			locale,
			localeTag: localeTags[locale],
			setLocale,
			t,
			folderLabel: (id: string, name?: string | null) =>
				getLocalizedFolderName(id, name, locale),
			conversationCount: (count: number) =>
				t(count === 1 ? "{count} conversation" : "{count} conversations", {
					count,
				}),
		};
	}, [locale]);
}
