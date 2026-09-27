import { useI18n } from "~/hooks/useI18n";
import MailLogo from "./MailLogo";
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
				<MailLogo size={40} />
			</span>
			<span className="mail-brand-name">
				{t("Inbox")}
				<span className="mail-brand-tag">agentic</span>
			</span>
		</Link>
	);
}
