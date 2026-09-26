// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { useI18n } from "~/hooks/useI18n";
import LanguageSelect from "~/components/LanguageSelect";
import {
	Button,
	Dialog,
	Input,
	Loader,
	Select,
	Text,
	useKumoToastManager,
} from "@cloudflare/kumo";
import {
	ArrowRightIcon,
	EnvelopeIcon,
	PlusIcon,
	TrashIcon,
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { Link as RouterLink, useNavigate } from "react-router";
import MailBrand from "~/components/MailBrand";
import MailIconButton from "~/components/MailIconButton";
import api from "~/services/api";
import {
	useCreateMailbox,
	useDeleteMailbox,
	useMailboxes,
} from "~/queries/mailboxes";
import { useSetupStatus } from "~/queries/setup";
import { queryKeys } from "~/queries/keys";

export function meta() {
	return [{ title: "Agentic Inbox" }];
}

export default function HomeRoute() {
	const { t } = useI18n();

	const navigate = useNavigate();
	const toastManager = useKumoToastManager();
	const { data: setupStatus, isLoading: setupLoading } = useSetupStatus();
	const {
		data: mailboxes = [],
		refetch: refetchMailboxes,
		isFetched: mailboxesFetched,
	} = useMailboxes();
	const createMailbox = useCreateMailbox();
	const deleteMailbox = useDeleteMailbox();

	const { data: configData } = useQuery({
		queryKey: queryKeys.config,
		queryFn: () => api.getConfig(),
		staleTime: Infinity, // config rarely changes
	});

	const domains = configData?.domains ?? [];
	const emailAddresses = configData?.emailAddresses ?? [];

	// Redirect to setup wizard if not configured
	useEffect(() => {
		if (setupLoading || !setupStatus) return;
		if (!setupStatus.completed) {
			const envDomains = configData?.domains ?? [];
			const needsSetup =
				envDomains.length === 0 || envDomains.every((d) => d === "example.com");
			if (needsSetup) {
				navigate("/setup", { replace: true });
			}
		}
	}, [setupLoading, setupStatus, configData, navigate]);

	const [isCreateOpen, setIsCreateOpen] = useState(false);
	const [newPrefix, setNewPrefix] = useState("");
	const [selectedDomain, setSelectedDomain] = useState("");
	const [newName, setNewName] = useState("");
	const [isCreating, setIsCreating] = useState(false);
	const [createError, setCreateError] = useState<string | null>(null);
	const [isDeleteOpen, setIsDeleteOpen] = useState(false);
	const [mailboxToDelete, setMailboxToDelete] = useState<{
		id: string;
		email: string;
	} | null>(null);
	const [isDeleting, setIsDeleting] = useState(false);

	// Set default domain when config loads
	useEffect(() => {
		if (domains.length > 0 && !selectedDomain) {
			setSelectedDomain(domains[0]);
		}
	}, [domains, selectedDomain]);

	// Auto-create mailboxes from config (run once when both data sources are ready)
	const autoCreateDone = useRef(false);
	useEffect(() => {
		if (autoCreateDone.current) return;
		if (emailAddresses.length === 0 || !mailboxesFetched) return;
		const existingEmails = new Set(mailboxes.map((m) => m.email.toLowerCase()));
		const toCreate = emailAddresses.filter(
			(addr) => !existingEmails.has(addr.toLowerCase()),
		);
		if (toCreate.length === 0) {
			autoCreateDone.current = true;
			return;
		}
		autoCreateDone.current = true;
		let cancelled = false;
		Promise.all(
			toCreate.map((addr) => {
				const localPart = addr.split("@")[0] || addr;
				return api.createMailbox(addr, localPart).catch(() => {});
			}),
		).then(() => {
			if (!cancelled) refetchMailboxes();
		});
		return () => {
			cancelled = true;
		};
	}, [emailAddresses, mailboxes, refetchMailboxes]);

	const handleCreate = async (e: FormEvent) => {
		e.preventDefault();
		setCreateError(null);
		if (!newPrefix || !selectedDomain) {
			setCreateError(t("Please fill in all fields"));
			return;
		}
		const email = `${newPrefix}@${selectedDomain}`;
		const name = newName || newPrefix;
		setIsCreating(true);
		try {
			await createMailbox.mutateAsync({ email, name });
			toastManager.add({ title: t("Mailbox created successfully!") });
			setIsCreateOpen(false);
			setNewPrefix("");
			setNewName("");
		} catch (err: unknown) {
			const message =
				(err instanceof Error ? t(err.message) : null) ||
				t("Failed to create mailbox");
			setCreateError(message);
		} finally {
			setIsCreating(false);
		}
	};

	const handleDelete = async () => {
		if (!mailboxToDelete) return;
		setIsDeleting(true);
		try {
			await deleteMailbox.mutateAsync(mailboxToDelete.id);
			toastManager.add({ title: t("Mailbox deleted") });
			setIsDeleteOpen(false);
			setMailboxToDelete(null);
		} catch {
			toastManager.add({
				title: t("Failed to delete mailbox"),
				variant: "error",
			});
		} finally {
			setIsDeleting(false);
		}
	};

	const isConfigured = emailAddresses.length > 0;
	const accounts = isConfigured
		? emailAddresses.map((addr) => ({
				id: addr,
				email: addr,
				name: addr.split("@")[0] || addr,
			}))
		: mailboxes;

	const isLoading = !configData || setupLoading;

	return (
		<div className="mail-home-page">
			<header className="mail-home-brand">
				<MailBrand />
				<LanguageSelect />
			</header>
			<div className="mail-home-content">
				<div className="mb-8">
					<div className="flex items-center justify-between">
						<div>
							<p className="mail-home-eyebrow">
								{t("A little more room to focus")}
							</p>
							<h1 className="mail-home-heading">
								{t("Your mail, in one place.")}
							</h1>
						</div>
						{!isConfigured && (
							<Button
								variant="primary"
								icon={<PlusIcon size={16} />}
								onClick={() => setIsCreateOpen(true)}
							>
								{t("New Mailbox")}
							</Button>
						)}
					</div>
					{domains.length > 0 && (
						<p className="text-sm text-kumo-subtle mt-1">
							{t("Choose a mailbox to pick up where you left off.")}{" "}
							{domains.join(", ")}
						</p>
					)}
				</div>

				{isLoading ? (
					<div className="flex justify-center py-20">
						<Loader size="lg" />
					</div>
				) : accounts.length > 0 ? (
					<div className="mail-account-list">
						{accounts.map((account) => (
							<div key={account.id} className="mail-account-card">
								<RouterLink
									to={`/mailbox/${account.id}`}
									className="mail-account-open"
								>
									<div className="mail-home-avatar">
										{account.name.charAt(0).toUpperCase()}
									</div>
									<div className="mail-account-info">
										<strong>{account.name}</strong>
										<span>{account.email}</span>
									</div>
									<ArrowRightIcon size={20} />
								</RouterLink>
								{!isConfigured && (
									<MailIconButton
										label={t("Delete mailbox {email}", {
											email: account.email,
										})}
										onClick={() => {
											setMailboxToDelete({
												id: account.id,
												email: account.email,
											});
											setIsDeleteOpen(true);
										}}
									>
										<TrashIcon size={18} />
									</MailIconButton>
								)}
							</div>
						))}
					</div>
				) : (
					<div className="rounded-xl border border-kumo-line bg-kumo-base py-16 px-6">
						<div className="flex flex-col items-center text-center">
							<div className="mb-4">
								<EnvelopeIcon
									size={48}
									weight="thin"
									className="text-kumo-subtle"
								/>
							</div>
							<h3 className="text-base font-semibold text-kumo-default mb-1.5">
								{t("No mailboxes yet")}
							</h3>
							<p className="text-sm text-kumo-subtle max-w-sm mb-5">
								{isConfigured
									? t(
											"Your email routing is configured but no mailboxes have been created yet. They will appear here automatically.",
										)
									: t(
											"Create a mailbox to start sending and receiving emails with your domain.",
										)}
							</p>
							{!isConfigured && (
								<Button
									variant="primary"
									icon={<PlusIcon size={16} />}
									onClick={() => setIsCreateOpen(true)}
								>
									{t("Create Mailbox")}
								</Button>
							)}
						</div>
					</div>
				)}
			</div>

			{/* Create Dialog */}
			<Dialog.Root open={isCreateOpen} onOpenChange={setIsCreateOpen}>
				<Dialog size="sm" className="p-6 mail-dialog">
					<Dialog.Title className="text-base font-semibold mb-5">
						{t("Create New Mailbox")}
					</Dialog.Title>
					<form onSubmit={handleCreate} className="space-y-4">
						{createError && (
							<Text variant="error" size="sm">
								{createError}
							</Text>
						)}
						<div>
							<span className="text-sm font-medium text-kumo-default mb-1.5 block">
								{t("Email Address")}
							</span>
							<div className="flex items-center gap-2">
								<div className="flex-1">
									<Input
										aria-label={t("Address prefix")}
										placeholder="info"
										size="sm"
										value={newPrefix}
										onChange={(e) => setNewPrefix(e.target.value)}
										required
									/>
								</div>
								<span className="text-sm text-kumo-subtle">@</span>
								{domains.length > 1 ? (
									<div className="flex-1">
										<Select
											aria-label={t("Domain")}
											value={selectedDomain}
											onValueChange={(value) => {
												if (value) setSelectedDomain(value);
											}}
										>
											{domains.map((d) => (
												<Select.Option key={d} value={d}>
													{d}
												</Select.Option>
											))}
										</Select>
									</div>
								) : (
									<span className="text-sm text-kumo-subtle">
										{selectedDomain || t("no domain")}
									</span>
								)}
							</div>
						</div>
						<Input
							label={t("Display Name (optional)")}
							placeholder={t("e.g. Customer support")}
							size="sm"
							value={newName}
							onChange={(e) => setNewName(e.target.value)}
						/>
						<div className="flex justify-end gap-2 pt-2">
							<Dialog.Close
								render={(props) => (
									<Button {...props} variant="secondary" size="sm">
										{t("Cancel")}
									</Button>
								)}
							/>
							<Button
								type="submit"
								variant="primary"
								size="sm"
								loading={isCreating}
								disabled={!selectedDomain}
							>
								{t("Create")}
							</Button>
						</div>
					</form>
				</Dialog>
			</Dialog.Root>

			{/* Delete Dialog */}
			<Dialog.Root
				open={isDeleteOpen}
				onOpenChange={(open) => {
					setIsDeleteOpen(open);
					if (!open) setMailboxToDelete(null);
				}}
			>
				<Dialog size="sm" className="p-6 mail-dialog">
					<Dialog.Title className="text-base font-semibold mb-2">
						{t("Delete Mailbox")}
					</Dialog.Title>
					<Dialog.Description className="text-kumo-subtle text-sm mb-5">
						{t("Are you sure you want to delete")}{" "}
						<strong className="text-kumo-default">
							{mailboxToDelete?.email}
						</strong>
						{t("? This action cannot be undone.")}
					</Dialog.Description>
					<div className="flex justify-end gap-2">
						<Dialog.Close
							render={(props) => (
								<Button {...props} variant="secondary" size="sm">
									{t("Cancel")}
								</Button>
							)}
						/>
						<Button
							variant="destructive"
							size="sm"
							loading={isDeleting}
							onClick={handleDelete}
						>
							{t("Delete")}
						</Button>
					</div>
				</Dialog>
			</Dialog.Root>
		</div>
	);
}
