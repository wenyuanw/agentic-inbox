import { z } from "zod";
import {
	AI_PROVIDERS,
	DEFAULT_AI_BASE_URLS,
	DEFAULT_AI_MODEL,
	type AIConfigView,
	type AIProvider,
} from "../../shared/ai-config";
import type { Env } from "../types";

export class AIConfigError extends Error {}

export const AIConfigInputSchema = z
	.object({
		provider: z.enum(AI_PROVIDERS),
		model: z
			.string()
			.trim()
			.min(1)
			.max(200)
			.regex(/^[^\s\x00-\x1f\x7f]+$/),
		baseURL: z.string().trim().max(2048).default(""),
		apiKey: z
			.string()
			.trim()
			.max(16384)
			.regex(/^[^\x00-\x1f\x7f]*$/)
			.optional(),
	})
	.strict();

const StoredConfigSchema = AIConfigInputSchema.omit({ apiKey: true }).extend({
	encryptedKey: z.object({ iv: z.string(), data: z.string() }).optional(),
});
type StoredConfig = z.infer<typeof StoredConfigSchema>;
export type ResolvedAIConfig = Omit<StoredConfig, "encryptedKey"> & {
	apiKey?: string;
};

export function aiConfigStorageKey(mailboxId: string) {
	return `config/ai/${encodeURIComponent(mailboxId)}.json`;
}

// Custom endpoints are credential recipients. Reject URL credentials, query
// tokens, local/private addresses and redirects to a different recipient.
export function normalizeAIBaseURL(
	provider: AIProvider,
	value: string,
): string {
	if (provider === "workers-ai") return "";
	let url: URL;
	try {
		url = new URL(value || DEFAULT_AI_BASE_URLS[provider]);
	} catch {
		throw new AIConfigError(
			"Use a public HTTPS Base URL without credentials or query parameters.",
		);
	}
	const host = url.hostname.toLowerCase().replace(/\.$/, "");
	const privateHost =
		host === "localhost" ||
		!host.includes(".") ||
		/\.(localhost|local|internal|test|invalid)$/.test(host) ||
		/^(0|10|127|169\.254|192\.168)\./.test(host) ||
		/^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
		/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(host) ||
		host.startsWith("[");
	if (
		url.protocol !== "https:" ||
		url.username ||
		url.password ||
		url.search ||
		url.hash ||
		privateHost
	) {
		throw new AIConfigError(
			"Use a public HTTPS Base URL without credentials or query parameters.",
		);
	}
	return url.href.replace(/\/+$/, "");
}

function bytesToBase64(bytes: Uint8Array) {
	return btoa(String.fromCharCode(...bytes));
}
function base64ToBytes(value: string) {
	return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}

async function encryptionKey(env: Env): Promise<CryptoKey> {
	if (!env.AI_CONFIG_ENCRYPTION_KEY)
		throw new AIConfigError(
			"Configure AI_CONFIG_ENCRYPTION_KEY on the server before saving an external API key.",
		);
	let bytes: Uint8Array<ArrayBuffer>;
	try {
		bytes = base64ToBytes(env.AI_CONFIG_ENCRYPTION_KEY);
	} catch {
		throw new AIConfigError(
			"AI_CONFIG_ENCRYPTION_KEY must be a base64-encoded 32-byte key.",
		);
	}
	if (bytes.length !== 32)
		throw new AIConfigError(
			"AI_CONFIG_ENCRYPTION_KEY must be a base64-encoded 32-byte key.",
		);
	return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, [
		"encrypt",
		"decrypt",
	]);
}

async function encryptKey(env: Env, mailboxId: string, value: string) {
	const key = await encryptionKey(env);
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const data = await crypto.subtle.encrypt(
		{
			name: "AES-GCM",
			iv,
			additionalData: new TextEncoder().encode(mailboxId),
		},
		key,
		new TextEncoder().encode(value),
	);
	return { iv: bytesToBase64(iv), data: bytesToBase64(new Uint8Array(data)) };
}

