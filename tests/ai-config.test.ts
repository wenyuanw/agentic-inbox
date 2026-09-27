import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_AI_MODEL } from "../shared/ai-config";
import {
	aiConfigStorageKey,
	getAIConfigView,
	normalizeAIBaseURL,
	resolveAIConfig,
	saveAIConfig,
} from "../workers/lib/ai-config";
import { fixture } from "./ai-fixture";

const mailbox = "support@example.com";
const input = {
	provider: "openai",
	model: "test-model",
	baseURL: "https://api.example.com/v1/",
	apiKey: "test-secret-do-not-expose",
} as const;

test("default configuration preserves Workers AI without any master key", async () => {
	const { env } = fixture();
	env.AI_CONFIG_ENCRYPTION_KEY = "";
	assert.deepEqual(await getAIConfigView(env, mailbox), {
		provider: "workers-ai",
		model: DEFAULT_AI_MODEL,
		baseURL: "",
		hasApiKey: false,
		encryptionReady: false,
	});
});

test("keys are encrypted, write-only and bound to their mailbox", async () => {
	const { env, objects } = fixture();
	const view = await saveAIConfig(env, mailbox, input);
	assert.equal(view.hasApiKey, true);
	assert.equal(view.baseURL, "https://api.example.com/v1");
	assert.ok(!JSON.stringify(view).includes(input.apiKey));
	const stored = objects.get(aiConfigStorageKey(mailbox))!;
	assert.ok(!stored.includes(input.apiKey));
	assert.equal((await resolveAIConfig(env, mailbox)).apiKey, input.apiKey);
	objects.set(aiConfigStorageKey("other@example.com"), stored);
	await assert.rejects(
		resolveAIConfig(env, "other@example.com"),
		/could not be decrypted/,
	);
});

test("empty keys preserve credentials only for the same provider and endpoint", async () => {
	const { env } = fixture();
	await saveAIConfig(env, mailbox, input);
	assert.equal(
		(
			await resolveAIConfig(env, mailbox, {
				...input,
				apiKey: "",
				model: "new-model",
			})
		).apiKey,
		input.apiKey,
	);
	await assert.rejects(
		resolveAIConfig(env, mailbox, {
			...input,
			apiKey: "",
			baseURL: "https://other.example.com/v1",
		}),
		/Enter an API key/,
	);
	await assert.rejects(
		resolveAIConfig(env, mailbox, {
			...input,
			apiKey: "",
			provider: "anthropic",
		}),
		/Enter an API key/,
	);
	await saveAIConfig(env, mailbox, {
		provider: "workers-ai",
		model: DEFAULT_AI_MODEL,
		baseURL: "",
	});
	assert.equal((await getAIConfigView(env, mailbox)).hasApiKey, false);
});

test("missing or rotated encryption keys fail without overwriting the saved configuration", async () => {
	const { env, objects } = fixture();
	env.AI_CONFIG_ENCRYPTION_KEY = "";
	await assert.rejects(
		saveAIConfig(env, mailbox, input),
		/Configure AI_CONFIG_ENCRYPTION_KEY/,
	);
	assert.equal(objects.size, 0);
	env.AI_CONFIG_ENCRYPTION_KEY = btoa("a".repeat(32));
	await saveAIConfig(env, mailbox, input);
	const before = objects.get(aiConfigStorageKey(mailbox));
	env.AI_CONFIG_ENCRYPTION_KEY = btoa("b".repeat(32));
	await assert.rejects(resolveAIConfig(env, mailbox), /could not be decrypted/);
	assert.equal(objects.get(aiConfigStorageKey(mailbox)), before);
	await saveAIConfig(env, mailbox, { ...input, apiKey: "replacement-key" });
	assert.equal((await resolveAIConfig(env, mailbox)).apiKey, "replacement-key");
});

test("rejects invalid providers, control characters and unsafe credential recipients", async () => {
	const { env } = fixture();
	for (const url of [
		"http://api.example.com/v1",
		"https://user:pass@api.example.com",
		"https://api.example.com?key=x",
		"https://api.example.com#x",
		"https://127.0.0.1",
		"https://0x7f000001",
		"https://10.0.0.1",
		"https://172.16.0.1",
		"https://192.168.1.2",
		"https://[::1]",
		"https://localhost",
		"https://host.internal",
	]) {
		assert.throws(() => normalizeAIBaseURL("openai", url));
	}
	await assert.rejects(
		resolveAIConfig(env, mailbox, { ...input, provider: "invalid" }),
		/Invalid AI settings/,
	);
	await assert.rejects(
		resolveAIConfig(env, mailbox, { ...input, apiKey: "bad\nkey" }),
		/Invalid AI settings/,
	);
	assert.equal(normalizeAIBaseURL("openai", ""), "https://api.openai.com/v1");
});
