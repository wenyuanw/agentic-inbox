// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import MailBrand from "~/components/MailBrand";
import LanguageSelect from "~/components/LanguageSelect";
import { useI18n } from "~/hooks/useI18n";
import {
	Button,
	Input,
	Loader,
	Text,
	useKumoToastManager,
} from "@cloudflare/kumo";
import {
	ArrowSquareOutIcon,
	CheckCircleIcon,
	CircleIcon,
	GearIcon,
	WarningCircleIcon,
	XCircleIcon,
} from "@phosphor-icons/react";
import { type FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { useRunSetup, useSetupStatus, useValidateSetup } from "~/queries/setup";
import type { SetupStep } from "~/services/api";

export function meta() {
	return [{ title: "Setup — Agentic Inbox" }];
}

// Template format: Cloudflare Fundamentals /api/how-to/account-owned-token-template/.
// Email Routing uses the singular key, as in LeoColomb/dispoflare's token template.
const CLOUDFLARE_TOKEN_URL = `https://dash.cloudflare.com/profile/api-tokens?${new URLSearchParams({
	permissionGroupKeys: JSON.stringify([
		{ key: "zone", type: "read" },
		{ key: "dns", type: "edit" },
		{ key: "zone_settings", type: "edit" },
		{ key: "email_routing_rule", type: "edit" },
	]),
	accountId: "*",
	zoneId: "all",
	name: "Agentic Inbox Setup",
})}`;

type WizardStep = "credentials" | "configure" | "complete";

function StepIcon({ status }: { status: SetupStep["status"] }) {
	switch (status) {
		case "done":
			return (
				<CheckCircleIcon
					size={20}
					className="text-green-600 shrink-0"
					weight="fill"
				/>
			);
		case "running":
			return <Loader size="sm" />;
		case "error":
			return (
				<XCircleIcon
					size={20}
					className="text-red-600 shrink-0"
					weight="fill"
				/>
			);
		default:
			return <CircleIcon size={20} className="text-kumo-inactive shrink-0" />;
	}
}

export default function SetupRoute() {
	const { t } = useI18n();

	const navigate = useNavigate();
	const toastManager = useKumoToastManager();
	const { data: setupStatus, isLoading: statusLoading } = useSetupStatus();
	const validateSetup = useValidateSetup();
	const runSetup = useRunSetup();

	const [wizardStep, setWizardStep] = useState<WizardStep>("credentials");
	const [cfToken, setCfToken] = useState("");
	const [resendKey, setResendKey] = useState("");
	const [domain, setDomain] = useState("");
	const [validationError, setValidationError] = useState<string | null>(null);
	const [configSteps, setConfigSteps] = useState<SetupStep[]>([]);
	const [configError, setConfigError] = useState<string | null>(null);

	useEffect(() => {
		if (setupStatus?.completed) {
			navigate("/", { replace: true });
		}
	}, [setupStatus?.completed, navigate]);

	const handleValidate = async (e: FormEvent) => {
		e.preventDefault();
		setValidationError(null);
		if (!cfToken.trim() || !resendKey.trim() || !domain.trim()) {
			setValidationError(t("Please fill in all fields"));
			return;
		}
		try {
			const result = await validateSetup.mutateAsync({
				cloudflareToken: cfToken.trim(),
				resendApiKey: resendKey.trim(),
				domain: domain.trim(),
			});
			if (!result.valid) {
				const msgs = [
					!result.cloudflare.ok ? result.cloudflare.message : null,
					!result.resend.ok ? result.resend.message : null,
				].filter(Boolean);
				setValidationError(msgs.join("；") || t("Validation failed"));
				return;
			}
			toastManager.add({ title: t("Credentials verified") });
			setWizardStep("configure");
		} catch (err) {
			setValidationError(
				err instanceof Error ? t(err.message) : t("Validation request failed"),
			);
		}
	};

	const handleRunSetup = async () => {
		setConfigError(null);
		setConfigSteps([]);
		try {
			const result = await runSetup.mutateAsync({
				cloudflareToken: cfToken.trim(),
				resendApiKey: resendKey.trim(),
				domain: domain.trim(),
			});
			setConfigSteps(result.steps);
			if (result.success) {
				toastManager.add({ title: t("Domain email setup complete!") });
				setWizardStep("complete");
			} else {
				setConfigError(t(result.error || "Setup failed"));
			}
		} catch (err) {
			setConfigError(
				err instanceof Error ? t(err.message) : t("Setup request failed"),
			);
		}
	};

	if (statusLoading) {
		return (
			<div className="flex justify-center items-center min-h-screen">
				<Loader size="lg" />
			</div>
		);
	}

	return (
		<div className="mail-setup-page min-h-screen bg-kumo-recessed">
			<header className="mail-setup-header">
				<MailBrand />
				<LanguageSelect />
			</header>
			<main className="mail-setup-layout">
				<aside className="mail-setup-intro">
					<h1>{t("Set up your domain email")}</h1>
					<p>{t("Connect your domain to send and receive email.")}</p>
					<ol className="mail-setup-steps" aria-label={t("Set up your domain email")}>
						{(["credentials", "configure", "complete"] as WizardStep[]).map((step, i) => {
							const currentIndex = ["credentials", "configure", "complete"].indexOf(wizardStep);
							return <li key={step} className={wizardStep === step ? "is-current" : currentIndex > i ? "is-done" : ""} aria-current={wizardStep === step ? "step" : undefined}>
								<span className="mail-setup-step-number">{currentIndex > i ? <CheckCircleIcon size={20} /> : i + 1}</span>
								<span>{t(["API credentials", "Automatic configuration", "Setup complete"][i])}</span>
							</li>;
						})}
					</ol>
				</aside>
				<div className="mail-setup-card">
					{wizardStep === "credentials" && (
						<form onSubmit={handleValidate} className="space-y-5">
							<div>
								<h2 className="text-base font-semibold text-kumo-default mb-1">
									{t("API credentials")}
								</h2>
							</div>

							<Input
								label={t("Cloudflare API Token")}
								type="password"
								placeholder={t("Paste your token")}
								size="sm"
								value={cfToken}
								onChange={(e) => setCfToken(e.target.value)}
								required
							/>
							<div className="mail-setup-field-help">
								<a href={CLOUDFLARE_TOKEN_URL} target="_blank" rel="noopener noreferrer">{t("Create Cloudflare Token")} <ArrowSquareOutIcon size={14} aria-hidden="true" /></a>
								<span>{t("Select only your domain")}</span>
								<details><summary>{t("Required permissions")}</summary><p>{t("Required permissions: Zone Read, DNS Edit, Zone Settings Edit, Email Routing Rules Edit")}</p><p>{t("Limit access to the domain you are configuring.")}</p></details>
							</div>

							<Input
								label={t("Resend API Key")}
								type="password"
								placeholder="re_..."
								size="sm"
								value={resendKey}
								onChange={(e) => setResendKey(e.target.value)}
								required
							/>

							<div className="mail-setup-field-help">
								<a href="https://resend.com/api-keys" target="_blank" rel="noopener noreferrer">{t("Get Resend API Key")} <ArrowSquareOutIcon size={14} aria-hidden="true" /></a>
								<span>{t("Choose Full Access")}</span>
							</div>

							<Input
								label={t("Domain")}
								placeholder="example.com"
								size="sm"
								value={domain}
								onChange={(e) => setDomain(e.target.value)}
								required
							/>
							<details className="mail-setup-notes">
								<summary>{t("Setup notes")}</summary>
								<p>{t("Your domain must be hosted on Cloudflare")}</p>
								<p>{t("The Cloudflare token is used only for this setup and is not saved. The Resend key is saved in the mailbox service configuration for sending emails.")}</p>
							</details>

							{validationError && (
								<Text variant="error" size="sm">
									{t(validationError)}
								</Text>
							)}

							<Button
								type="submit"
								variant="primary"
								className="mail-setup-primary"
								loading={validateSetup.isPending}
							>
								{t("Validate and continue")}
							</Button>
						</form>
					)}

					{wizardStep === "configure" && (
						<div className="space-y-5">
							<div>
								<h2 className="text-base font-semibold text-kumo-default mb-1">
									{t("Automatic configuration")}
								</h2>
								<p className="text-sm text-kumo-subtle">
									{t("The following steps will be performed for {domain}:", {
										domain,
									})}
								</p>
								<ul className="text-sm text-kumo-subtle mt-3 space-y-1.5 list-disc list-inside">
									<li>{t("Enable Cloudflare Email Routing")}</li>
									<li>{t("Set a catch-all rule to forward to this Worker")}</li>
									<li>
										{t("Add the sending domain in Resend and configure DNS")}
									</li>
									<li>{t("Verify SPF / DKIM records")}</li>
								</ul>
							</div>

							{configSteps.length > 0 && (
								<div className="rounded-lg border border-kumo-line divide-y divide-kumo-line">
									{configSteps.map((step) => (
										<div
											key={step.id}
											className="flex items-start gap-3 px-4 py-3"
										>
											<StepIcon status={step.status} />
											<div className="min-w-0 flex-1">
												<div className="text-sm font-medium text-kumo-default">
													{t(step.label)}
												</div>
												{step.message && (
													<div
														className={`text-xs mt-0.5 ${
															step.status === "error"
																? "text-red-600"
																: "text-kumo-subtle"
														}`}
													>
														{t(step.message)}
													</div>
												)}
											</div>
										</div>
									))}
								</div>
							)}

							{configError && (
								<div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3">
									<WarningCircleIcon
										size={18}
										className="text-red-600 shrink-0 mt-0.5"
									/>
									<Text variant="error" size="sm">
										{t(configError)}
									</Text>
								</div>
							)}

							<div className="mail-setup-actions">
								<Button
									variant="secondary"
									className="flex-1"
									onClick={() => setWizardStep("credentials")}
									disabled={runSetup.isPending}
								>
									{t("Back")}
								</Button>
								<Button
									variant="primary"
									className="flex-1"
									icon={<GearIcon size={16} />}
									loading={runSetup.isPending}
									onClick={handleRunSetup}
								>
									{configSteps.length > 0 ? t("Retry setup") : t("Start setup")}
								</Button>
							</div>
						</div>
					)}

					{wizardStep === "complete" && (
						<div className="text-center space-y-5">
							<CheckCircleIcon
								size={48}
								className="text-green-600 mx-auto"
								weight="fill"
							/>
							<div>
								<h2 className="text-base font-semibold text-kumo-default">
									{t("Setup complete")}
								</h2>
								<p className="text-sm text-kumo-subtle mt-1">
									{t(
										"Receiving and sending are ready for {domain}. You can now create your mailbox.",
										{ domain },
									)}
								</p>
							</div>
							<Button
								variant="primary"
								className="mail-setup-primary"
								onClick={() => navigate("/")}
							>
								{t("Create your first mailbox")}
							</Button>
						</div>
					)}
				</div>

			</main>

		</div>
	);
}
