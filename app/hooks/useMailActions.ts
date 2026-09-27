import { useI18n } from "~/hooks/useI18n";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Folders } from "shared/folders";
import api from "~/services/api";
import type { Email } from "~/types";
import { useUIStore } from "./useUIStore";

/** Conversation actions affect messages in the current folder, preserving sent mail and drafts. */
export function useMailActions(mailboxId?: string) {
	const { t, conversationCount } = useI18n();

	const queryClient = useQueryClient();
	const { showNotice } = useUIStore();
	const [busy, setBusy] = useState(false);
	const invalidate = () => {
		queryClient.invalidateQueries({ queryKey: ["emails", mailboxId] });
		queryClient.invalidateQueries({ queryKey: ["folders", mailboxId] });
		queryClient.invalidateQueries({ queryKey: ["search", mailboxId] });
	};
	const resolveMessages = async (emails: Email[]) => {
		const groups = await Promise.all(
			emails.map(async (email) => {
				if (email.thread_id && (email.thread_count || 1) > 1) {
					const thread = await api.getThread(mailboxId!, email.thread_id);
					return thread.filter(
						(message) => message.folder_id === email.folder_id,
					);
				}
				return [email];
			}),
		);
		return [
			...new Map(groups.flat().map((email) => [email.id, email])).values(),
		];
	};
	const move = async (emails: Email[], folderId: string) => {
		if (!mailboxId || busy || emails.length === 0) return false;
		setBusy(true);
		try {
			const messages = await resolveMessages(emails);
			const results = await Promise.allSettled(
				messages.map((email) => api.moveEmail(mailboxId, email.id, folderId)),
			);
			const moved = messages.filter(
				(_, i) => results[i].status === "fulfilled",
			);
			const failed = messages.length - moved.length;
			invalidate();
			const verb =
				folderId === Folders.TRASH
					? t("Moved to Trash")
					: folderId === Folders.ARCHIVE
						? t("Archived")
						: folderId === Folders.INBOX
							? t("Moved to Inbox")
							: t("Moved");
			showNotice({
				message: failed
					? t("{moved} moved; {failed} could not be moved.", {
							moved: moved.length,
							failed,
						})
					: `${verb}${emails.length > 1 ? ` · ${conversationCount(emails.length)}` : ""}`,
				actionLabel: t("Undo"),
				action: moved.length
					? () => {
							void (async () => {
								const restored = await Promise.allSettled(
									moved.map((email) =>
										api.moveEmail(
											mailboxId,
											email.id,
											email.folder_id || Folders.INBOX,
										),
									),
								);
								invalidate();
								showNotice({
									message: restored.every(
										(result) => result.status === "fulfilled",
									)
										? t("Move undone")
										: t(
												"Some messages could not be restored. Please try again.",
											),
								});
							})();
						}
					: undefined,
			});
			return failed === 0;
		} catch (error) {
			showNotice({
				message:
					error instanceof Error
						? error.message
						: t("Could not move messages. Please try again."),
			});
			return false;
		} finally {
			setBusy(false);
		}
	};
	const markRead = async (emails: Email[], read: boolean) => {
		if (!mailboxId || busy || emails.length === 0) return;
		setBusy(true);
		try {
			const messages = await resolveMessages(emails);
			const results = await Promise.allSettled(
				messages.map((email) => api.updateEmail(mailboxId, email.id, { read })),
			);
			invalidate();
			showNotice({
				message: results.every((result) => result.status === "fulfilled")
					? t(read ? "Marked as read" : "Marked as unread")
					: t("Some messages could not be updated. Please try again."),
			});
		} catch {
			showNotice({
				message: t("Could not update messages. Please try again."),
			});
		} finally {
			setBusy(false);
		}
	};
	return { move, markRead, busy };
}
