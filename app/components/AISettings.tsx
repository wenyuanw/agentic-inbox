import { Button, Input, Loader } from "@cloudflare/kumo";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
	DEFAULT_AI_BASE_URLS,
	DEFAULT_AI_MODEL,
	type AIConfigInput,
	type AIProvider,
} from "shared/ai-config";
import { useI18n } from "~/hooks/useI18n";
import api from "~/services/api";

export default function AISettings({ mailboxId }: { mailboxId: string }) {
	const { t } = useI18n();
	const queryClient = useQueryClient();
	const queryKey = ["ai-config", mailboxId];
	const config = useQuery({
		queryKey,
		queryFn: () => api.getAIConfig(mailboxId),
	});
	const [fields, setFields] = useState<AIConfigInput>({
		provider: "workers-ai",
		model: DEFAULT_AI_MODEL,
		baseURL: "",
		apiKey: "",
	});
	const [feedback, setFeedback] = useState<{
		kind: "success" | "error";
		message: string;
		duration?: number;
	} | null>(null);
	useEffect(() => {
		if (config.data)
			setFields({
				provider: config.data.provider,
				model: config.data.model,
				baseURL: config.data.baseURL,
				apiKey: "",
			});
	}, [config.data]);

	const save = useMutation({
		mutationFn: () => api.saveAIConfig(mailboxId, fields),
		onSuccess: (data) => {
			queryClient.setQueryData(queryKey, data);
			setFields({
				provider: data.provider,
				model: data.model,
				baseURL: data.baseURL,
				apiKey: "",
			});
			setFeedback({
				kind: "success",
				message: "AI settings saved. New requests will use this configuration.",
			});
		},
		onError: (error) => setFeedback({ kind: "error", message: error.message }),
	});
	const test = useMutation({
		mutationFn: () => api.testAIConfig(mailboxId, fields),
		onSuccess: (result) =>
			setFeedback({
				kind: "success",
				message: "Connection and tool-calling test passed ({duration} ms).",
				duration: result.durationMs,
			}),
		onError: (error) => setFeedback({ kind: "error", message: error.message }),
	});
	const busy = save.isPending || test.isPending;
	const external = fields.provider !== "workers-ai";
	const sameEndpoint =
		config.data?.provider === fields.provider &&
		config.data.baseURL === fields.baseURL.trim().replace(/\/+$/, "");
	const hasSavedKey = sameEndpoint && config.data?.hasApiKey;
	const canTest =
		fields.model.trim() && (!external || fields.apiKey?.trim() || hasSavedKey);
	function change(patch: Partial<AIConfigInput>) {
		setFields((prev) => ({ ...prev, ...patch }));
		setFeedback(null);
	}
	function changeProvider(provider: AIProvider) {
		change({
			provider,
			baseURL: DEFAULT_AI_BASE_URLS[provider],
			model: provider === "workers-ai" ? DEFAULT_AI_MODEL : "",
			apiKey: "",
		});
	}

	return (
		<section
			className="rounded-lg border border-kumo-line bg-kumo-base p-5"
			aria-labelledby="ai-settings-title"
		>
			<h2 id="ai-settings-title" className="text-sm font-medium mb-2">
				{t("AI connection")}
			</h2>
			<p className="text-xs text-kumo-subtle mb-4">
				{t(
					"Choose the provider for this mailbox's assistant, automatic drafts and content checks. Use a model that supports tools.",
				)}
			</p>
			{config.isPending ? (
				<Loader />
			) : config.isError ? (
				<div role="alert" className="text-sm">
					<p>{t("Could not load AI settings.")}</p>
					<Button
						variant="secondary"
						size="sm"
						onClick={() => void config.refetch()}
					>
						{t("Retry")}
					</Button>
				</div>
			) : (
				<div className="space-y-4">
					<label className="block text-sm">
						<span className="block mb-2">{t("AI provider")}</span>
						<select
							aria-label={t("AI provider")}
							value={fields.provider}
							disabled={busy}
							onChange={(event) =>
								changeProvider(event.target.value as AIProvider)
							}
							className="w-full rounded-lg border border-kumo-line bg-kumo-base px-3 py-2 text-kumo-default"
						>
							<option value="workers-ai">Cloudflare Workers AI</option>
							<option value="openai">{t("OpenAI / compatible API")}</option>
							<option value="anthropic">Anthropic (Claude)</option>
							<option value="google">Google (Gemini)</option>
						</select>
					</label>
					<Input
						label={t("Model ID")}
						value={fields.model}
						placeholder={t("Enter the model ID from your provider")}
						disabled={busy}
						onChange={(event) => change({ model: event.target.value })}
					/>
					{external ? (
						<>
							<Input
								label="Base URL"
								type="url"
								value={fields.baseURL}
								disabled={busy}
								onChange={(event) => change({ baseURL: event.target.value })}
							/>
							<p className="text-xs text-kumo-subtle">
								{t(
									"Use the API base path, without /chat/completions or /messages. OpenAI-compatible services such as DeepSeek can use their own HTTPS endpoint.",
								)}
							</p>
							<Input
								label="API Key"
								type="password"
								autoComplete="new-password"
								value={fields.apiKey || ""}
								disabled={busy}
								placeholder={
									hasSavedKey
										? t("Key saved — leave empty to keep it")
										: t("Enter your API key")
								}
								onChange={(event) => change({ apiKey: event.target.value })}
							/>
							<p className="text-xs text-kumo-subtle">
								{t(
									"API keys are encrypted on the server and never returned to the browser. Changing the provider or Base URL requires a new key.",
								)}
							</p>
							<p className="text-xs text-kumo-subtle">
								{t(
									"Email content will be sent to the selected provider when AI features are used.",
								)}
							</p>
							{!config.data?.encryptionReady && (
								<p role="alert" className="text-xs text-red-500">
									{t(
										"Configure AI_CONFIG_ENCRYPTION_KEY on the server before saving an external API key.",
									)}
								</p>
							)}
						</>
					) : (
						<p className="text-xs text-kumo-subtle">
							{t(
								"Workers AI uses your Cloudflare binding; no API key is needed. Content checks keep using the built-in Llama models.",
							)}
						</p>
					)}
					{feedback && (
						<p
							role={feedback.kind === "error" ? "alert" : "status"}
							className={`text-sm ${feedback.kind === "error" ? "text-red-500" : "text-kumo-default"}`}
						>
							{t(feedback.message, { duration: feedback.duration ?? 0 })}
						</p>
					)}
					<div className="flex flex-wrap gap-2">
						<Button
							variant="secondary"
							size="sm"
							disabled={busy || !canTest}
							loading={test.isPending}
							onClick={() => test.mutate()}
						>
							{t("Test connection")}
						</Button>
						<Button
							variant="primary"
							size="sm"
							disabled={
								busy || !canTest || (external && !config.data?.encryptionReady)
							}
							loading={save.isPending}
							onClick={() => save.mutate()}
						>
							{t("Save AI settings")}
						</Button>
						<Button
							variant="ghost"
							size="sm"
							disabled={busy}
							onClick={() => changeProvider("workers-ai")}
						>
							{t("Use default Workers AI")}
						</Button>
					</div>
					<p className="text-xs text-kumo-subtle">
						{t(
							"Testing sends only a fixed test prompt and may incur a small API charge. Save separately to apply changes.",
						)}
					</p>
				</div>
			)}
		</section>
	);
}
