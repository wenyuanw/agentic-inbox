// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { useKumoToastManager } from "@cloudflare/kumo";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useBlocker } from "react-router";
import {
	buildQuotedReplyBlock,
	escapeHtml,
	formatComposeDate,
	getSignatureBlock,
	htmlToPlainText,
	splitEmailList,
	stripHtml,
	toEmailListValue,
} from "~/lib/utils";
import {
	useDeleteEmail,
	useForwardEmail,
	useReplyToEmail,
	useSaveDraft,
	useSendEmail,
} from "~/queries/emails";
import { useMailbox } from "~/queries/mailboxes";
import { useUIStore } from "~/hooks/useUIStore";

function appendUniqueAddress(
	addresses: string[],
	seen: Set<string>,
	address: string,
	exclude?: string,
) {
	const trimmed = address.trim();
	if (!trimmed) return;

	const normalized = trimmed.toLowerCase();
	if (normalized === exclude || seen.has(normalized)) return;

	seen.add(normalized);
	addresses.push(trimmed);
}

interface ComposeFormFields {
	to: string;
	cc: string;
	bcc: string;
	showCcBcc: boolean;
	subject: string;
	body: string;
}

const EMPTY_FIELDS: ComposeFormFields = {
	to: "",
	cc: "",
	bcc: "",
	showCcBcc: false,
	subject: "",
	body: "",
};

function getPrefixedSubject(subject: string, prefix: "Re" | "Fwd") {
	const expectedPrefix = `${prefix}: `;
	return subject.startsWith(expectedPrefix)
		? subject
		: `${expectedPrefix}${subject}`;
}

function buildForwardBody(
	original: NonNullable<
		ReturnType<typeof useUIStore.getState>["composeOptions"]["originalEmail"]
	>,
	sigBlock: string,
) {
	const safeSender = escapeHtml(original.sender);
	const safeSubject = escapeHtml(original.subject);
	const safeBody = escapeHtml(stripHtml(original.body || "")).replace(
		/\n/g,
		"<br>",
	);

	return `<p><br></p>${sigBlock ? `${sigBlock}<br>` : ""}<div style="border: 1px solid #ddd; padding: 1em; background-color: #f9f9f9; margin: 1em 0;"><strong>Forwarded message:</strong><br><strong>From:</strong> ${safeSender}<br><strong>Date:</strong> ${formatComposeDate(original.date)}<br><strong>Subject:</strong> ${safeSubject}<br><br>${safeBody}</div>`;
}

function buildReplyAllFields(
	original: NonNullable<
		ReturnType<typeof useUIStore.getState>["composeOptions"]["originalEmail"]
	>,
	selfAddress?: string,
) {
	const toRecipients: string[] = [];
	const toSeen = new Set<string>();
	appendUniqueAddress(toRecipients, toSeen, original.sender, selfAddress);

	for (const recipient of splitEmailList(original.recipient)) {
		appendUniqueAddress(toRecipients, toSeen, recipient, selfAddress);
	}

	const ccRecipients: string[] = [];
	const ccSeen = new Set<string>();
	for (const recipient of splitEmailList(original.cc)) {
		const normalized = recipient.toLowerCase();
		if (
			normalized === selfAddress ||
			toSeen.has(normalized) ||
			ccSeen.has(normalized)
		) {
			continue;
		}
		ccSeen.add(normalized);
		ccRecipients.push(recipient);
	}

	return {
		to: toRecipients.join(", "),
		cc: ccRecipients.join(", "),
		showCcBcc: ccRecipients.length > 0,
	};
}

function buildInitialComposeFields(
	composeOptions: ReturnType<typeof useUIStore.getState>["composeOptions"],
	mailboxEmail: string | undefined,
	sigBlock: string,
): ComposeFormFields {
	const { draftEmail: draft, originalEmail: original, mode } = composeOptions;

	if (draft) {
		return {
			to: draft.recipient || "",
			cc: draft.cc || "",
			bcc: draft.bcc || "",
			showCcBcc: Boolean(draft.cc || draft.bcc),
			subject: draft.subject || "",
			body: draft.body || "",
		};
	}

	if (!original) {
		return {
			...EMPTY_FIELDS,
			body: sigBlock ? `<p><br></p>${sigBlock}` : "",
		};
	}

	if (mode === "reply") {
		return {
			...EMPTY_FIELDS,
			to: original.sender,
			subject: getPrefixedSubject(original.subject, "Re"),
			body: `<p><br></p>${sigBlock ? `${sigBlock}<br>` : ""}${buildQuotedReplyBlock(original.date, original.sender, original.body || "")}`,
		};
	}

	if (mode === "reply-all") {
		const recipients = buildReplyAllFields(
			original,
			mailboxEmail?.toLowerCase(),
		);
		return {
			...EMPTY_FIELDS,
			...recipients,
			subject: getPrefixedSubject(original.subject, "Re"),
			body: `<p><br></p>${sigBlock ? `${sigBlock}<br>` : ""}${buildQuotedReplyBlock(original.date, original.sender, original.body || "")}`,
		};
	}

	if (mode === "forward") {
		return {
			...EMPTY_FIELDS,
			subject: getPrefixedSubject(original.subject, "Fwd"),
			body: buildForwardBody(original, sigBlock),
		};
	}

	return {
		...EMPTY_FIELDS,
		body: sigBlock ? `<p><br></p>${sigBlock}` : "",
	};
}

