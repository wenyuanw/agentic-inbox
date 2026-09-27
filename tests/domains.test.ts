import assert from "node:assert/strict";
import test from "node:test";
import { getDomainConfig, listDomainConfigs, domainConfigKey, domainConfigView, normalizeDomain, encryptResendKey, resolveResendKey, saveDomainConfig } from "../workers/lib/domain-config";
import { getEffectiveDomains } from "../workers/lib/setup-config";
import { runSetup, getSetupStatus } from "../workers/lib/setup-service";
import { dispatchEmail } from "../workers/email-sender";
import { app, receiveEmail } from "../workers/index";
import type { Env } from "../workers/types";

function fixture() {
	const objects = new Map<string, string>();
	const deliveries: { mailbox: string; email: unknown }[] = [];
	const env = {
		DOMAINS: "example.com", EMAIL_ADDRESSES: [], WORKER_NAME: "inbox-test",
		AI_CONFIG_ENCRYPTION_KEY: btoa("a".repeat(32)),
		BUCKET: {
			get: async (key: string) => objects.has(key) ? { json: async () => JSON.parse(objects.get(key)!) } : null,
			head: async (key: string) => objects.has(key) ? {} : null,
			put: async (key: string, value: string) => { objects.set(key, value); },
			list: async ({ prefix }: { prefix: string }) => ({ objects: [...objects.keys()].filter(key => key.startsWith(prefix)).map(key => ({ key })), truncated: false }),
		},
		MAILBOX: { idFromName: (name: string) => name, get: (mailbox: string) => ({ getFolders: async () => [], findThreadBySubject: async () => null, createEmail: async (_folder: string, email: unknown) => { deliveries.push({ mailbox, email }); } }) },
		EMAIL_AGENT: { idFromName: (name: string) => name, get: () => ({ fetch: async () => new Response("ok") }) },
		EMAIL: { send: async () => ({ messageId: "cloudflare-message" }) },
	} as unknown as Env;
	return { env, objects, deliveries };
}
function mockProviders(failDomain?: string) {
	const calls: { url: string; key: string; method: string; body?: string }[] = [];
	const original = globalThis.fetch;
	globalThis.fetch = async (input, init) => {
		const url = new URL(String(input));
		const key = new Headers(init?.headers).get("Authorization") ?? "";
		const method = init?.method ?? "GET";
		calls.push({ url: url.href, key, method, body: init?.body as string });
		if (url.hostname === "api.cloudflare.com") {
			if (url.pathname.endsWith("/tokens/verify")) { assert.equal(method, "GET"); return Response.json({ success: true, result: { status: "active" } }); }
			if (url.pathname.endsWith("/zones")) return Response.json({ success: true, result: [{ id: url.searchParams.get("name"), name: url.searchParams.get("name") }] });
			if (url.pathname.includes(failDomain ?? "NEVER")) return Response.json({ success: false, errors: [{ message: "Routing failed" }] }, { status: 400 });
			if (url.pathname.endsWith("/email/routing/dns") && method === "POST") {
				const zoneName = url.pathname.split("/")[4];
				const body = init?.body ? JSON.parse(String(init.body)) : {};
				if (body.name === zoneName) return Response.json({ success: false, errors: [{ code: 1001, message: `Invalid Input: must be a subdomains of ${zoneName}` }] }, { status: 400 });
			}
			return Response.json({ success: true, result: {} });
		}
		assert.equal(url.hostname, "api.resend.com");
		const domain = key.replace("Bearer re_", "");
		if (url.pathname === "/emails") return Response.json({ id: `message-${domain}` });
		const record = { id: domain, name: domain, status: "verified", records: [] };
		return Response.json(url.pathname === "/domains" ? { data: [record] } : record);
	};
	return { calls, restore: () => { globalThis.fetch = original; } };
}
function input(domain: string, reconfigure = false) { return { domain, cloudflareToken: "cf-test", resendApiKey: `re_${domain}`, workerName: "inbox-test", reconfigure }; }

test("apex domain setup enables Email Routing without a subdomain name", async () => {
	const { env } = fixture();
	const mock = mockProviders();
	try {
		const result = await runSetup(env, input("wenyuanw.me"));
		assert.equal(result.success, true, result.error);
		assert.equal(result.steps.find(step => step.id === "routing")?.status, "done");
		const call = mock.calls.find(call => call.url.endsWith("/zones/wenyuanw.me/email/routing/dns"));
		assert.equal(call?.method, "POST");
		assert.ok(!Object.hasOwn(JSON.parse(call?.body || "{}"), "name"));
	} finally { mock.restore(); }
});

