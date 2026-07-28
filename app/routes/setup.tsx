// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import {
	Button,
	Input,
	Loader,
	Text,
	useKumoToastManager,
} from "@cloudflare/kumo";
import {
	CheckCircleIcon,
	CircleIcon,
	EnvelopeIcon,
	GearIcon,
	WarningCircleIcon,
	XCircleIcon,
} from "@phosphor-icons/react";
import { type FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { useRunSetup, useSetupStatus, useValidateSetup } from "~/queries/setup";
import type { SetupStep } from "~/services/api";

export function meta() {
	return [{ title: "Setup — Agentic Inbox" }];
}

type WizardStep = "credentials" | "configure" | "complete";

function StepIcon({ status }: { status: SetupStep["status"] }) {
	switch (status) {
		case "done":
			return <CheckCircleIcon size={20} className="text-green-600 shrink-0" weight="fill" />;
		case "running":
			return <Loader size="sm" />;
		case "error":
			return <XCircleIcon size={20} className="text-red-600 shrink-0" weight="fill" />;
		default:
			return <CircleIcon size={20} className="text-kumo-inactive shrink-0" />;
	}
}

export default function SetupRoute() {
	const navigate = useNavigate();
	const toastManager = useKumoToastManager();
	const { data: setupStatus, isLoading: statusLoading } = useSetupStatus();
	const validateSetup = useValidateSetup();
	const runSetup = useRunSetup();

	const [wizardStep, setWizardStep] = useState<WizardStep>("credentials");
	const [cfToken, setCfToken] = useState("");
	const [resendKey, setResendKey] = useState("");
	const [domain, setDomain] = useState("");
	const [validationError, setValidationError] = useState<string | null>(null);
	const [configSteps, setConfigSteps] = useState<SetupStep[]>([]);
	const [configError, setConfigError] = useState<string | null>(null);

	useEffect(() => {
		if (setupStatus?.completed) {
			navigate("/", { replace: true });
		}
	}, [setupStatus?.completed, navigate]);

	const handleValidate = async (e: FormEvent) => {
		e.preventDefault();
		setValidationError(null);
		if (!cfToken.trim() || !resendKey.trim() || !domain.trim()) {
			setValidationError("请填写所有字段");
			return;
		}
		try {
			const result = await validateSetup.mutateAsync({
				cloudflareToken: cfToken.trim(),
				resendApiKey: resendKey.trim(),
				domain: domain.trim(),
			});
			if (!result.valid) {
				const msgs = [
					!result.cloudflare.ok ? result.cloudflare.message : null,
					!result.resend.ok ? result.resend.message : null,
				].filter(Boolean);
				setValidationError(msgs.join("；") || "验证失败");
				return;
			}
			toastManager.add({ title: "凭证验证通过" });
			setWizardStep("configure");
		} catch (err) {
			setValidationError(err instanceof Error ? err.message : "验证请求失败");
		}
	};

	const handleRunSetup = async () => {
		setConfigError(null);
		setConfigSteps([]);
		try {
			const result = await runSetup.mutateAsync({
				cloudflareToken: cfToken.trim(),
				resendApiKey: resendKey.trim(),
				domain: domain.trim(),
			});
			setConfigSteps(result.steps);
			if (result.success) {
				toastManager.add({ title: "域名邮箱配置完成！" });
				setWizardStep("complete");
			} else {
				setConfigError(result.error || "配置失败");
			}
		} catch (err) {
			setConfigError(err instanceof Error ? err.message : "配置请求失败");
		}
	};

	if (statusLoading) {
		return (
			<div className="flex justify-center items-center min-h-screen">
				<Loader size="lg" />
			</div>
		);
	}

	return (
		<div className="min-h-screen bg-kumo-recessed">
			<div className="mx-auto max-w-lg px-4 py-10 md:py-16">
				<div className="text-center mb-8">
					<div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-kumo-base border border-kumo-line mb-4">
						<EnvelopeIcon size={28} className="text-kumo-default" />
					</div>
					<h1 className="text-2xl font-bold text-kumo-default">配置域名邮箱</h1>
					<p className="text-sm text-kumo-subtle mt-2 max-w-sm mx-auto">
						填入 Cloudflare 和 Resend 的 API Key，自动完成收信路由与发信域名验证
					</p>
				</div>

				{/* Progress indicator */}
				<div className="flex items-center justify-center gap-2 mb-8">
					{(["credentials", "configure", "complete"] as WizardStep[]).map((step, i) => (
						<div key={step} className="flex items-center gap-2">
							<div
								className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold ${
									wizardStep === step
										? "bg-kumo-brand text-white"
										: (["credentials", "configure", "complete"].indexOf(wizardStep) > i)
											? "bg-green-100 text-green-700"
											: "bg-kumo-fill text-kumo-subtle"
								}`}
							>
								{i + 1}
							</div>
							{i < 2 && <div className="w-8 h-px bg-kumo-line" />}
						</div>
					))}
				</div>

				<div className="rounded-xl border border-kumo-line bg-kumo-base p-6">
					{wizardStep === "credentials" && (
						<form onSubmit={handleValidate} className="space-y-5">
							<div>
								<h2 className="text-base font-semibold text-kumo-default mb-1">API 凭证</h2>
								<p className="text-sm text-kumo-subtle mb-4">
									Cloudflare Token 仅用于本次配置，不会保存。Resend Key 会加密存储用于发信。
								</p>
							</div>

							<Input
								label="Cloudflare API Token"
								type="password"
								placeholder="在 Cloudflare Dashboard → My Profile → API Tokens 创建"
								size="sm"
								value={cfToken}
								onChange={(e) => setCfToken(e.target.value)}
								required
							/>
							<p className="text-xs text-kumo-subtle -mt-3">
								需要权限：Zone DNS Edit、Email Routing Rules Edit
							</p>

							<Input
								label="Resend API Key"
								type="password"
								placeholder="re_..."
								size="sm"
								value={resendKey}
								onChange={(e) => setResendKey(e.target.value)}
								required
							/>

							<Input
								label="域名"
								placeholder="example.com"
								size="sm"
								value={domain}
								onChange={(e) => setDomain(e.target.value)}
								required
							/>
							<p className="text-xs text-kumo-subtle -mt-3">
								域名须已托管在 Cloudflare
							</p>

							{validationError && (
								<Text variant="error" size="sm">{validationError}</Text>
							)}

							<Button
								type="submit"
								variant="primary"
								className="w-full"
								loading={validateSetup.isPending}
							>
								验证并继续
							</Button>
						</form>
					)}

					{wizardStep === "configure" && (
						<div className="space-y-5">
							<div>
								<h2 className="text-base font-semibold text-kumo-default mb-1">自动配置</h2>
								<p className="text-sm text-kumo-subtle">
									将为 <strong className="text-kumo-default">{domain}</strong> 执行以下操作：
								</p>
								<ul className="text-sm text-kumo-subtle mt-3 space-y-1.5 list-disc list-inside">
									<li>启用 Cloudflare Email Routing</li>
									<li>设置 catch-all 规则转发到本 Worker</li>
									<li>在 Resend 添加发信域名并配置 DNS</li>
									<li>验证 SPF / DKIM 记录</li>
								</ul>
							</div>

							{configSteps.length > 0 && (
								<div className="rounded-lg border border-kumo-line divide-y divide-kumo-line">
									{configSteps.map((step) => (
										<div key={step.id} className="flex items-start gap-3 px-4 py-3">
											<StepIcon status={step.status} />
											<div className="min-w-0 flex-1">
												<div className="text-sm font-medium text-kumo-default">{step.label}</div>
												{step.message && (
													<div className={`text-xs mt-0.5 ${
														step.status === "error" ? "text-red-600" : "text-kumo-subtle"
													}`}>
														{step.message}
													</div>
												)}
											</div>
										</div>
									))}
								</div>
							)}

							{configError && (
								<div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3">
									<WarningCircleIcon size={18} className="text-red-600 shrink-0 mt-0.5" />
									<Text variant="error" size="sm">{configError}</Text>
								</div>
							)}

							<div className="flex gap-2">
								<Button
									variant="secondary"
									className="flex-1"
									onClick={() => setWizardStep("credentials")}
									disabled={runSetup.isPending}
								>
									返回
								</Button>
								<Button
									variant="primary"
									className="flex-1"
									icon={<GearIcon size={16} />}
									loading={runSetup.isPending}
									onClick={handleRunSetup}
								>
									{configSteps.length > 0 ? "重试配置" : "开始配置"}
								</Button>
							</div>
						</div>
					)}

					{wizardStep === "complete" && (
						<div className="text-center space-y-5">
							<CheckCircleIcon size={48} className="text-green-600 mx-auto" weight="fill" />
							<div>
								<h2 className="text-base font-semibold text-kumo-default">配置完成</h2>
								<p className="text-sm text-kumo-subtle mt-1">
									{domain} 的收信和发信已就绪，现在可以创建邮箱了。
								</p>
							</div>
							<Button
								variant="primary"
								className="w-full"
								onClick={() => navigate("/")}
							>
								创建第一个邮箱
							</Button>
						</div>
					)}
				</div>

				<p className="text-xs text-kumo-subtle text-center mt-6">
					基于 Cloudflare Email Routing + Resend 的免费域名邮箱方案
				</p>
			</div>
		</div>
	);
}
