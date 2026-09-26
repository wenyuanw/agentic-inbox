import { Dialog } from "@cloudflare/kumo";
import {
	ArchiveIcon,
	ArrowLeftIcon,
	ArrowClockwiseIcon,
	CaretLeftIcon,
	CaretRightIcon,
	EnvelopeOpenIcon,
	EnvelopeSimpleIcon,
	MagnifyingGlassIcon,
	StarIcon,
	TrashIcon,
} from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { Folders, getFolderDisplayName } from "shared/folders";
import EmailRow from "~/components/EmailRow";
import MailIconButton from "~/components/MailIconButton";
import MailboxSplitView from "~/components/MailboxSplitView";
import { useMailActions } from "~/hooks/useMailActions";
import { useUIStore } from "~/hooks/useUIStore";
import { useDeleteEmail, useUpdateEmail } from "~/queries/emails";
import { useSearchEmails, SEARCH_PAGE_SIZE } from "~/queries/search";
import type { Email } from "~/types";

function highlightTerms(text: string, query: string) {
	const term = query
		.replace(
			/\b(?:from|to|subject|in|is|has|before|after):(?:"[^"]*"|\S+)/gi,
			"",
		)
		.trim();
	if (!term) return text;
	const parts = text.split(
		new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"),
	);
	return parts.map((part, index) =>
		part.toLowerCase() === term.toLowerCase() ? (
			<mark key={index}>{part}</mark>
		) : (
			part
		),
	);
}
export default function SearchResultsRoute() {
	const { mailboxId } = useParams<{ mailboxId: string }>();
	const [params] = useSearchParams();
	const query = params.get("q") || "";
	const starred = query === "is:starred";
	const navigate = useNavigate();
	const { selectedEmailId, selectEmail, closePanel, showNotice } = useUIStore();
	const [page, setPage] = useState(1);
	const [selection, setSelection] = useState<Set<string>>(new Set());
	const [permanent, setPermanent] = useState<Email | null>(null);
	const selectAll = useRef<HTMLInputElement>(null);
	const prevQuery = useRef(query);
	const currentPage = prevQuery.current !== query ? 1 : page;
	const { data, isLoading, isError, isFetching, refetch } = useSearchEmails(
		mailboxId,
		query,
		currentPage,
	);
	const results = data?.results || [];
	const total = data?.totalCount || 0;
	const update = useUpdateEmail();
	const remove = useDeleteEmail();
	const actions = useMailActions(mailboxId);
	const selected = results.filter((email) => selection.has(email.id));
	useEffect(() => {
		prevQuery.current = query;
		setPage(1);
		setSelection(new Set());
		closePanel();
	}, [query, mailboxId, closePanel]);
	useEffect(() => {
		setSelection(new Set());
	}, [currentPage]);
	useEffect(() => {
		if (selectAll.current)
			selectAll.current.indeterminate =
				selected.length > 0 && selected.length < results.length;
	}, [selected.length, results.length]);
	useEffect(() => {
		if (
			currentPage > 1 &&
			data &&
			total <= (currentPage - 1) * SEARCH_PAGE_SIZE
		)
			setPage(Math.max(1, Math.ceil(total / SEARCH_PAGE_SIZE)));
	}, [currentPage, total, data]);
	const move = async (emails: Email[], folder: string) => {
		if (await actions.move(emails, folder)) setSelection(new Set());
	};
	const open = (email: Email) => {
		selectEmail(email.id);
		if (mailboxId && !email.read)
			update.mutate({ mailboxId, id: email.id, data: { read: true } });
	};
	const deletePermanently = async () => {
		if (!permanent || !mailboxId) return;
		try {
			await remove.mutateAsync({ mailboxId, id: permanent.id });
			setPermanent(null);
			showNotice({ message: "Message deleted permanently" });
		} catch {
			showNotice({
				message: "Could not delete this message. Please try again.",
			});
		}
	};
	return (
		<MailboxSplitView selectedEmailId={selectedEmailId}>
			<div
				className={`mail-list-toolbar ${selected.length ? "has-selection" : ""}`}
			>
				<MailIconButton
					label="Back to inbox"
					onClick={() => navigate(`/mailbox/${mailboxId}/emails/inbox`)}
				>
					<ArrowLeftIcon size={19} />
				</MailIconButton>
				<div className="mail-select-all">
					<input
						ref={selectAll}
						className="mail-checkbox"
						type="checkbox"
						aria-label="Select all results on this page"
						disabled={!results.length || actions.busy}
						checked={!!results.length && selected.length === results.length}
						onChange={() =>
							setSelection(
								selected.length === results.length
									? new Set()
									: new Set(results.map((email) => email.id)),
							)
						}
					/>
				</div>
				{selected.length ? (
					<>
						<span className="mail-selection-count">
							{selected.length} selected
						</span>
						<MailIconButton
							label="Archive selected"
							disabled={actions.busy}
							onClick={() =>
								void move(
									selected.filter(
										(email) =>
											email.folder_id !== Folders.DRAFT &&
											email.folder_id !== Folders.SENT,
									),
									Folders.ARCHIVE,
								)
							}
						>
							<ArchiveIcon size={20} />
						</MailIconButton>
						<MailIconButton
							label="Move selected to Trash"
							disabled={actions.busy}
							onClick={() => void move(selected, Folders.TRASH)}
						>
							<TrashIcon size={20} />
						</MailIconButton>
						<MailIconButton
							label="Mark selected as read"
							disabled={actions.busy}
							onClick={() => void actions.markRead(selected, true)}
						>
							<EnvelopeOpenIcon size={20} />
						</MailIconButton>
						<MailIconButton
							label="Mark selected as unread"
							disabled={actions.busy}
							onClick={() => void actions.markRead(selected, false)}
						>
							<EnvelopeSimpleIcon size={20} />
						</MailIconButton>
					</>
				) : (
					<MailIconButton
						label="Refresh search"
						disabled={isFetching}
						onClick={() => void refetch()}
					>
						<ArrowClockwiseIcon size={20} />
					</MailIconButton>
				)}
				<div className="mail-pagination">
					<span>
						{total
							? `${(currentPage - 1) * SEARCH_PAGE_SIZE + 1}–${Math.min(currentPage * SEARCH_PAGE_SIZE, total)} of ${total}`
							: "0 results"}
					</span>
					<MailIconButton
						label="Previous page"
						disabled={currentPage <= 1 || isFetching}
						onClick={() => setPage(currentPage - 1)}
					>
						<CaretLeftIcon size={18} />
					</MailIconButton>
					<MailIconButton
						label="Next page"
						disabled={currentPage * SEARCH_PAGE_SIZE >= total || isFetching}
						onClick={() => setPage(currentPage + 1)}
					>
						<CaretRightIcon size={18} />
					</MailIconButton>
				</div>
			</div>
			<div className="mail-folder-title">
				<h1>
					{starred ? <StarIcon size={20} /> : <MagnifyingGlassIcon size={20} />}
					{starred ? "Starred" : "Search results"}
				</h1>
				<span>
					{starred
						? "The messages you want to keep close."
						: query
							? `Results for “${query}”`
							: "Search your mail"}
				</span>
			</div>
			<div className="mail-list-scroll">
				{isLoading ? (
					<div className="mail-list-skeleton" aria-label="Searching mail">
						{Array.from({ length: 8 }, (_, index) => (
							<div key={index}>
								<span />
								<span />
								<span />
							</div>
						))}
					</div>
				) : isError ? (
					<div className="mail-empty-state">
						<h2>Couldn’t search your mail</h2>
						<p>Please try again.</p>
						<button
							className="mail-primary-button"
							onClick={() => void refetch()}
						>
							Retry
						</button>
					</div>
				) : results.length ? (
					results.map((email) => (
						<EmailRow
							key={email.id}
							email={email}
							checked={selection.has(email.id)}
							onCheck={() =>
								setSelection((previous) => {
									const next = new Set(previous);
									if (next.has(email.id)) next.delete(email.id);
									else next.add(email.id);
									return next;
								})
							}
							onOpen={() => open(email)}
							onStar={() => {
								if (mailboxId)
									update.mutate({
										mailboxId,
										id: email.id,
										data: { starred: !email.starred },
									});
							}}
							onRead={() => void actions.markRead([email], !email.read)}
							onArchive={() => void move([email], Folders.ARCHIVE)}
							onTrash={() =>
								email.folder_id === Folders.TRASH
									? setPermanent(email)
									: void move([email], Folders.TRASH)
							}
							busy={actions.busy || update.isPending}
							folderLabel={
								email.folder_name ||
								getFolderDisplayName(email.folder_id || Folders.INBOX)
							}
							highlight={(text) => highlightTerms(text, query)}
						/>
					))
				) : (
					<div className="mail-empty-state">
						<div className="mail-empty-icon">
							{starred ? (
								<StarIcon size={38} />
							) : (
								<MagnifyingGlassIcon size={38} />
							)}
						</div>
						<h2>
							{starred ? "Keep important mail close" : "No matching messages"}
						</h2>
						<p>
							{starred
								? "Click the star beside a message to find it here."
								: query
									? `Nothing matched “${query}”. Try another keyword or adjust your search options.`
									: "Search by sender, subject, or a few words you remember."}
						</p>
						{!starred && (
							<p className="mail-search-tip">
								Try from:name · is:unread · has:attachment
							</p>
						)}
					</div>
				)}
			</div>
			<div className="mail-list-footer">
				<span>
					{total} {starred ? "starred messages" : "results"}
				</span>
				<span>Agentic Inbox</span>
			</div>
			<Dialog.Root
				open={!!permanent}
				onOpenChange={(open) => {
					if (!open) setPermanent(null);
				}}
			>
				<Dialog size="sm" className="p-6 mail-dialog">
					<Dialog.Title className="text-lg mb-3">
						Delete permanently?
					</Dialog.Title>
					<Dialog.Description className="text-sm text-kumo-subtle mb-6">
						This message will be removed from Trash. This cannot be undone.
					</Dialog.Description>
					<div className="flex justify-end gap-2">
						<button
							className="mail-text-button"
							onClick={() => setPermanent(null)}
						>
							Cancel
						</button>
						<button
							className="mail-primary-button"
							disabled={remove.isPending}
							onClick={() => void deletePermanently()}
						>
							Delete permanently
						</button>
					</div>
				</Dialog>
			</Dialog.Root>
		</MailboxSplitView>
	);
}
