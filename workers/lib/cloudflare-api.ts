// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

const CF_API = "https://api.cloudflare.com/client/v4";

interface CfResponse<T> {
	success: boolean;
	errors?: { code: number; message: string }[];
	messages?: { message: string }[];
	result: T;
}

export class CloudflareApiError extends Error {
	code?: number;

	constructor(message: string, code?: number) {
		super(message);
		this.name = "CloudflareApiError";
		this.code = code;
	}
}

async function cfRequest<T>(
	token: string,
	path: string,
	init?: RequestInit,
): Promise<T> {
	const res = await fetch(`${CF_API}${path}`, {
		...init,
		headers: {
			Authorization: `Bearer ${token}`,
			"Content-Type": "application/json",
			...(init?.headers as Record<string, string>),
		},
	});

	const data = (await res.json()) as CfResponse<T>;
	if (!data.success) {
		const msg = data.errors?.map((e) => e.message).join("; ") || `Cloudflare API error (${res.status})`;
		throw new CloudflareApiError(msg, data.errors?.[0]?.code);
	}
	return data.result;
}

export async function verifyCloudflareToken(token: string): Promise<{ id: string; status: string }> {
	return cfRequest(token, "/user/tokens/verify", { method: "GET" });
}

export async function getZoneByName(token: string, domain: string): Promise<{ id: string; name: string; status: string }> {
	const zones = await cfRequest<{ id: string; name: string; status: string }[]>(
		token,
		`/zones?name=${encodeURIComponent(domain)}&status=active`,
	);
	const zone = zones.find((z) => z.name.toLowerCase() === domain.toLowerCase());
	if (!zone) {
		throw new CloudflareApiError(`域名 ${domain} 未在 Cloudflare 中找到，请确认域名已添加且状态为 active`);
	}
	return zone;
}

export async function enableEmailRouting(token: string, zoneId: string): Promise<void> {
	try {
		// The zone ID identifies the apex domain. Sending it as `name` makes
		// Cloudflare validate it as a subdomain and reject the apex itself.
		await cfRequest(token, `/zones/${zoneId}/email/routing/dns`, {
			method: "POST",
		});
	} catch (e) {
		// Already enabled is fine
		if (e instanceof CloudflareApiError && /already/i.test(e.message)) return;
		throw e;
	}
}

export async function getEmailRoutingStatus(
	token: string,
	zoneId: string,
): Promise<{ enabled: boolean; status?: string }> {
	const result = await cfRequest<{ enabled: boolean; status?: string }>(
		token,
		`/zones/${zoneId}/email/routing`,
	);
	return result;
}

export async function setCatchAllWorkerRule(
	token: string,
	zoneId: string,
	workerName: string,
): Promise<void> {
	await cfRequest(token, `/zones/${zoneId}/email/routing/rules/catch_all`, {
		method: "PUT",
		body: JSON.stringify({
			actions: [{ type: "worker", value: [workerName] }],
			matchers: [{ type: "all" }],
			enabled: true,
			name: "Agentic Inbox catch-all",
			source: "api",
		}),
	});
}

export interface DnsRecordInput {
	type: string;
	name: string;
	content: string;
	priority?: number;
	ttl?: number;
}

export async function createDnsRecord(
	token: string,
	zoneId: string,
	record: DnsRecordInput,
): Promise<void> {
	const body: Record<string, unknown> = {
		type: record.type,
		name: record.name,
		content: record.content,
		ttl: record.ttl ?? 1, // 1 = auto in Cloudflare
	};
	if (record.priority !== undefined) body.priority = record.priority;

	try {
		await cfRequest(token, `/zones/${zoneId}/dns_records`, {
			method: "POST",
			body: JSON.stringify(body),
		});
	} catch (e) {
		// Record already exists — skip
		if (e instanceof CloudflareApiError && /already exists/i.test(e.message)) return;
		throw e;
	}
}
