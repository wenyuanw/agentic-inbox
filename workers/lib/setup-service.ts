// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import {
	CloudflareApiError,
	createDnsRecord,
	enableEmailRouting,
	getZoneByName,
	setCatchAllWorkerRule,
	verifyCloudflareToken,
} from "./cloudflare-api";
import {
	findOrCreateResendDomain,
	getResendDomain,
	ResendApiError,
	verifyResendApiKey,
	verifyResendDomain,
	type ResendDnsRecord,
} from "./resend-api";
import { getDomainConfig, listDomainConfigs, domainConfigView, encryptResendKey, normalizeDomain, saveDomainConfig } from "./domain-config";
import type { Env } from "../types";

export interface SetupStep {
	id: string;
	label: string;
	status: "pending" | "running" | "done" | "error";
	message?: string;
}

export interface SetupStatus {
	completed: boolean;
	domains: string[];
	domainConfigs: ReturnType<typeof domainConfigView>[];
	sendProvider?: string;
	routingConfigured: boolean;
	resendVerified: boolean;
	steps: SetupStep[];
}

export interface ValidateCredentialsResult {
	valid: boolean;
	cloudflare: { ok: boolean; message?: string };
	resend: { ok: boolean; message?: string };
	zones?: { id: string; name: string }[];
}

export interface RunSetupInput {
	cloudflareToken: string;
	resendApiKey: string;
	domain: string;
	workerName: string;
	reconfigure?: boolean;
}

export interface RunSetupResult {
	success: boolean;
	steps: SetupStep[];
	config?: ReturnType<typeof domainConfigView>;
	error?: string;
}

function normalizeDnsName(recordName: string, domain: string): string {
	if (!recordName || recordName === "@" || recordName === domain) return domain;
	if (recordName.endsWith(`.${domain}`)) return recordName;
	return `${recordName}.${domain}`;
}

async function addResendDnsRecords(
	cfToken: string,
	zoneId: string,
	domain: string,
	records: ResendDnsRecord[],
): Promise<void> {
	for (const record of records) {
		// Skip tracking CNAME — not required for sending
		if (record.record === "Tracking") continue;

		const name = normalizeDnsName(record.name, domain);
		const content = record.value.replace(/^"|"$/g, "");

		await createDnsRecord(cfToken, zoneId, {
			type: record.type,
			name,
			content,
			priority: record.priority,
		});
	}
}

async function waitForResendVerification(
	apiKey: string,
	domainId: string,
	maxAttempts = 12,
	intervalMs = 5000,
): Promise<boolean> {
	for (let i = 0; i < maxAttempts; i++) {
		const domain = await getResendDomain(apiKey, domainId);
		if (domain.status === "verified") return true;
		if (i < maxAttempts - 1) {
			await new Promise((r) => setTimeout(r, intervalMs));
			await verifyResendDomain(apiKey, domainId).catch(() => {});
		}
	}
	return false;
}

export async function getSetupStatus(env: Env): Promise<SetupStatus> {
	const configs = await listDomainConfigs(env);
	const providers = new Set(configs.map(config => config.sendProvider));
	const routingConfigured = configs.length > 0 && configs.every(config => !!config.routingConfiguredAt);
	const resendVerified = configs.length > 0 && configs.every(config => !!config.resendVerifiedAt);
	return {
		completed: configs.length > 0,
		domains: configs.map(config => config.domain),
		domainConfigs: configs.map(domainConfigView),
		sendProvider: providers.size === 1 ? configs[0].sendProvider : undefined,
		routingConfigured,
		resendVerified,
		steps: [
			{ id: "routing", label: "Cloudflare Email Routing", status: routingConfigured ? "done" : "pending" },
			{ id: "resend", label: "Resend 发信域名", status: resendVerified ? "done" : "pending" },
		],
	};
}

export async function validateCredentials(
	cfToken: string,
	resendApiKey: string,
	domain?: string,
): Promise<ValidateCredentialsResult> {
	const result: ValidateCredentialsResult = {
		valid: false,
		cloudflare: { ok: false },
		resend: { ok: false },
	};

	try {
		await verifyCloudflareToken(cfToken);
		result.cloudflare = { ok: true, message: "Token 有效" };
	} catch (e) {
		result.cloudflare = {
			ok: false,
			message: e instanceof CloudflareApiError ? e.message : "Cloudflare Token 验证失败",
		};
	}

	try {
		await verifyResendApiKey(resendApiKey);
		result.resend = { ok: true, message: "API Key 有效" };
	} catch (e) {
		result.resend = {
			ok: false,
			message: e instanceof ResendApiError ? e.message : "Resend API Key 验证失败",
		};
	}

	if (domain && result.cloudflare.ok) {
		try {
			const zone = await getZoneByName(cfToken, domain);
			result.zones = [{ id: zone.id, name: zone.name }];
		} catch (e) {
			result.cloudflare = {
				ok: false,
				message: e instanceof CloudflareApiError ? e.message : "域名查找失败",
			};
		}
	}

	result.valid = result.cloudflare.ok && result.resend.ok;
	return result;
}

