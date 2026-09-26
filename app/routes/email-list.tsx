import { Dialog } from "@cloudflare/kumo";
import {
	ArchiveIcon,
	ArrowCounterClockwiseIcon,
	ArrowsClockwiseIcon,
	CaretLeftIcon,
	CaretRightIcon,
	EnvelopeOpenIcon,
	EnvelopeSimpleIcon,
	PencilSimpleIcon,
	TrashIcon,
	TrayIcon,
} from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router";
import { Folders, getFolderDisplayName } from "shared/folders";
import EmailRow from "~/components/EmailRow";
import MailIconButton from "~/components/MailIconButton";
import MailboxSplitView from "~/components/MailboxSplitView";
import { useMailActions } from "~/hooks/useMailActions";
import { useUIStore } from "~/hooks/useUIStore";
import {
	useDeleteEmail,
	useEmails,
	useMarkThreadRead,
	useUpdateEmail,
} from "~/queries/emails";
import { useFolders } from "~/queries/folders";
import api from "~/services/api";
import type { Email } from "~/types";

const PAGE_SIZE = 25;
const EMPTY: Record<string, [string, string]> = {
	inbox: [
		"You're all caught up",
		"New messages will appear here. Enjoy a little breathing room.",
	],
	sent: [
		"Your conversations start here",
		"Emails you send will appear in Sent.",
	],
	draft: [
		"A clean slate",
		"Start a message. Your drafts will be saved as you write.",
	],
	archive: [
		"Nothing archived yet",
		"Keep your inbox clear without saying goodbye to your messages.",
	],
	trash: [
		"Your trash is empty",
		"Messages moved to Trash can be restored to your inbox.",
	],
	spam: ["No spam here", "Messages you move to Spam will appear here."],
};

