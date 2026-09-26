// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

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
	CheckCircleIcon,
	CircleIcon,
	EnvelopeIcon,
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
			<div className="mx-auto max-w-lg px-4 py-10 md:py-16">
				<div className="flex justify-end mb-6">
					<LanguageSelect />
				</div>
				<div className="text-center mb-8">
					<div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-kumo-base border border-kumo-line mb-4">
						<EnvelopeIcon size={28} className="text-kumo-default" />
					</div>
					<h1 className="text-2xl font-normal text-kumo-default">
						{t("Set up your domain email")}
					</h1>
					<p className="text-sm text-kumo-subtle mt-2 max-w-sm mx-auto">
						{t(
							"Enter your Cloudflare and Resend API keys to configure incoming email routing and verify your sending domain automatically.",
						)}
					</p>
				</div>

				{/* Progress indicator */}
				<div className="flex items-center justify-center gap-2 mb-8">
					{(["credentials", "configure", "complete"] as WizardStep[]).map(
						(step, i) => (
							<div key={step} className="flex items-center gap-2">
								<div
									className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold ${
										wizardStep === step
											? "bg-kumo-brand text-kumo-inverse"
											: ["credentials", "configure", "complete"].indexOf(
														wizardStep,
												  ) > i
												? "bg-green-100 text-green-700"
												: "bg-kumo-fill text-kumo-subtle"
									}`}
								>
									{i + 1}
								</div>
								{i < 2 && <div className="w-8 h-px bg-kumo-line" />}
							</div>
						),
					)}
				</div>

				<div className="mail-setup-card rounded-xl border border-kumo-line bg-kumo-base p-6">
					{wizardStep === "credentials" && (
						<form onSubmit={handleValidate} className="space-y-5">
							<div>
								<h2 className="text-base font-semibold text-kumo-default mb-1">
									{t("API credentials")}
								</h2>
								<p className="text-sm text-kumo-subtle mb-4">
									{t(
										"The Cloudflare token is used only for this setup and is not saved. The Resend key is stored encrypted for sending emails.",
									)}
								</p>
							</div>

							<Input
								label={t("Cloudflare API Token")}
								type="password"
								placeholder={t(
									"Create in Cloudflare Dashboard → My Profile → API Tokens",
								)}
								size="sm"
								value={cfToken}
								onChange={(e) => setCfToken(e.target.value)}
								required
							/>
							<p className="text-xs text-kumo-subtle -mt-3">
								{t(
									"Required permissions: Zone DNS Edit, Email Routing Rules Edit",
								)}
							</p>

							<Input
								label={t("Resend API Key")}
								type="password"
								placeholder="re_..."
								size="sm"
								value={resendKey}
								onChange={(e) => setResendKey(e.target.value)}
								required
							/>

							<Input
								label={t("Domain")}
								placeholder="example.com"
								size="sm"
								value={domain}
								onChange={(e) => setDomain(e.target.value)}
								required
							/>
							<p className="text-xs text-kumo-subtle -mt-3">
								{t("Your domain must be hosted on Cloudflare")}
							</p>

							{validationError && (
								<Text variant="error" size="sm">
									{t(validationError)}
								</Text>
							)}

							<Button
								type="submit"
								variant="primary"
								className="w-full"
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

							<div className="flex gap-2">
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
								className="w-full"
								onClick={() => navigate("/")}
							>
								{t("Create your first mailbox")}
							</Button>
						</div>
					)}
				</div>

				<p className="text-xs text-kumo-subtle text-center mt-6">
					{t("Free domain email powered by Cloudflare Email Routing + Resend")}
				</p>
			</div>
		</div>
	);
}
