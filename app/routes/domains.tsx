import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { CheckCircleIcon, GlobeIcon, PlusIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { Loader } from "@cloudflare/kumo";
import { useI18n } from "~/hooks/useI18n";
import MailBrand from "~/components/MailBrand";
import LanguageSelect from "~/components/LanguageSelect";
import { InstallAppButton } from "~/components/PWAProvider";
import { useSetupStatus } from "~/queries/setup";
import { queryKeys } from "~/queries/keys";
import api from "~/services/api";

export function meta() { return [{ title: "Domains — Agentic Inbox" }]; }
export default function DomainsRoute() {
	const { t } = useI18n();
	const status = useSetupStatus();
	const config = useQuery({ queryKey: queryKeys.config, queryFn: () => api.getConfig() });
	const domains = config.data?.domains.filter(domain => domain !== "example.com" || status.data?.domains.includes(domain)) ?? [];
	return <div className="mail-home-page">
		<header className="mail-home-brand"><MailBrand /><div className="mail-setup-header-actions"><InstallAppButton /><LanguageSelect /></div></header>
		<main className="mail-home-content">
			<Link className="mail-domain-back" to="/">{t("Back to mailboxes")}</Link>
			<div className="mail-domains-heading"><div><h1 className="mail-home-heading">{t("Mail domains")}</h1><p>{t("Each domain can have multiple mailboxes and its own sending credentials.")}</p></div><Link to="/setup" className="mail-primary-button"><PlusIcon size={18} />{t("Add domain")}</Link></div>
			{status.isLoading || config.isLoading ? <div className="mail-domains-empty"><Loader /></div> : status.isError || config.isError ? <div className="mail-domains-empty"><p>{t("Couldn't load domains")}</p><button className="mail-primary-button" onClick={() => { void status.refetch(); void config.refetch(); }}>{t("Try again")}</button></div> : domains.length ? <div className="mail-domain-list">{domains.map(domain => {
				const details = status.data?.domainConfigs.find(value => value.domain === domain);
				const ReceivingIcon = details?.routingConfigured ? CheckCircleIcon : WarningCircleIcon;
				const SendingIcon = details?.resendVerified ? CheckCircleIcon : WarningCircleIcon;
				return <section className="mail-domain-row" key={domain}>
					<GlobeIcon size={26} className="mail-domain-globe" aria-hidden="true" />
					<div className="mail-domain-info"><h2>{domain}</h2><div className="mail-domain-status">{details ? <><span><ReceivingIcon size={15} />{t(details.routingConfigured ? "Receiving configured" : "Receiving not configured")}</span><span><SendingIcon size={15} />{t(details.resendVerified ? "Sending verified" : "Sending not verified")}</span></> : <span>{t("Configured in environment")}</span>}</div></div>
					<Link className="mail-domain-back" to={`/setup?domain=${encodeURIComponent(domain)}&reconfigure=1`}>{t("Reconfigure")}</Link>
				</section>;
			})}</div> : <div className="mail-domains-empty"><GlobeIcon size={40} /><h2>{t("No domains configured")}</h2><p>{t("Add your first domain to start creating mailboxes.")}</p></div>}
		</main>
	</div>;
}
