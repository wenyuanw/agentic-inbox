import { GlobeIcon } from "@phosphor-icons/react";
import { useI18n } from "~/hooks/useI18n";
import type { Locale } from "~/lib/i18n";

export default function LanguageSelect() {
	const { t, locale, setLocale } = useI18n();
	return (
		<label className="mail-language-select">
			<GlobeIcon size={18} aria-hidden="true" />
			<select
				aria-label={t("Interface language")}
				value={locale}
				onChange={(event) => setLocale(event.target.value as Locale)}
			>
				<option value="zh">简体中文</option>
				<option value="en">English</option>
			</select>
		</label>
	);
}
