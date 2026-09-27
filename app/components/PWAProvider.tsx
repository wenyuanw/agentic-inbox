import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Dialog } from "@cloudflare/kumo";
import { DownloadSimpleIcon } from "@phosphor-icons/react";
import { useI18n } from "~/hooks/useI18n";

interface InstallPrompt extends Event {
	prompt(): Promise<void>;
	userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}
const PWAContext = createContext({ installed: false, install: () => {} });

export function InstallAppButton() {
	const { installed, install } = useContext(PWAContext);
	const { t } = useI18n();
	return installed ? null : <button type="button" className="mail-install-button" onClick={install}><DownloadSimpleIcon size={17} aria-hidden="true" />{t("Install app")}</button>;
}

export default function PWAProvider({ children }: { children: ReactNode }) {
	const { t } = useI18n();
	const promptRef = useRef<InstallPrompt | null>(null);
	const reloadRequested = useRef(false);
	const [installed, setInstalled] = useState(false);
	const [helpOpen, setHelpOpen] = useState(false);
	const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
	const [error, setError] = useState(false);
	useEffect(() => {
		const display = matchMedia("(display-mode: standalone)");
		const syncInstalled = () => setInstalled(display.matches || !!(navigator as Navigator & { standalone?: boolean }).standalone);
		syncInstalled();
		display.addEventListener("change", syncInstalled);
		const onPrompt = (event: Event) => { event.preventDefault(); promptRef.current = event as InstallPrompt; };
		const onInstalled = () => { promptRef.current = null; setInstalled(true); setHelpOpen(false); };
		window.addEventListener("beforeinstallprompt", onPrompt);
		window.addEventListener("appinstalled", onInstalled);
		let disposed = false;
		let registration: ServiceWorkerRegistration | undefined;
		let installing: ServiceWorker | null = null;
		const onState = () => { if (installing?.state === "installed" && navigator.serviceWorker.controller) setWaiting(registration?.waiting ?? null); };
		const onUpdate = () => { installing?.removeEventListener("statechange", onState); installing = registration?.installing ?? null; installing?.addEventListener("statechange", onState); };
		const onController = () => { if (reloadRequested.current) location.reload(); };
		const checkUpdate = () => { if (document.visibilityState === "visible") void registration?.update().catch(() => {}); };
		if ("serviceWorker" in navigator && window.isSecureContext) {
			navigator.serviceWorker.addEventListener("controllerchange", onController);
			void navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).then(value => {
				if (disposed) return;
				registration = value;
				setWaiting(value.waiting);
				value.addEventListener("updatefound", onUpdate);
				onUpdate();
			}).catch(() => { /* Installation remains browser-controlled if registration is unavailable. */ });
			document.addEventListener("visibilitychange", checkUpdate);
		}
		return () => {
			disposed = true;
			display.removeEventListener("change", syncInstalled);
			window.removeEventListener("beforeinstallprompt", onPrompt);
			window.removeEventListener("appinstalled", onInstalled);
			registration?.removeEventListener("updatefound", onUpdate);
			installing?.removeEventListener("statechange", onState);
			if ("serviceWorker" in navigator) navigator.serviceWorker.removeEventListener("controllerchange", onController);
			document.removeEventListener("visibilitychange", checkUpdate);
		};
	}, []);
	const install = async () => {
		setError(false);
		const prompt = promptRef.current;
		if (!prompt) { setHelpOpen(true); return; }
		promptRef.current = null;
		try { await prompt.prompt(); await prompt.userChoice; } catch { setError(true); setHelpOpen(true); }
	};
	return <PWAContext.Provider value={{ installed, install }}>
		{children}
		{waiting && <div className="mail-pwa-update" role="status"><span>{t("An app update is ready. Save your edits before refreshing.")}</span><button type="button" onClick={() => { reloadRequested.current = true; waiting.postMessage({ type: "SKIP_WAITING" }); }}>{t("Refresh")}</button><button type="button" onClick={() => setWaiting(null)}>{t("Later")}</button></div>}
		<Dialog.Root open={helpOpen} onOpenChange={setHelpOpen}>
			<Dialog size="sm" className="mail-dialog mail-install-dialog">
				<Dialog.Title className="mail-install-title">
					{t("Install Agentic Inbox")}
				</Dialog.Title>
				<div className="mail-install-help">
					<p>{t("On iPhone or iPad, open this site in Safari, tap Share, then Add to Home Screen.")}</p>
					<p>{t("On desktop or Android, use Install app or Add to Home Screen in your browser menu.")}</p>
					{error && <p className="mail-form-error" role="alert">{t("Installation could not start. Please try your browser menu.")}</p>}
				</div>
				<div className="mail-install-actions">
					<Dialog.Close className="mail-primary-button">{t("Got it")}</Dialog.Close>
				</div>
			</Dialog>
		</Dialog.Root>
	</PWAContext.Provider>;
}