test("multiple domains are stored independently, encrypted and publicly redacted", async () => {
	const { env, objects } = fixture(); const mock = mockProviders();
	try {
		assert.equal((await runSetup(env, input("alpha.example"))).success, true);
		const first = objects.get(domainConfigKey("alpha.example"));
		assert.equal((await runSetup(env, input("beta.example"))).success, true);
		assert.equal(objects.get(domainConfigKey("alpha.example")), first);
		assert.deepEqual(await getEffectiveDomains(env), ["alpha.example", "beta.example"]);
		assert.ok(![...objects.values()].join("").includes("re_alpha.example"));
		const status = await getSetupStatus(env); assert.equal(status.completed, true); assert.equal(status.domainConfigs.length, 2);
		assert.ok(!JSON.stringify(status).includes("encryptedResendKey")); assert.ok(!JSON.stringify(status).includes("re_alpha.example"));
		assert.equal(await resolveResendKey(env, (await getDomainConfig(env, "alpha.example"))!), "re_alpha.example");
	} finally { mock.restore(); }
});
test("concurrent additions cannot overwrite other domain configs", async () => {
	const { env } = fixture(); const mock = mockProviders();
	try { const results = await Promise.all([runSetup(env, input("one.example")), runSetup(env, input("two.example"))]); assert.ok(results.every(result => result.success)); assert.equal((await listDomainConfigs(env)).length, 2); } finally { mock.restore(); }
});
test("adding a duplicate is rejected and a failed reconfiguration keeps the saved key", async () => {
	const { env, objects } = fixture(); let mock = mockProviders();
	try {
		await runSetup(env, input("alpha.example")); const saved = objects.get(domainConfigKey("alpha.example")); const count = mock.calls.length;
		assert.equal((await runSetup(env, input("alpha.example"))).success, false); assert.equal(mock.calls.length, count);
		mock.restore(); mock = mockProviders("alpha.example");
		assert.equal((await runSetup(env, input("alpha.example", true))).success, false); assert.equal(objects.get(domainConfigKey("alpha.example")), saved);
	} finally { mock.restore(); }
});
test("legacy config still sends and coexists with new domain configs", async () => {
	const { env, objects } = fixture(); const mock = mockProviders();
	objects.set("config/setup.json", JSON.stringify({ completed: true, domains: ["legacy.example"], sendProvider: "resend", resendApiKey: "re_legacy.example", routingConfiguredAt: "today", resendVerifiedAt: "today" }));
	try {
		await runSetup(env, input("new.example")); assert.deepEqual(await getEffectiveDomains(env), ["legacy.example", "new.example"]);
		await dispatchEmail(env, { from: "hello@legacy.example", to: "owner@example.net", subject: "Test" });
		await dispatchEmail(env, { from: { email: "hello@new.example", name: "Test" }, to: "owner@example.net", subject: "Test" });
		assert.deepEqual(mock.calls.filter(call => call.url.endsWith("/emails")).map(call => call.key), ["Bearer re_legacy.example", "Bearer re_new.example"]);
	} finally { mock.restore(); }
});
test("reconfiguration replaces only its domain key and retains mixed providers", async () => {
	const { env, objects } = fixture();
	await saveDomainConfig(env, {
		domain: "alpha.example", sendProvider: "resend",
		encryptedResendKey: await encryptResendKey(env, "alpha.example", "re_old"),
	});
	await saveDomainConfig(env, { domain: "other.example", sendProvider: "cloudflare" });
	const other = objects.get(domainConfigKey("other.example"));
	const mock = mockProviders();
	try {
		assert.equal((await runSetup(env, input("alpha.example", true))).success, true);
		assert.equal(await resolveResendKey(env, (await getDomainConfig(env, "alpha.example"))!), "re_alpha.example");
		assert.equal(objects.get(domainConfigKey("other.example")), other);
		assert.equal((await getSetupStatus(env)).sendProvider, undefined);
		assert.equal((await dispatchEmail(env, { from: "hi@other.example", to: "owner@example.net", subject: "Test" })).messageId, "cloudflare-message");
		assert.equal(mock.calls.filter(call => call.url.endsWith("/emails")).length, 0);
	} finally { mock.restore(); }
});
test("domain credentials are cryptographically bound to the domain and fail closed", async () => {
	const { env } = fixture(); const encryptedResendKey = await encryptResendKey(env, "one.example", "re_secret");
	await assert.rejects(resolveResendKey(env, { domain: "two.example", sendProvider: "resend", encryptedResendKey }));
	await assert.rejects(resolveResendKey(env, { domain: "one.example", sendProvider: "resend" }));
	assert.equal(domainConfigView({ domain: "one.example", sendProvider: "resend", encryptedResendKey }).hasApiKey, true);
});
test("missing encryption key and invalid domains fail before external changes", async () => {
	const { env } = fixture(); const mock = mockProviders();
	try {
		for (const domain of ["https://example.com", "user@example.com", "*.example.com", "../example.com", "-a.example"]) assert.throws(() => normalizeDomain(domain));
		env.AI_CONFIG_ENCRYPTION_KEY = ""; assert.equal((await runSetup(env, input("alpha.example"))).success, false); assert.equal(mock.calls.length, 0);
	} finally { mock.restore(); }
});
test("mailbox API allows multiple configured domains and blocks unconfigured domains", async () => {
	const { env } = fixture();
	for (const domain of ["one.example", "two.example"]) await saveDomainConfig(env, { domain, sendProvider: "cloudflare" });
	for (const email of ["hi@one.example", "support@one.example", "hi@two.example", "hi@unknown.example"]) {
		const response = await app.request("/api/v1/mailboxes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, name: "Test" }) }, env);
		assert.equal(response.status, email.includes("unknown") ? 403 : 201);
	}
});
test("recipient envelope routes cross-domain CC or BCC to the actual mailbox", async () => {
	const { env, objects, deliveries } = fixture(); const tasks: Promise<unknown>[] = [];
	objects.set("mailboxes/hi@two.example.json", "{}");
	const raw = new TextEncoder().encode("From: sender@example.net\r\nTo: hi@one.example\r\nCc: hi@two.example\r\nSubject: Envelope test\r\n\r\nHello");
	await receiveEmail({ to: "HI@TWO.EXAMPLE", raw: new ReadableStream({ start(controller) { controller.enqueue(raw); controller.close(); } }), rawSize: raw.length }, env, { waitUntil: (task: Promise<unknown>) => tasks.push(task) } as unknown as ExecutionContext);
	await Promise.all(tasks); assert.equal(deliveries.length, 1); assert.equal(deliveries[0].mailbox, "hi@two.example");
});
