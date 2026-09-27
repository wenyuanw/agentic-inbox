import { Dialog } from "@cloudflare/kumo";
import {
	ArrowClockwiseIcon,
	ArrowLeftIcon,
	CaretLeftIcon,
	CaretRightIcon,
	FileIcon,
	PaperclipIcon,
	TrashIcon,
	WarningCircleIcon,
} from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { formatDetailDate, formatListDate } from "shared/dates";
import { useI18n } from "~/hooks/useI18n";
import EmailIframe from "~/components/EmailIframe";
import MailIconButton from "~/components/MailIconButton";
import {
	getNonInlineAttachments,
	getSnippetText,
	rewriteInlineImages,
} from "~/lib/utils";
import {
	useUnconfiguredEmail,
	useUnconfiguredEmails,
} from "~/queries/unconfigured-emails";
import api from "~/services/api";
import type { Email } from "~/types";

const PAGE_SIZE = 25;

export default function UnconfiguredEmailsRoute() {
	const { t, localeTag } = useI18n();
	const { mailboxId = "" } = useParams<{ mailboxId: string }>();
	const queryClient = useQueryClient();
	const [page, setPage] = useState(1);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [deleteOpen, setDeleteOpen] = useState(false);
	const list = useUnconfiguredEmails(page, PAGE_SIZE);
	const detail = useUnconfiguredEmail(selectedId);
	const emails = list.data?.emails ?? [];
	const total = list.data?.totalCount ?? 0;
	const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
	useEffect(() => {
		if (page > totalPages) setPage(totalPages);
	}, [page, totalPages]);

	const markRead = useMutation({
		mutationFn: ({ id, read }: { id: string; read: boolean }) =>
			api.updateUnconfiguredEmail(id, { read }),
		onSuccess: (_email, variables) => {
			void queryClient.invalidateQueries({ queryKey: ["unconfigured-emails"] });
			void queryClient.invalidateQueries({
				queryKey: ["unconfigured-email", variables.id],
			});
		},
	});
	const remove = useMutation({
		mutationFn: (id: string) => api.deleteUnconfiguredEmail(id),
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: ["unconfigured-emails"] });
			if (selectedId)
				queryClient.removeQueries({ queryKey: ["unconfigured-email", selectedId] });
			setSelectedId(null);
			setDeleteOpen(false);
		},
	});

	const openEmail = (email: Email) => {
		setSelectedId(email.id);
		if (!email.read) markRead.mutate({ id: email.id, read: true });
	};
	const email = detail.data;
	const attachments = email?.attachments ?? [];
	const downloadableAttachments = getNonInlineAttachments(attachments);
	const inlineAttachmentUrl = (emailId: string, attachmentId: string) =>
		api.getUnconfiguredAttachmentUrl(emailId, attachmentId);

	return (
		<div className={`mail-view mail-unconfigured-view ${selectedId ? "is-reading" : ""}`}>
			<section
				className={`mail-list-view mail-unconfigured-list ${selectedId ? "is-hidden" : ""}`}
			>
				<div className="mail-folder-title mail-unconfigured-title">
					<div>
						<h1>
							<WarningCircleIcon size={19} />
							{t("Unconfigured mail")}
						</h1>
						<p>
							{t("Mail sent to addresses without a configured mailbox is kept here.")}
						</p>
					</div>
					<MailIconButton
						label={t("Refresh unconfigured mail")}
						disabled={list.isFetching}
						onClick={() => void list.refetch()}
					>
						<ArrowClockwiseIcon size={19} />
					</MailIconButton>
				</div>
				<div className="mail-list-scroll mail-unconfigured-scroll">
					{list.isPending ? (
						<div
							className="mail-list-skeleton"
							aria-label={t("Loading unconfigured mail")}
						>
							{Array.from({ length: 8 }, (_, index) => (
								<div key={index}>
									<span />
									<span />
									<span />
								</div>
							))}
						</div>
					) : list.isError ? (
						<div className="mail-empty-state">
							<WarningCircleIcon size={48} weight="thin" />
							<h2>{t("Couldn't load unconfigured mail")}</h2>
							<p>{t("Please try again in a moment.")}</p>
							<button
								type="button"
								className="mail-primary-button"
								onClick={() => void list.refetch()}
							>
								{t("Try again")}
							</button>
						</div>
					) : emails.length === 0 ? (
						<div className="mail-empty-state">
							<div className="mail-empty-icon">
								<WarningCircleIcon size={42} weight="duotone" />
							</div>
							<h2>{t("No unconfigured mail")}</h2>
							<p>{t("New messages sent to unconfigured addresses will appear here.")}</p>
						</div>
					) : (
						emails.map((message) => (
							<button
								key={message.id}
								type="button"
								className={`mail-unconfigured-row ${message.read ? "is-read" : "is-unread"} ${selectedId === message.id ? "is-selected" : ""}`}
								onClick={() => openEmail(message)}
							>
								<span className="mail-unconfigured-row-top">
									<strong>{message.sender || t("Unknown sender")}</strong>
									<time dateTime={message.date}>
										{formatListDate(message.date, localeTag)}
									</time>
								</span>
								<span className="mail-unconfigured-recipient">
									{t("Delivered to {address}", {
										address: message.envelope_recipient || message.recipient,
									})}
								</span>
								<span className="mail-unconfigured-subject">
									{message.subject || t("(no subject)")}
								</span>
								<span className="mail-unconfigured-snippet">
									{getSnippetText(message.snippet || "")}
								</span>
							</button>
						))
					)}
				</div>
				<div className="mail-list-footer">
					<span>{t("{count} messages", { count: total })}</span>
					<div className="mail-pagination">
						<span>{t("Page {page} of {total}", { page, total: totalPages })}</span>
						<MailIconButton
							label={t("Previous page")}
							disabled={page <= 1}
							onClick={() => setPage((current) => Math.max(1, current - 1))}
						>
							<CaretLeftIcon size={19} />
						</MailIconButton>
						<MailIconButton
							label={t("Next page")}
							disabled={page >= totalPages}
							onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
						>
							<CaretRightIcon size={19} />
						</MailIconButton>
					</div>
				</div>
			</section>

			{selectedId && (
				<section className="mail-reader-view">
					<div className="mail-reader">
						<div className="mail-reader-toolbar">
							<MailIconButton
								label={t("Back to unconfigured mail")}
								onClick={() => setSelectedId(null)}
							>
								<ArrowLeftIcon size={20} />
							</MailIconButton>
							<span className="mail-toolbar-spacer" />
							<MailIconButton
								label={t("Delete unconfigured mail")}
								disabled={remove.isPending || detail.isPending || !email}
								onClick={() => setDeleteOpen(true)}
							>
								<TrashIcon size={19} />
							</MailIconButton>
						</div>
						{detail.isPending ? (
							<div className="mail-list-skeleton" aria-label={t("Loading mail")}>
								{Array.from({ length: 6 }, (_, index) => (
									<div key={index}>
										<span />
										<span />
										<span />
									</div>
								))}
							</div>
						) : detail.isError || !email ? (
							<div className="mail-empty-state">
								<h2>{t("Couldn’t open this message")}</h2>
								<p>{t("Please try again.")}</p>
								<button
									type="button"
									className="mail-primary-button"
									onClick={() => void detail.refetch()}
								>
									{t("Retry")}
								</button>
							</div>
						) : (
							<div className="mail-reader-scroll">
								<div className="mail-reader-subject">
									<p className="mail-unconfigured-recipient-detail">
										{t("Delivered to {address}", {
											address: email.envelope_recipient || email.recipient,
										})}
									</p>
									<h2 className="mail-reader-heading">
										{email.subject || t("(no subject)")}
									</h2>
								</div>
								<div className="mail-message-meta">
									<div className="mail-message-sender-line">
										<div className="flex items-center gap-2.5 min-w-0">
											<div className="mail-message-avatar">
												{(email.sender || "?").charAt(0).toUpperCase()}
											</div>
											<div className="min-w-0">
												<div className="mail-message-sender">
													{email.sender || t("Unknown sender")}
												</div>
												<div className="text-xs text-kumo-subtle">
													{t("To:")} {email.recipient || email.envelope_recipient}
												</div>
											</div>
										</div>
										<span className="mail-message-date">
											{formatDetailDate(email.date, localeTag)}
										</span>
									</div>
								</div>
								<div className="mail-message-body">
									<EmailIframe
										autoSize
										body={rewriteInlineImages(
											email.body || "",
											mailboxId,
											email.id,
											attachments,
											inlineAttachmentUrl,
										)}
									/>
								</div>
								{downloadableAttachments.length > 0 && (
									<div className="mail-unconfigured-attachments">
										<div className="flex items-center gap-2 mb-2">
											<PaperclipIcon size={14} />
											<span>
												{t("{count} attachments", {
													count: downloadableAttachments.length,
												})}
											</span>
										</div>
										<div className="flex flex-wrap gap-2">
											{downloadableAttachments.map((attachment) => (
												<a
													key={attachment.id}
													href={inlineAttachmentUrl(email.id, attachment.id)}
													className="mail-unconfigured-attachment"
													target="_blank"
													rel="noopener noreferrer"
												>
													<FileIcon size={16} />
													<span>{attachment.filename}</span>
												</a>
											))}
										</div>
									</div>
								)}
							</div>
						)}
					</div>
				</section>
			)}

			<Dialog.Root
				open={deleteOpen}
				onOpenChange={(open) => {
					if (!remove.isPending) setDeleteOpen(open);
				}}
			>
				<Dialog size="sm" className="p-6 mail-dialog">
					<Dialog.Title className="text-lg mb-3">
						{t("Delete this message?")}
					</Dialog.Title>
					<Dialog.Description className="text-sm text-kumo-subtle mb-6">
						{t("This message will be permanently removed. This cannot be undone.")}
					</Dialog.Description>
					<div className="flex justify-end gap-2">
						<button
							type="button"
							className="mail-text-button"
							onClick={() => setDeleteOpen(false)}
						>
							{t("Cancel")}
						</button>
						<button
							type="button"
							className="mail-primary-button"
							disabled={!selectedId || remove.isPending}
							onClick={() => selectedId && remove.mutate(selectedId)}
						>
							{t("Delete")}
						</button>
					</div>
				</Dialog>
			</Dialog.Root>
		</div>
	);
}
