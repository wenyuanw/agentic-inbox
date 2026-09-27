// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

/**
 * Email sending via Resend API or Cloudflare Email Service binding.
 *
 * When setup is completed with Resend, uses Resend API.
 * Otherwise falls back to the `send_email` Worker binding.
 */

import { sendViaResend } from "./lib/resend-api";
import { getDomainConfig, resolveResendKey } from "./lib/domain-config";
import type { Env } from "./types";

export interface SendEmailParams {
	to: string | string[];
	from: string | { email: string; name: string };
	subject: string;
	html?: string;
	text?: string;
	cc?: string | string[];
	bcc?: string | string[];
	replyTo?: string | { email: string; name: string };
	attachments?: {
		content: string; // base64 encoded
		filename: string;
		type: string;
		disposition: "attachment" | "inline";
		contentId?: string;
	}[];
	headers?: Record<string, string>;
}

/**
 * Send an email using the Cloudflare Email Service binding.
 */
export async function sendEmail(
	binding: SendEmail,
	params: SendEmailParams,
): Promise<{ messageId: string }> {
	const message: Record<string, unknown> = {
		to: params.to,
		from: params.from,
		subject: params.subject,
	};

	if (params.html) message.html = params.html;
	if (params.text) message.text = params.text;
	if (params.cc) message.cc = params.cc;
	if (params.bcc) message.bcc = params.bcc;
	if (params.replyTo) message.replyTo = params.replyTo;

	if (params.headers && Object.keys(params.headers).length > 0) {
		message.headers = params.headers;
	}

	if (params.attachments && params.attachments.length > 0) {
		message.attachments = params.attachments.map((att) => ({
			content: att.content,
			filename: att.filename,
			type: att.type,
			disposition: att.disposition,
			...(att.contentId ? { contentId: att.contentId } : {}),
		}));
	}

	const result = await binding.send(message as any);
	return { messageId: result.messageId };
}

/**
 * Dispatch email via the configured provider (Resend or Cloudflare).
 */
export async function dispatchEmail(
	env: Env,
	params: SendEmailParams,
): Promise<{ messageId: string }> {
	const address = (typeof params.from === "string" ? params.from : params.from.email).trim().toLowerCase();
	const domain = address.slice(address.lastIndexOf("@") + 1);
	const setup = await getDomainConfig(env, domain);

	if (setup?.sendProvider === "resend") {
		const replyTo = typeof params.replyTo === "string"
			? params.replyTo
			: params.replyTo?.email;

		const result = await sendViaResend(await resolveResendKey(env, setup), {
			to: params.to,
			from: params.from,
			subject: params.subject,
			html: params.html,
			text: params.text,
			cc: params.cc,
			bcc: params.bcc,
			reply_to: replyTo,
			headers: params.headers,
			attachments: params.attachments?.map((att) => ({
				content: att.content,
				filename: att.filename,
				content_type: att.type,
			})),
		});
		return { messageId: result.id };
	}

	return sendEmail(env.EMAIL, params);
}
