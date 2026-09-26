import { EnvelopeSimpleIcon } from "@phosphor-icons/react";
import { Link } from "react-router";

export default function MailBrand() {
	return (
		<Link
			to="/"
			className="mail-brand"
			aria-label="Agentic Inbox — all mailboxes"
		>
			<span className="mail-brand-icon">
				<EnvelopeSimpleIcon size={30} weight="duotone" />
			</span>
			<span className="mail-brand-name">
				Inbox<span className="mail-brand-tag">agentic</span>
			</span>
		</Link>
	);
}
