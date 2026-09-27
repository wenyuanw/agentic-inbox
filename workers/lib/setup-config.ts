// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { listDomainConfigs } from "./domain-config";
import type { Env } from "../types";

export interface SetupConfig {
	completed: boolean;
	domains: string[];
	zoneId?: string;
	sendProvider: "resend" | "cloudflare";
	resendApiKey?: string;
	resendDomainId?: string;
	routingConfiguredAt?: string;
	resendVerifiedAt?: string;
	configuredAt?: string;
}

const SETUP_KEY = "config/setup.json";

export async function getSetupConfig(bucket: R2Bucket): Promise<SetupConfig | null> {
	const obj = await bucket.get(SETUP_KEY);
	if (!obj) return null;
	try {
		return (await obj.json()) as SetupConfig;
	} catch {
		return null;
	}
}

export async function saveSetupConfig(bucket: R2Bucket, config: SetupConfig): Promise<void> {
	await bucket.put(SETUP_KEY, JSON.stringify(config), {
		httpMetadata: { contentType: "application/json" },
	});
}

export function isSetupComplete(config: SetupConfig | null): boolean {
	return config?.completed === true && (config.domains?.length ?? 0) > 0;
}

export async function getEffectiveDomains(env: Env): Promise<string[]> {
	const configs = await listDomainConfigs(env);
	const manual = (env.DOMAINS || "").split(",").map(d => d.trim().toLowerCase()).filter(Boolean);
	return [...new Set([...configs.map(config => config.domain), ...manual.filter(d => d !== "example.com" || configs.length === 0)])];
}

export async function getEffectiveEmailAddresses(env: Env): Promise<string[]> {
	return (env.EMAIL_ADDRESSES ?? []) as string[];
}
