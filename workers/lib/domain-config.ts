import type { Env } from "../types";
import { getSetupConfig } from "./setup-config";

export interface DomainConfig {
	domain: string;
	zoneId?: string;
	sendProvider: "resend" | "cloudflare";
	resendApiKey?: string; // Legacy read only; never written for new domains.
	encryptedResendKey?: { iv: string; data: string };
	resendDomainId?: string;
	routingConfiguredAt?: string;
	resendVerifiedAt?: string;
	configuredAt?: string;
}
export function normalizeDomain(value: string): string {
	const domain = value.trim().toLowerCase();
	if (domain.length > 253 || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(domain)) throw new Error("Enter a valid domain name without a URL or email address.");
	return domain;
}
export function domainConfigKey(domain: string) { return `config/domains/${normalizeDomain(domain)}.json`; }
export async function getDomainConfig(env: Env, name: string): Promise<DomainConfig | null> {
	const domain = normalizeDomain(name);
	const object = await env.BUCKET.get(domainConfigKey(domain));
	if (object) return await object.json<DomainConfig>();
	const legacy = await getSetupConfig(env.BUCKET);
	if (!legacy?.completed || !legacy.domains.some(value => value.toLowerCase() === domain)) return null;
	return { domain, zoneId: legacy.zoneId, sendProvider: legacy.sendProvider, resendApiKey: legacy.resendApiKey, resendDomainId: legacy.resendDomainId, routingConfiguredAt: legacy.routingConfiguredAt, resendVerifiedAt: legacy.resendVerifiedAt, configuredAt: legacy.configuredAt };
}
export async function listDomainConfigs(env: Env): Promise<DomainConfig[]> {
	const byDomain = new Map<string, DomainConfig>();
	const legacy = await getSetupConfig(env.BUCKET);
	if (legacy?.completed) for (const name of legacy.domains) {
		const domain = normalizeDomain(name);
		byDomain.set(domain, { domain, zoneId: legacy.zoneId, sendProvider: legacy.sendProvider, resendApiKey: legacy.resendApiKey, resendDomainId: legacy.resendDomainId, routingConfiguredAt: legacy.routingConfiguredAt, resendVerifiedAt: legacy.resendVerifiedAt, configuredAt: legacy.configuredAt });
	}
	let cursor: string | undefined;
	do {
		const page = await env.BUCKET.list({ prefix: "config/domains/", cursor });
		const configs = await Promise.all(page.objects.map(async object => {
			const value = await env.BUCKET.get(object.key);
			return value ? await value.json<DomainConfig>() : null;
		}));
		for (const config of configs) if (config) byDomain.set(config.domain, config);
		cursor = page.truncated ? page.cursor : undefined;
	} while (cursor);
	return [...byDomain.values()].sort((a, b) => a.domain.localeCompare(b.domain));
}
async function masterKey(env: Env) {
	try {
		const bytes = Uint8Array.from(atob(env.AI_CONFIG_ENCRYPTION_KEY ?? ""), c => c.charCodeAt(0));
		if (bytes.length !== 32) throw new Error();
		return await crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
	} catch { throw new Error("Configure the server encryption key before adding a domain."); }
}
export async function encryptResendKey(env: Env, domain: string, value: string) {
	const key = await masterKey(env);
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const data = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: new TextEncoder().encode(`resend:${normalizeDomain(domain)}`) }, key, new TextEncoder().encode(value)));
	return { iv: btoa(String.fromCharCode(...iv)), data: btoa(String.fromCharCode(...data)) };
}
export async function resolveResendKey(env: Env, config: DomainConfig): Promise<string> {
	if (!config.encryptedResendKey) {
		if (config.resendApiKey) return config.resendApiKey;
		throw new Error("No Resend API key is configured for this domain.");
	}
	const key = await masterKey(env);
	try {
		const { iv, data } = config.encryptedResendKey;
		const decoded = await crypto.subtle.decrypt({ name: "AES-GCM", iv: Uint8Array.from(atob(iv), c => c.charCodeAt(0)), additionalData: new TextEncoder().encode(`resend:${config.domain}`) }, key, Uint8Array.from(atob(data), c => c.charCodeAt(0)));
		return new TextDecoder().decode(decoded);
	} catch { throw new Error("The saved Resend key could not be decrypted. Reconfigure this domain."); }
}
export async function saveDomainConfig(env: Env, config: DomainConfig) {
	const { resendApiKey: _plaintext, ...safe } = config;
	await env.BUCKET.put(domainConfigKey(config.domain), JSON.stringify(safe), { httpMetadata: { contentType: "application/json" } });
}
export function domainConfigView(config: DomainConfig) {
	return { domain: config.domain, sendProvider: config.sendProvider, routingConfigured: !!config.routingConfiguredAt, resendVerified: !!config.resendVerifiedAt, hasApiKey: !!(config.resendApiKey || config.encryptedResendKey), configuredAt: config.configuredAt };
}