async function decryptKey(
	env: Env,
	mailboxId: string,
	encrypted: NonNullable<StoredConfig["encryptedKey"]>,
) {
	const key = await encryptionKey(env);
	try {
		const data = await crypto.subtle.decrypt(
			{
				name: "AES-GCM",
				iv: base64ToBytes(encrypted.iv),
				additionalData: new TextEncoder().encode(mailboxId),
			},
			key,
			base64ToBytes(encrypted.data),
		);
		return new TextDecoder().decode(data);
	} catch {
		throw new AIConfigError(
			"The saved AI key could not be decrypted. Check the server encryption key or enter a new API key.",
		);
	}
}

export async function readStoredAIConfig(
	env: Env,
	mailboxId: string,
): Promise<StoredConfig> {
	const obj = await env.BUCKET.get(aiConfigStorageKey(mailboxId));
	if (!obj)
		return { provider: "workers-ai", model: DEFAULT_AI_MODEL, baseURL: "" };
	try {
		const config = StoredConfigSchema.parse(await obj.json());
		// Kimi K2.5 now aliases to a model that requires Workers Paid. Keep
		// mailboxes using the former default on a model available to Workers Free.
		if (
			config.provider === "workers-ai" &&
			config.model === "@cf/moonshotai/kimi-k2.5"
		) {
			return { ...config, model: DEFAULT_AI_MODEL };
		}
		return config;
	} catch {
		throw new AIConfigError(
			"The saved AI configuration is invalid. Save it again in Settings.",
		);
	}
}

export async function getAIConfigView(
	env: Env,
	mailboxId: string,
): Promise<AIConfigView> {
	const config = await readStoredAIConfig(env, mailboxId);
	let encryptionReady = false;
	try {
		await encryptionKey(env);
		encryptionReady = true;
	} catch {}
	return {
		provider: config.provider,
		model: config.model,
		baseURL: config.baseURL,
		hasApiKey: Boolean(config.encryptedKey),
		encryptionReady,
	};
}

export async function resolveAIConfig(
	env: Env,
	mailboxId: string,
	input?: unknown,
): Promise<ResolvedAIConfig> {
	const saved = await readStoredAIConfig(env, mailboxId);
	if (input === undefined) {
		return {
			provider: saved.provider,
			model: saved.model,
			baseURL: saved.baseURL,
			apiKey: saved.encryptedKey
				? await decryptKey(env, mailboxId, saved.encryptedKey)
				: undefined,
		};
	}
	const parsed = AIConfigInputSchema.safeParse(input);
	if (!parsed.success)
		throw new AIConfigError(
			"Invalid AI settings. Check the provider, model, Base URL and API key.",
		);
	const config = {
		...parsed.data,
		baseURL: normalizeAIBaseURL(parsed.data.provider, parsed.data.baseURL),
	};
	if (config.provider === "workers-ai")
		return { provider: config.provider, model: config.model, baseURL: "" };
	if (
		!config.apiKey &&
		saved.provider === config.provider &&
		saved.baseURL === config.baseURL &&
		saved.encryptedKey
	) {
		config.apiKey = await decryptKey(env, mailboxId, saved.encryptedKey);
	}
	if (!config.apiKey)
		throw new AIConfigError("Enter an API key for this provider and Base URL.");
	return config;
}

export async function saveAIConfig(
	env: Env,
	mailboxId: string,
	input: unknown,
): Promise<AIConfigView> {
	const config = await resolveAIConfig(env, mailboxId, input);
	const stored: StoredConfig = {
		provider: config.provider,
		model: config.model,
		baseURL: config.baseURL,
	};
	if (config.apiKey)
		stored.encryptedKey = await encryptKey(env, mailboxId, config.apiKey);
	await env.BUCKET.put(aiConfigStorageKey(mailboxId), JSON.stringify(stored), {
		httpMetadata: { contentType: "application/json" },
	});
	return getAIConfigView(env, mailboxId);
}
