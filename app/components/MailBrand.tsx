import { useI18n } from "~/hooks/useI18n";
import { EnvelopeSimpleIcon } from "@phosphor-icons/react";
import { Link } from "react-router";

export default function MailBrand() {
	const { t } = useI18n();

	return (
		<Link
			to="/"
			className="mail-brand"
			aria-label={t("Agentic Inbox — all mailboxes")}
		>
			<span className="mail-brand-icon">
				<EnvelopeSimpleIcon size={30} weight="duotone" />
			</span>
			<span className="mail-brand-name">
				{t("Inbox")}
				<span className="mail-brand-tag">agentic</span>
			</span>
		</Link>
	);
}