export async function runSetup(env: Env, input: RunSetupInput): Promise<RunSetupResult> {
	let domain: string;
	let encryptedResendKey: Awaited<ReturnType<typeof encryptResendKey>>;
	try {
		domain = normalizeDomain(input.domain);
		const existing = await getDomainConfig(env, domain);
		if (existing && !input.reconfigure) return { success: false, steps: [], error: "This domain is already configured. Use Reconfigure to update it." };
		encryptedResendKey = await encryptResendKey(env, domain, input.resendApiKey);
	} catch (error) { return { success: false, steps: [], error: (error as Error).message }; }

	const steps: SetupStep[] = [
		{ id: "validate", label: "验证 API 凭证", status: "pending" },
		{ id: "zone", label: "查找 Cloudflare 域名", status: "pending" },
		{ id: "routing", label: "启用 Email Routing", status: "pending" },
		{ id: "catchall", label: "配置 catch-all 规则", status: "pending" },
		{ id: "resend-domain", label: "添加 Resend 域名", status: "pending" },
		{ id: "dns", label: "配置 DNS 记录", status: "pending" },
		{ id: "verify", label: "验证 Resend 域名", status: "pending" },
		{ id: "save", label: "保存配置", status: "pending" },
	];

	const setStep = (id: string, status: SetupStep["status"], message?: string) => {
		const step = steps.find((s) => s.id === id);
		if (step) {
			step.status = status;
			step.message = message;
		}
	};


	try {
		setStep("validate", "running");
		const validation = await validateCredentials(input.cloudflareToken, input.resendApiKey, domain);
		if (!validation.valid) {
			setStep("validate", "error", [!validation.cloudflare.ok && validation.cloudflare.message, !validation.resend.ok && validation.resend.message].filter(Boolean).join("; "));
			return { success: false, steps, error: "API 凭证验证失败" };
		}
		setStep("validate", "done", "凭证有效");

		setStep("zone", "running");
		const zone = await getZoneByName(input.cloudflareToken, domain);
		setStep("zone", "done", `Zone ID: ${zone.id}`);

		setStep("routing", "running");
		await enableEmailRouting(input.cloudflareToken, zone.id);
		setStep("routing", "done", "Email Routing 已启用");

		setStep("catchall", "running");
		await setCatchAllWorkerRule(input.cloudflareToken, zone.id, input.workerName);
		setStep("catchall", "done", `Catch-all 已指向 Worker: ${input.workerName}`);

		setStep("resend-domain", "running");
		const resendDomain = await findOrCreateResendDomain(input.resendApiKey, domain);
		setStep("resend-domain", "done", `Resend 域名: ${resendDomain.name}`);

		setStep("dns", "running");
		const records = resendDomain.records ?? [];
		if (records.length > 0) {
			await addResendDnsRecords(input.cloudflareToken, zone.id, domain, records);
		}
		setStep("dns", "done", `已添加 ${records.length} 条 DNS 记录`);

		setStep("verify", "running");
		await verifyResendDomain(input.resendApiKey, resendDomain.id).catch(() => {});
		const verified = resendDomain.status === "verified" || await waitForResendVerification(input.resendApiKey, resendDomain.id);
		if (!verified) {
			setStep("verify", "error", "DNS 记录可能尚未生效，请稍后重试验证");
			return {
				success: false,
				steps,
				error: "Resend 域名验证超时。DNS 记录已添加，请等待几分钟后重试。",
			};
		}
		setStep("verify", "done", "域名已验证");

		setStep("save", "running");
		const now = new Date().toISOString();
		const config = {
			domain,
			zoneId: zone.id,
			sendProvider: "resend" as const,
			encryptedResendKey,
			resendDomainId: resendDomain.id,
			routingConfiguredAt: now,
			resendVerifiedAt: now,
			configuredAt: now,
		};
		await saveDomainConfig(env, config);
		setStep("save", "done", "配置已保存");

		return { success: true, steps, config: domainConfigView(config) };
	} catch (e) {
		const message = e instanceof CloudflareApiError || e instanceof ResendApiError
			? e.message
			: (e as Error).message;
		const running = steps.find((s) => s.status === "running");
		if (running) setStep(running.id, "error", message);
		return { success: false, steps, error: message };
	}
}
