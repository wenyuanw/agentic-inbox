// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { useI18n } from "~/hooks/useI18n";
import {
	Badge,
	Button,
	Input,
	Loader,
	useKumoToastManager,
} from "@cloudflare/kumo";
import {
	RobotIcon,
	ArrowCounterClockwiseIcon,
	SunIcon,
	MoonIcon,
	DesktopIcon,
} from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { useMailbox, useUpdateMailbox } from "~/queries/mailboxes";
import { useTheme } from "~/components/ThemeProvider";
import type { ThemePreference } from "~/lib/theme";
import LanguageSelect from "~/components/LanguageSelect";

const themeOptions = [
	{
		value: "light",
		label: "Light",
		description: "A bright, familiar inbox",
		icon: SunIcon,
	},
	{
		value: "dark",
		label: "Dark",
		description: "Easy on the eyes at night",
		icon: MoonIcon,
	},
	{
		value: "system",
		label: "System",
		description: "Follow your device appearance",
		icon: DesktopIcon,
	},
] satisfies {
	value: ThemePreference;
	label: string;
	description: string;
	icon: typeof SunIcon;
}[];

// Placeholder shown in the textarea when no custom prompt is set.
// The authoritative default prompt lives in workers/agent/index.ts (DEFAULT_SYSTEM_PROMPT).
const PROMPT_PLACEHOLDER = `You are an email assistant that helps manage this inbox. You read emails, draft replies, and help organize conversations.\n\nWrite like a real person. Short, direct, flowing prose. Plain text only.\n\n(Leave empty to use the full built-in default prompt)`;

export default function SettingsRoute() {
	const { t } = useI18n();

	const { preference, setPreference } = useTheme();
	const { mailboxId } = useParams<{ mailboxId: string }>();
	const toastManager = useKumoToastManager();
	const { data: mailbox } = useMailbox(mailboxId);
	const updateMailboxMutation = useUpdateMailbox();

	const [displayName, setDisplayName] = useState("");
	const [agentPrompt, setAgentPrompt] = useState("");
	const [isSaving, setIsSaving] = useState(false);

	useEffect(() => {
		if (mailbox) {
			setDisplayName(mailbox.settings?.fromName || mailbox.name || "");
			setAgentPrompt(mailbox.settings?.agentSystemPrompt || "");
		}
	}, [mailbox]);

	const handleSave = async () => {
		if (!mailbox || !mailboxId) return;
		setIsSaving(true);
		const settings = {
			...mailbox.settings,
			fromName: displayName,
			agentSystemPrompt: agentPrompt.trim() || undefined,
		};
		try {
			await updateMailboxMutation.mutateAsync({ mailboxId, settings });
			toastManager.add({ title: t("Settings saved!") });
		} catch {
			toastManager.add({
				title: t("Failed to save settings"),
				variant: "error",
			});
		} finally {
			setIsSaving(false);
		}
	};

	const handleResetPrompt = () => {
		setAgentPrompt("");
	};

	if (!mailbox) {
		return (
			<div className="flex justify-center py-20">
				<Loader size="lg" />
			</div>
		);
	}

	const isCustomPrompt = agentPrompt.trim().length > 0;

	return (
		<div className="mail-settings-page">
			<h1 className="mail-settings-heading">{t("Settings")}</h1>

			<div className="space-y-6">
				<section className="mail-language-settings rounded-lg border border-kumo-line bg-kumo-base p-5">
					<div>
						<h2 className="text-sm font-medium mb-2">{t("Language")}</h2>
						<p className="text-xs text-kumo-subtle">
							{t(
								"Choose your interface language. Changes apply immediately and are saved on this browser.",
							)}
						</p>
					</div>
					<LanguageSelect />
				</section>
				<fieldset className="mail-appearance rounded-lg border border-kumo-line bg-kumo-base p-5">
					<legend className="sr-only">{t("Appearance")}</legend>
					<h2 className="text-sm font-medium mb-2">{t("Appearance")}</h2>
					<p className="text-xs text-kumo-subtle mb-4">
						{t(
							"Choose your theme. Changes apply immediately and are saved on this browser.",
						)}
					</p>
					<div className="mail-theme-options">
						{themeOptions.map(({ value, label, description, icon: Icon }) => (
							<label
								key={value}
								className={`mail-theme-option${preference === value ? " is-selected" : ""}`}
							>
								<input
									type="radio"
									name="theme"
									value={value}
									checked={preference === value}
									onChange={() => setPreference(value)}
								/>
								<Icon
									size={24}
									weight={preference === value ? "fill" : "regular"}
									aria-hidden="true"
								/>
								<span className="mail-theme-option-label">{t(label)}</span>
								<span className="mail-theme-option-description">
									{t(description)}
								</span>
							</label>
						))}
					</div>
				</fieldset>
				{/* Account */}
				<div className="rounded-lg border border-kumo-line bg-kumo-base p-5">
					<div className="text-sm font-medium text-kumo-default mb-4">
						{t("Account")}
					</div>
					<div className="space-y-3">
						<Input
							label={t("Display Name")}
							value={displayName}
							onChange={(e) => setDisplayName(e.target.value)}
						/>
						<Input
							label={t("Email")}
							type="email"
							value={mailbox.email}
							disabled
						/>
					</div>
				</div>

				{/* Agent System Prompt */}
				<div className="rounded-lg border border-kumo-line bg-kumo-base p-5">
					<div className="flex items-center justify-between mb-4">
						<div className="flex items-center gap-2">
							<RobotIcon
								size={16}
								weight="duotone"
								className="text-kumo-subtle"
							/>
							<span className="text-sm font-medium text-kumo-default">
								{t("AI Agent Prompt")}
							</span>
							{isCustomPrompt ? (
								<Badge variant="primary">{t("Custom")}</Badge>
							) : (
								<Badge variant="secondary">{t("Default")}</Badge>
							)}
						</div>
						{isCustomPrompt && (
							<Button
								variant="ghost"
								size="xs"
								icon={<ArrowCounterClockwiseIcon size={14} />}
								onClick={handleResetPrompt}
							>
								{t("Reset to default")}
							</Button>
						)}
					</div>
					<p className="text-xs text-kumo-subtle mb-3">
						{t(
							"Customize how the AI agent behaves for this mailbox. Leave empty to use the built-in default prompt.",
						)}
					</p>
					<textarea
						aria-label={t("AI Agent Prompt")}
						value={agentPrompt}
						onChange={(e) => setAgentPrompt(e.target.value)}
						placeholder={t(PROMPT_PLACEHOLDER)}
						rows={12}
						className="w-full resize-y rounded-lg border border-kumo-line bg-kumo-recessed px-3 py-2 text-xs text-kumo-default placeholder:text-kumo-subtle focus:outline-none focus:ring-1 focus:ring-kumo-ring font-mono leading-relaxed"
					/>
					<p className="text-xs text-kumo-subtle mt-2">
						{t(
							"The prompt is sent as the system message to the AI model. It controls the agent's personality, writing style, and behavior rules.",
						)}
					</p>
				</div>

				{/* Save */}
				<div className="flex justify-end">
					<Button variant="primary" onClick={handleSave} loading={isSaving}>
						{t("Save Changes")}
					</Button>
				</div>
			</div>
		</div>
	);
}
