// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

const RESEND_API = "https://api.resend.com";

export class ResendApiError extends Error {
	status?: number;

	constructor(message: string, status?: number) {
		super(message);
		this.name = "ResendApiError";
		this.status = status;
	}
}

interface ResendResponse<T> {
	data?: T;
	error?: { message: string; name?: string };
}

async function resendRequest<T>(
	apiKey: string,
	path: string,
	init?: RequestInit,
): Promise<T> {
	const res = await fetch(`${RESEND_API}${path}`, {
		...init,
		headers: {
			Authorization: `Bearer ${apiKey}`,
			"Content-Type": "application/json",
			...(init?.headers as Record<string, string>),
		},
	});

	const body = (await res.json()) as ResendResponse<T> | T;
	if (!res.ok) {
		const err = (body as ResendResponse<T>).error;
		throw new ResendApiError(err?.message || `Resend API error (${res.status})`, res.status);
	}
	if ((body as ResendResponse<T>).error) {
		throw new ResendApiError((body as ResendResponse<T>).error!.message);
	}
	return (body as ResendResponse<T>).data ?? (body as T);
}

export interface ResendDnsRecord {
	record: string;
	name: string;
	type: string;
	value: string;
	priority?: number;
	ttl?: string;
	status?: string;
}

export interface ResendDomain {
	id: string;
	name: string;
	status: string;
	records?: ResendDnsRecord[];
}

export async function verifyResendApiKey(apiKey: string): Promise<void> {
	await resendRequest<ResendDomain[]>(apiKey, "/domains");
}

export async function listResendDomains(apiKey: string): Promise<ResendDomain[]> {
	const result = await resendRequest<{ data: ResendDomain[] } | ResendDomain[]>(apiKey, "/domains");
	if (Array.isArray(result)) return result;
	return (result as { data: ResendDomain[] }).data ?? [];
}

export async function createResendDomain(apiKey: string, domain: string): Promise<ResendDomain> {
	return resendRequest<ResendDomain>(apiKey, "/domains", {
		method: "POST",
		body: JSON.stringify({
			name: domain,
			capabilities: { sending: "enabled", receiving: "disabled" },
		}),
	});
}

export async function getResendDomain(apiKey: string, domainId: string): Promise<ResendDomain> {
	return resendRequest<ResendDomain>(apiKey, `/domains/${domainId}`);
}

export async function verifyResendDomain(apiKey: string, domainId: string): Promise<ResendDomain> {
	return resendRequest<ResendDomain>(apiKey, `/domains/${domainId}/verify`, { method: "POST" });
}

export async function findOrCreateResendDomain(apiKey: string, domain: string): Promise<ResendDomain> {
	const existing = await listResendDomains(apiKey);
	const found = existing.find((d) => d.name.toLowerCase() === domain.toLowerCase());
	if (found) {
		return getResendDomain(apiKey, found.id);
	}
	return createResendDomain(apiKey, domain);
}

export interface ResendSendParams {
	to: string | string[];
	from: string | { email: string; name: string };
	subject: string;
	html?: string;
	text?: string;
	cc?: string | string[];
	bcc?: string | string[];
	reply_to?: string;
	headers?: Record<string, string>;
	attachments?: {
		content: string;
		filename: string;
		content_type?: string;
	}[];
}

export async function sendViaResend(
	apiKey: string,
	params: ResendSendParams,
): Promise<{ id: string }> {
	const from = typeof params.from === "string"
		? params.from
		: params.from.name
			? `${params.from.name} <${params.from.email}>`
			: params.from.email;

	const body: Record<string, unknown> = {
		from,
		to: params.to,
		subject: params.subject,
	};
	if (params.html) body.html = params.html;
	if (params.text) body.text = params.text;
	if (params.cc) body.cc = params.cc;
	if (params.bcc) body.bcc = params.bcc;
	if (params.reply_to) body.reply_to = params.reply_to;
	if (params.headers) body.headers = params.headers;
	if (params.attachments?.length) {
		body.attachments = params.attachments.map((a) => ({
			content: a.content,
			filename: a.filename,
			content_type: a.content_type,
		}));
	}

	return resendRequest<{ id: string }>(apiKey, "/emails", {
		method: "POST",
		body: JSON.stringify(body),
	});
}