export default function EmailListRoute() {
	const { mailboxId, folder = "inbox" } = useParams<{
		mailboxId: string;
		folder: string;
	}>();
	const {
		selectedEmailId,
		selectEmail,
		closePanel,
		startCompose,
		isComposing,
		showNotice,
	} = useUIStore();
	const queryClient = useQueryClient();
	const updateEmail = useUpdateEmail();
	const markThreadRead = useMarkThreadRead();
	const deleteEmail = useDeleteEmail();
	const actions = useMailActions(mailboxId);
	const [page, setPage] = useState(1);
	const [checked, setChecked] = useState<Set<string>>(new Set());
	const [deleteTargets, setDeleteTargets] = useState<Email[]>([]);
	const params = useMemo(
		() => ({ folder, page: String(page), limit: String(PAGE_SIZE) }),
		[folder, page],
	);
	const { data, isPending, isError, isFetching, refetch } = useEmails(
		mailboxId,
		params,
		{ refetchInterval: 30_000 },
	);
	const { data: folders = [] } = useFolders(mailboxId);
	const emails = data?.emails || [];
	const total = data?.totalCount || 0;
	const folderName =
		folders.find((item) => item.id === folder)?.name ||
		getFolderDisplayName(folder);
	const selection = emails.filter((email) => checked.has(email.id));
	const allChecked = emails.length > 0 && selection.length === emails.length;
	const selectAllRef = useRef<HTMLInputElement>(null);
	const previousFolder = useRef(`${mailboxId}/${folder}`);
	useEffect(() => {
		if (previousFolder.current !== `${mailboxId}/${folder}`) {
			setPage(1);
			setChecked(new Set());
			closePanel();
		}
		previousFolder.current = `${mailboxId}/${folder}`;
	}, [mailboxId, folder, closePanel]);
	useEffect(() => {
		setChecked(new Set());
	}, [page]);
	useEffect(() => {
		if (selectAllRef.current)
			selectAllRef.current.indeterminate = selection.length > 0 && !allChecked;
	}, [selection.length, allChecked]);
	useEffect(() => {
		if (page > 1 && data && total <= (page - 1) * PAGE_SIZE)
			setPage(Math.max(1, Math.ceil(total / PAGE_SIZE)));
	}, [page, total, data]);
	const toggleChecked = (id: string) =>
		setChecked((previous) => {
			const next = new Set(previous);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	const refresh = () => {
		void refetch();
		queryClient.invalidateQueries({ queryKey: ["folders", mailboxId] });
	};
	const open = (email: Email) => {
		selectEmail(email.id);
		if (!mailboxId || (email.thread_unread_count ?? (email.read ? 0 : 1)) === 0)
			return;
		if (email.thread_id && (email.thread_count || 1) > 1)
			markThreadRead.mutate({ mailboxId, threadId: email.thread_id });
		else updateEmail.mutate({ mailboxId, id: email.id, data: { read: true } });
	};
	const move = async (targets: Email[], targetFolder: string) => {
		if (await actions.move(targets, targetFolder)) setChecked(new Set());
	};
	const trash = (targets: Email[]) => {
		if (folder === Folders.TRASH) setDeleteTargets(targets);
		else void move(targets, Folders.TRASH);
	};
	const permanentlyDelete = async () => {
		if (!mailboxId) return;
		try {
			const threads = await Promise.all(
				deleteTargets.map(async (email) =>
					email.thread_id && (email.thread_count || 1) > 1
						? (await api.getThread(mailboxId, email.thread_id)).filter(
								(message) => message.folder_id === Folders.TRASH,
							)
						: [email],
				),
			);
			for (const email of threads.flat())
				await deleteEmail.mutateAsync({ mailboxId, id: email.id });
			showNotice({ message: "Deleted permanently" });
			setDeleteTargets([]);
			setChecked(new Set());
		} catch {
			showNotice({
				message: "Some messages could not be deleted. Please try again.",
			});
		}
	};
	const emptyState = EMPTY[folder] || [
		"This folder is empty",
		"Move a message here to keep your conversations organized.",
	];
	return (
		<MailboxSplitView selectedEmailId={selectedEmailId}>
			<div
				className={`mail-list-toolbar ${selection.length ? "has-selection" : ""}`}
			>
				<label className="mail-select-all">
					<input
						ref={selectAllRef}
						type="checkbox"
						className="mail-checkbox"
						checked={allChecked}
						disabled={emails.length === 0}
						aria-label="Select all conversations on this page"
						onChange={() =>
							setChecked(
								allChecked
									? new Set()
									: new Set(emails.map((email) => email.id)),
							)
						}
					/>
				</label>
				{selection.length ? (
					<>
						<span className="mail-selection-count">
							{selection.length} selected
						</span>
						{folder !== Folders.ARCHIVE &&
							folder !== Folders.TRASH &&
							folder !== Folders.DRAFT && (
								<MailIconButton
									label="Archive selected"
									disabled={actions.busy}
									onClick={() => void move(selection, Folders.ARCHIVE)}
								>
									<ArchiveIcon size={20} />
								</MailIconButton>
							)}
						<MailIconButton
							label={
								folder === Folders.TRASH
									? "Delete selected permanently"
									: "Move selected to Trash"
							}
							disabled={actions.busy}
							onClick={() => trash(selection)}
						>
							<TrashIcon size={20} />
						</MailIconButton>
						{folder === Folders.TRASH && (
							<MailIconButton
								label="Restore selected to Inbox"
								disabled={actions.busy}
								onClick={() => void move(selection, Folders.INBOX)}
							>
								<ArrowCounterClockwiseIcon size={20} />
							</MailIconButton>
						)}
						<MailIconButton
							label="Mark selected as read"
							disabled={actions.busy}
							onClick={() => void actions.markRead(selection, true)}
						>
							<EnvelopeOpenIcon size={20} />
						</MailIconButton>
						<MailIconButton
							label="Mark selected as unread"
							disabled={actions.busy}
							onClick={() => void actions.markRead(selection, false)}
						>
							<EnvelopeSimpleIcon size={20} />
						</MailIconButton>
					</>
				) : (
					<MailIconButton
						label="Refresh mail"
						disabled={isFetching}
						onClick={refresh}
					>
						<ArrowsClockwiseIcon
							size={20}
							className={isFetching ? "animate-spin" : ""}
						/>
					</MailIconButton>
				)}
				<div className="mail-pagination">
					<span>
						{total
							? `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)} of ${total}`
							: "0 conversations"}
					</span>
					<MailIconButton
						label="Previous page"
						disabled={page === 1}
						onClick={() => setPage(page - 1)}
					>
						<CaretLeftIcon size={19} />
					</MailIconButton>
					<MailIconButton
						label="Next page"
						disabled={page * PAGE_SIZE >= total}
						onClick={() => setPage(page + 1)}
					>
						<CaretRightIcon size={19} />
					</MailIconButton>
				</div>
			</div>
			<div className="mail-folder-title">
				<h1>
					<TrayIcon size={19} />
					{folderName}
				</h1>
				<span>
					{folder === "inbox"
						? "A little less noise. A little more focus."
						: `${total} conversation${total === 1 ? "" : "s"}`}
				</span>
			</div>
			<div className="mail-list-scroll">
				{isPending ? (
					<div className="mail-list-skeleton" aria-label="Loading mail">
						{Array.from({ length: 10 }, (_, index) => (
							<div key={index}>
								<span />
								<span />
								<span />
							</div>
						))}
					</div>
				) : isError ? (
					<div className="mail-empty-state">
						<EnvelopeSimpleIcon size={50} weight="thin" />
						<h2>Couldn't load your mail</h2>
						<p>Please try again in a moment.</p>
						<button
							type="button"
							className="mail-primary-button"
							onClick={() => void refetch()}
						>
							Try again
						</button>
					</div>
				) : emails.length ? (
					emails.map((email) => (
						<EmailRow
							key={email.id}
							email={email}
							checked={checked.has(email.id)}
							onCheck={() => toggleChecked(email.id)}
							onOpen={() => open(email)}
							onStar={() =>
								mailboxId &&
								updateEmail.mutate({
									mailboxId,
									id: email.id,
									data: { starred: !email.starred },
								})
							}
							onRead={() =>
								void actions.markRead(
									[email],
									(email.thread_unread_count ?? (email.read ? 0 : 1)) === 0,
								)
							}
							onArchive={() => void move([email], Folders.ARCHIVE)}
							onTrash={() => trash([email])}
							busy={actions.busy}
						/>
					))
				) : (
					<div className="mail-empty-state">
						<div className="mail-empty-icon">
							<TrayIcon size={42} weight="duotone" />
						</div>
						<h2>{emptyState[0]}</h2>
						<p>{emptyState[1]}</p>
						{["inbox", "sent", "draft"].includes(folder) && (
							<button
								className="mail-primary-button"
								type="button"
								onClick={() => {
									startCompose();
								}}
							>
								<PencilSimpleIcon size={18} />
								Write a message
							</button>
						)}
					</div>
				)}
			</div>
			<div className="mail-list-footer">
				<span>
					{total} conversation{total === 1 ? "" : "s"}
				</span>
				<span>Agentic Inbox</span>
			</div>
			<Dialog.Root
				open={deleteTargets.length > 0}
				onOpenChange={(open) => {
					if (!open) setDeleteTargets([]);
				}}
			>
				<Dialog size="sm" className="p-6 mail-dialog">
					<Dialog.Title className="text-lg mb-3">
						Delete permanently?
					</Dialog.Title>
					<Dialog.Description className="text-sm text-kumo-subtle mb-6">
						These messages will be permanently deleted. You won't be able to
						undo this.
					</Dialog.Description>
					<div className="flex justify-end gap-2">
						<button
							type="button"
							className="mail-text-button"
							onClick={() => setDeleteTargets([])}
						>
							Cancel
						</button>
						<button
							type="button"
							className="mail-primary-button"
							disabled={deleteEmail.isPending}
							onClick={() => void permanentlyDelete()}
						>
							Delete
						</button>
					</div>
				</Dialog>
			</Dialog.Root>
		</MailboxSplitView>
	);
}