export function useComposeForm(mailboxId?: string, _folder?: string) {
	const toastManager = useKumoToastManager();
	const { composeOptions, closeCompose, isComposing, showNotice } =
		useUIStore();
	const { data: currentMailbox } = useMailbox(mailboxId);
	const sendEmailMutation = useSendEmail();
	const saveDraftMutation = useSaveDraft();
	const replyMutation = useReplyToEmail();
	const forwardMutation = useForwardEmail();
	const deleteEmailMutation = useDeleteEmail();
	const [to, setTo] = useState("");
	const [cc, setCc] = useState("");
	const [bcc, setBcc] = useState("");
	const [showCcBcc, setShowCcBcc] = useState(false);
	const [subject, setSubject] = useState("");
	const [body, setBody] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [isSavingDraft, setIsSavingDraft] = useState(false);
	const [isSending, setIsSending] = useState(false);
	const [saveState, setSaveState] = useState<
		"idle" | "saving" | "saved" | "error"
	>("idle");
	const lastInitializedOptionsRef = useRef<typeof composeOptions | null>(null);
	const draftIdRef = useRef<string | undefined>(composeOptions.draftEmail?.id);
	const savedSnapshotRef = useRef("");
	const savingRef = useRef(false);
	const savePromiseRef = useRef<Promise<boolean> | null>(null);
	const navigatingRef = useRef(false);
	const sendingRef = useRef(false);
	const formTitle = composeOptions.draftEmail
		? "Edit draft"
		: composeOptions.mode === "reply" || composeOptions.mode === "reply-all"
			? "Reply"
			: composeOptions.mode === "forward"
				? "Forward"
				: "New message";
	const sigBlock = useMemo(
		() => getSignatureBlock(currentMailbox?.settings),
		[currentMailbox],
	);
	const snapshot = JSON.stringify({ to, cc, bcc, subject, body });
	const hasContent = Boolean(
		to.trim() ||
		cc.trim() ||
		bcc.trim() ||
		subject.trim() ||
		htmlToPlainText(body).trim(),
	);
	const dirty =
		Boolean(hasContent || draftIdRef.current) &&
		snapshot !== savedSnapshotRef.current;

	useEffect(() => {
		if (!currentMailbox || lastInitializedOptionsRef.current === composeOptions)
			return;
		lastInitializedOptionsRef.current = composeOptions;
		const fields = buildInitialComposeFields(
			composeOptions,
			currentMailbox.email,
			sigBlock,
		);
		setError(null);
		setTo(fields.to);
		setCc(fields.cc);
		setBcc(fields.bcc);
		setShowCcBcc(fields.showCcBcc);
		setSubject(fields.subject);
		setBody(fields.body);
		draftIdRef.current = composeOptions.draftEmail?.id;
		savedSnapshotRef.current = composeOptions.draftEmail
			? JSON.stringify({
					to: fields.to,
					cc: fields.cc,
					bcc: fields.bcc,
					subject: fields.subject,
					body: fields.body,
				})
			: "";
		setSaveState(composeOptions.draftEmail ? "saved" : "idle");
	}, [composeOptions, currentMailbox, sigBlock]);

	useEffect(() => {
		if (!dirty) return;
		const handler = (event: BeforeUnloadEvent) => {
			event.preventDefault();
			event.returnValue = "";
		};
		window.addEventListener("beforeunload", handler);
		return () => window.removeEventListener("beforeunload", handler);
	}, [dirty]);

	const saveDraft = async (silent = false): Promise<boolean> => {
		if (!mailboxId || sendingRef.current) return false;
		if (savePromiseRef.current) await savePromiseRef.current;
		if (draftIdRef.current && snapshot === savedSnapshotRef.current)
			return true;
		if (!hasContent && !draftIdRef.current) return true;
		savingRef.current = true;
		setIsSavingDraft(true);
		setSaveState("saving");
		if (!silent || saveState === "error") setError(null);
		const request = (async () => {
			try {
				const result = await saveDraftMutation.mutateAsync({
					mailboxId,
					draft: {
						to,
						cc: cc || undefined,
						bcc: bcc || undefined,
						subject,
						body,
						in_reply_to:
							composeOptions.originalEmail?.id ||
							composeOptions.draftEmail?.in_reply_to ||
							undefined,
						thread_id:
							composeOptions.originalEmail?.thread_id ||
							composeOptions.draftEmail?.thread_id ||
							undefined,
						draft_id: draftIdRef.current,
					},
				});
				draftIdRef.current = result.id;
				savedSnapshotRef.current = snapshot;
				setSaveState("saved");
				if (!silent) showNotice({ message: "Draft saved" });
				return true;
			} catch (err) {
				const message =
					err instanceof Error ? err.message : "Could not save your draft.";
				setError(message);
				setSaveState("error");
				return false;
			} finally {
				savingRef.current = false;
				setIsSavingDraft(false);
				savePromiseRef.current = null;
			}
		})();
		savePromiseRef.current = request;
		return request;
	};

	useEffect(() => {
		if (
			!isComposing ||
			!dirty ||
			isSending ||
			isSavingDraft ||
			saveState === "error" ||
			lastInitializedOptionsRef.current !== composeOptions
		)
			return;
		const timer = window.setTimeout(() => {
			void saveDraft(true);
		}, 1500);
		return () => window.clearTimeout(timer);
	}, [
		snapshot,
		isComposing,
		dirty,
		isSending,
		isSavingDraft,
		saveState,
		composeOptions,
	]);

	const handleSaveDraft = () => saveDraft();
	const handleClose = async () => {
		if (isSending || isSavingDraft) return;
		if (await saveDraft(true)) {
			closeCompose();
			if (hasContent) showNotice({ message: "Draft saved to Drafts" });
		}
	};
	const handleDiscard = async () => {
		if (isSending || isSavingDraft || !mailboxId) return;
		try {
			if (draftIdRef.current)
				await deleteEmailMutation.mutateAsync({
					mailboxId,
					id: draftIdRef.current,
				});
			closeCompose();
			showNotice({ message: "Draft discarded" });
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "Could not discard your draft.",
			);
		}
	};
	const handleSend = async (event: FormEvent, onClose: () => void) => {
		event.preventDefault();
		if (sendingRef.current || savingRef.current) return;
		setError(null);
		if (!currentMailbox || !mailboxId) {
			setError("No mailbox selected.");
			return;
		}
		const recipients = splitEmailList(to);
		if (recipients.length === 0) {
			setError("Add at least one recipient.");
			return;
		}
		const allRecipients = [
			...recipients,
			...splitEmailList(cc),
			...splitEmailList(bcc),
		];
		if (
			allRecipients.some(
				(address) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address),
			)
		) {
			setError("Check the email addresses in To, Cc, and Bcc.");
			return;
		}
		const fromName = currentMailbox.settings?.fromName || currentMailbox.name;
		const from =
			fromName && fromName !== currentMailbox.email
				? { email: currentMailbox.email, name: fromName }
				: currentMailbox.email;
		const emailData = {
			to: toEmailListValue(recipients),
			cc: toEmailListValue(splitEmailList(cc)),
			bcc: toEmailListValue(splitEmailList(bcc)),
			from,
			subject: subject || "(no subject)",
			html: body || "<p></p>",
			text: htmlToPlainText(body),
		};
		const originalId =
			composeOptions.originalEmail?.id ||
			composeOptions.draftEmail?.in_reply_to;
		sendingRef.current = true;
		setIsSending(true);
		try {
			if (
				(composeOptions.mode === "reply" ||
					composeOptions.mode === "reply-all") &&
				originalId
			)
				await replyMutation.mutateAsync({
					mailboxId,
					emailId: originalId,
					email: emailData,
				});
			else if (composeOptions.mode === "forward" && originalId)
				await forwardMutation.mutateAsync({
					mailboxId,
					emailId: originalId,
					email: emailData,
				});
			else await sendEmailMutation.mutateAsync({ mailboxId, email: emailData });
			if (draftIdRef.current) {
				try {
					await deleteEmailMutation.mutateAsync({
						mailboxId,
						id: draftIdRef.current,
					});
				} catch {
					toastManager.add({
						title: "Message queued, but the saved draft could not be removed.",
						variant: "error",
					});
				}
			}
			showNotice({ message: "Message queued for sending" });
			onClose();
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "Could not send your message.",
			);
		} finally {
			sendingRef.current = false;
			setIsSending(false);
		}
	};
	const blocker = useBlocker(
		({ currentLocation, nextLocation }) =>
			isComposing &&
			(dirty || isSavingDraft || isSending) &&
			currentLocation.pathname !== nextLocation.pathname &&
			!nextLocation.pathname.startsWith(`/mailbox/${mailboxId}/`),
	);
	useEffect(() => {
		if (blocker.state !== "blocked" || navigatingRef.current) return;
		navigatingRef.current = true;
		void (async () => {
			if (isSending) {
				blocker.reset();
				showNotice({
					message: "Please wait while your message is being queued.",
				});
			} else if (await saveDraft(true)) {
				closeCompose();
				blocker.proceed();
			} else {
				blocker.reset();
				showNotice({
					message:
						"Your draft could not be saved. Please retry before leaving.",
				});
			}
			navigatingRef.current = false;
		})();
	}, [blocker, isSending]);
	return {
		to,
		setTo,
		cc,
		setCc,
		bcc,
		setBcc,
		showCcBcc,
		setShowCcBcc,
		subject,
		setSubject,
		body,
		setBody,
		error,
		setError,
		isSavingDraft,
		isSending,
		formTitle,
		handleSaveDraft,
		handleSend,
		closeCompose,
		closePanel: closeCompose,
		handleClose,
		handleDiscard,
		hasContent,
		dirty,
		saveState,
	};
}
