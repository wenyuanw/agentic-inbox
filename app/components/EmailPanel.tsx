import { Button, Dialog } from "@cloudflare/kumo";
import {
	ArrowBendUpLeftIcon,
	ArrowBendUpRightIcon,
	ChatCircleIcon,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router";
import { Folders } from "shared/folders";
import EmailPanelDialogs from "~/components/email-panel/EmailPanelDialogs";
import EmailPanelHeader from "~/components/email-panel/EmailPanelHeader";
import EmailPanelToolbar from "~/components/email-panel/EmailPanelToolbar";
import SingleMessageView from "~/components/email-panel/SingleMessageView";
import ThreadMessage from "~/components/email-panel/ThreadMessage";
import { useMailActions } from "~/hooks/useMailActions";
import { useUIStore } from "~/hooks/useUIStore";
import {
	useDeleteEmail,
	useEmail,
	useThreadReplies,
	useUpdateEmail,
} from "~/queries/emails";
import { useFolders } from "~/queries/folders";
import { useMailbox } from "~/queries/mailboxes";
import type { Email } from "~/types";

export default function EmailPanel({ emailId }: { emailId: string }) {
	const { mailboxId } = useParams<{ mailboxId: string }>();
	const { data: email, isError, refetch } = useEmail(mailboxId, emailId);
	const { data: thread = [] } = useThreadReplies(mailboxId, email?.thread_id);
	const { data: folders = [] } = useFolders(mailboxId);
	const { data: mailbox } = useMailbox(mailboxId);
	const update = useUpdateEmail();
	const remove = useDeleteEmail();
	const actions = useMailActions(mailboxId);
	const { closePanel, startCompose, showNotice } = useUIStore();
	const [source, setSource] = useState<Email | null>(null);
	const [preview, setPreview] = useState<{
		url: string;
		filename: string;
	} | null>(null);
	const [expanded, setExpanded] = useState<Set<string>>(new Set());
	const [discard, setDiscard] = useState<Email | null>(null);
	const [deleteOpen, setDeleteOpen] = useState(false);
	const allMessages = useMemo(
		() =>
			email
				? [
						...new Map(
							[email, ...thread].map((message) => [message.id, message]),
						).values(),
					].sort(
						(a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
					)
				: [],
		[email, thread],
	);
	const latestId = allMessages.at(-1)?.id;
	// Expand the latest message once the thread arrives; preserve subsequent user choices.
	useEffect(() => {
		if (latestId) setExpanded((previous) => new Set([...previous, latestId]));
	}, [latestId]);
	const replyTarget =
		[...allMessages]
			.reverse()
			.find(
				(message) =>
					message.folder_id !== Folders.DRAFT &&
					message.sender !== mailbox?.email,
			) ||
		[...allMessages]
			.reverse()
			.find((message) => message.folder_id !== Folders.DRAFT) ||
		email;
	const isDraft = email?.folder_id === Folders.DRAFT;
	const busy = actions.busy || remove.isPending || update.isPending;
	const editDraft = (draft: Email) =>
		startCompose({
			mode: draft.in_reply_to ? "reply" : "new",
			originalEmail: allMessages.find(
				(message) => message.id === draft.in_reply_to,
			),
			draftEmail: draft,
		});
	const move = async (folderId: string) => {
		if (
			email &&
			(await actions.move(
				[{ ...email, thread_count: allMessages.length }],
				folderId,
			))
		)
			closePanel();
	};
	const markRead = async () => {
		if (!email) return;
		await actions.markRead(
			[{ ...email, thread_count: allMessages.length }],
			!email.read,
		);
		if (email.read) closePanel();
	};
	const trash = () => {
		if (!email) return;
		if (isDraft) setDiscard(email);
		else if (email.folder_id === Folders.TRASH) setDeleteOpen(true);
		else void move(Folders.TRASH);
	};
	const confirmDelete = async () => {
		if (!mailboxId || !email) return;
		try {
			const targets = discard
				? [discard]
				: allMessages.filter((message) => message.folder_id === Folders.TRASH);
			const results = await Promise.allSettled(
				targets.map((message) =>
					remove.mutateAsync({ mailboxId, id: message.id }),
				),
			);
			if (results.some((result) => result.status === "rejected")) {
				showNotice({
					message: "Some messages could not be deleted. Please try again.",
				});
				return;
			}
			showNotice({
				message: discard
					? "Draft discarded"
					: "Conversation deleted permanently",
			});
			if (!discard || discard.id === email.id) closePanel();
			setDiscard(null);
			setDeleteOpen(false);
		} catch {
			showNotice({ message: "Could not delete. Please try again." });
		}
	};
	if (!email)
		return (
			<div className="mail-reader">
				<div className="mail-reader-toolbar">
					<button className="mail-text-button" onClick={closePanel}>
						Back to list
					</button>
				</div>
				{isError ? (
					<div className="mail-empty-state">
						<h2>Couldn’t open this message</h2>
						<p>Please try again.</p>
						<button
							className="mail-primary-button"
							onClick={() => void refetch()}
						>
							Retry
						</button>
					</div>
				) : (
					<div className="mail-list-skeleton" aria-label="Loading message">
						{Array.from({ length: 6 }, (_, index) => (
							<div key={index}>
								<span />
								<span />
								<span />
							</div>
						))}
					</div>
				)}
			</div>
		);
	return (
		<div className="mail-reader">
			<EmailPanelToolbar
				email={email}
				isDraftFolder={!!isDraft}
				busy={busy}
				moveToFolders={folders.filter(
					(folder) => folder.id !== email.folder_id,
				)}
				onBack={closePanel}
				onEditDraft={() => editDraft(email)}
				onToggleStar={() => {
					if (mailboxId)
						update.mutate({
							mailboxId,
							id: email.id,
							data: { starred: !email.starred },
						});
				}}
				onToggleRead={() => void markRead()}
				onArchive={() => void move(Folders.ARCHIVE)}
				onMove={(folderId) => void move(folderId)}
				onViewSource={() => setSource(email)}
				onDelete={trash}
			/>
			<div className="mail-reader-scroll">
				<EmailPanelHeader
					subject={email.subject || "(no subject)"}
					messageCount={allMessages.length}
					showThreadCount={allMessages.length > 1}
				/>
				{allMessages.length > 1 ? (
					allMessages.map((message, index) => (
						<ThreadMessage
							key={message.id}
							email={message}
							mailboxId={mailboxId}
							mailboxEmail={mailbox?.email}
							isLast={index === allMessages.length - 1}
							isDraft={message.folder_id === Folders.DRAFT}
							isExpanded={expanded.has(message.id)}
							onToggleExpand={() =>
								setExpanded((previous) => {
									const next = new Set(previous);
									if (next.has(message.id)) next.delete(message.id);
									else next.add(message.id);
									return next;
								})
							}
							onEditDraft={
								message.folder_id === Folders.DRAFT
									? () => editDraft(message)
									: undefined
							}
							onDeleteDraft={
								message.folder_id === Folders.DRAFT
									? () => setDiscard(message)
									: undefined
							}
							onViewSource={() => setSource(message)}
							onPreviewImage={(url, filename) => setPreview({ url, filename })}
						/>
					))
				) : (
					<SingleMessageView
						email={email}
						mailboxId={mailboxId}
						onPreviewImage={(url, filename) => setPreview({ url, filename })}
					/>
				)}
				<div className="mail-reply-actions">
					{isDraft ? (
						<Button
							variant="secondary"
							icon={<ArrowBendUpLeftIcon size={18} />}
							onClick={() => editDraft(email)}
						>
							Continue writing
						</Button>
					) : (
						<>
							<Button
								variant="secondary"
								icon={<ArrowBendUpLeftIcon size={18} />}
								onClick={() =>
									startCompose({ mode: "reply", originalEmail: replyTarget })
								}
							>
								Reply
							</Button>
							<Button
								variant="secondary"
								icon={<ChatCircleIcon size={18} />}
								onClick={() =>
									startCompose({
										mode: "reply-all",
										originalEmail: replyTarget,
									})
								}
							>
								Reply all
							</Button>
							<Button
								variant="secondary"
								icon={<ArrowBendUpRightIcon size={18} />}
								onClick={() =>
									startCompose({ mode: "forward", originalEmail: replyTarget })
								}
							>
								Forward
							</Button>
						</>
					)}
				</div>
			</div>
			<EmailPanelDialogs
				sourceViewEmail={source}
				previewImage={preview}
				onCloseSource={() => setSource(null)}
				onClosePreview={() => setPreview(null)}
			/>
			<Dialog.Root
				open={!!discard || deleteOpen}
				onOpenChange={(open) => {
					if (!open) {
						setDiscard(null);
						setDeleteOpen(false);
					}
				}}
			>
				<Dialog size="sm" className="p-6 mail-dialog">
					<Dialog.Title className="text-lg mb-3">
						{discard ? "Discard this draft?" : "Delete permanently?"}
					</Dialog.Title>
					<Dialog.Description className="text-sm text-kumo-subtle mb-6">
						{discard
							? "The saved draft will be deleted."
							: "This conversation will be permanently removed from Trash."}{" "}
						This cannot be undone.
					</Dialog.Description>
					<div className="flex justify-end gap-2">
						<button
							className="mail-text-button"
							onClick={() => {
								setDiscard(null);
								setDeleteOpen(false);
							}}
						>
							Cancel
						</button>
						<button
							className="mail-primary-button"
							disabled={remove.isPending}
							onClick={() => void confirmDelete()}
						>
							{remove.isPending
								? "Deleting…"
								: discard
									? "Discard"
									: "Delete permanently"}
						</button>
					</div>
				</Dialog>
			</Dialog.Root>
		</div>
	);
}
