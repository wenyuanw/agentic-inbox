import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { APICallError, generateText, tool, type LanguageModel } from "ai";
import { createWorkersAI } from "workers-ai-provider";
import { z } from "zod";
import type { Env } from "../types";
import {
	AIConfigError,
	normalizeAIBaseURL,
	resolveAIConfig,
	type ResolvedAIConfig,
} from "./ai-config";

export type AIPurpose = "assistant" | "scanner" | "verifier";

// Do not follow redirects with provider credentials. All calls have a timeout,
// including interactive streaming and automatic drafts.
const providerFetch: typeof fetch = (input, init) =>
	fetch(input, {
		...init,
		redirect: "error",
		signal: init?.signal
			? AbortSignal.any([init.signal, AbortSignal.timeout(60_000)])
			: AbortSignal.timeout(60_000),
	});

export function createConfiguredModel(
	env: Env,
	config: ResolvedAIConfig,
	purpose: AIPurpose = "assistant",
): LanguageModel {
	if (config.provider === "workers-ai") {
		const model =
			purpose === "scanner"
				? "@cf/meta/llama-3.1-8b-instruct-fast"
				: purpose === "verifier"
					? "@cf/meta/llama-4-scout-17b-16e-instruct"
					: config.model;
		return createWorkersAI({ binding: env.AI })(model);
	}
	if (!config.apiKey)
		throw new AIConfigError("Enter an API key for this provider and Base URL.");
	const options = {
		apiKey: config.apiKey,
		baseURL: normalizeAIBaseURL(config.provider, config.baseURL),
		fetch: providerFetch,
	};
	switch (config.provider) {
		case "openai":
			return createOpenAICompatible({
				...options,
				name: "custom-openai",
			}).chatModel(config.model);
		case "anthropic":
			return createAnthropic(options)(config.model);
		case "google":
			return createGoogleGenerativeAI(options)(config.model);
	}
}

export async function getAIModel(
	env: Env,
	mailboxId: string,
	purpose: AIPurpose = "assistant",
) {
	return createConfiguredModel(
		env,
		await resolveAIConfig(env, mailboxId),
		purpose,
	);
}

export function safeAIError(error: unknown): string {
	if (error instanceof AIConfigError) return error.message;
	if (APICallError.isInstance(error)) {
		if (error.statusCode === 401 || error.statusCode === 403)
			return "AI authentication failed. Check the API key and model access.";
		if (error.statusCode === 429)
			return "AI rate limit or quota exceeded. Try again later.";
		if (error.statusCode === 404)
			return "AI model or endpoint was not found. Check the model and Base URL.";
	}
	return "The AI request failed. Check the provider, model and Base URL, then retry.";
}

export async function testAIConnection(
	env: Env,
	mailboxId: string,
	input: unknown,
) {
	const config = await resolveAIConfig(env, mailboxId, input);
	const started = Date.now();
	const result = await generateText({
		model: createConfiguredModel(env, config),
		prompt:
			"Call connection_check with the value OK. This is a connectivity and tool-calling test. Do not generate any other content.",
		tools: {
			connection_check: tool({
				description: "Confirm the connection",
				inputSchema: z.object({ value: z.literal("OK") }),
			}),
		},
		toolChoice: { type: "tool", toolName: "connection_check" },
		maxOutputTokens: 512,
		maxRetries: 0,
		abortSignal: AbortSignal.timeout(20_000),
	});
	if (
		!result.toolCalls.some(
			(call) =>
				call.toolName === "connection_check" &&
				z.object({ value: z.literal("OK") }).safeParse(call.input).success,
		)
	) {
		throw new AIConfigError(
			"The model did not complete the tool-calling test. Choose a model that supports tools.",
		);
	}
	return { success: true, durationMs: Date.now() - started };
}
