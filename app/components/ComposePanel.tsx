import { Dialog } from "@cloudflare/kumo";
import {
	ArrowsInSimpleIcon,
	ArrowsOutSimpleIcon,
	CheckIcon,
	FloppyDiskIcon,
	MinusIcon,
	PaperPlaneTiltIcon,
	TrashIcon,
	XIcon,
} from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router";
import { useIsMobile } from "~/hooks/useIsMobile";
import { useUIStore } from "~/hooks/useUIStore";
import { useComposeForm } from "~/hooks/useComposeForm";
import MailIconButton from "./MailIconButton";
import RichTextEditor from "./RichTextEditor";

export default function ComposePanel() {
	const { mailboxId } = useParams<{ mailboxId: string }>();
	const form = useComposeForm(mailboxId);
	const isMobile = useIsMobile();
	const panelRef = useRef<HTMLElement>(null);
	const focusRequest = useUIStore((state) => state.composeFocusRequest);
	const [minimized, setMinimized] = useState(false);
	const [maximized, setMaximized] = useState(false);
	const [discardOpen, setDiscardOpen] = useState(false);
	const toRef = useRef<HTMLInputElement>(null);
	const formRef = useRef<HTMLFormElement>(null);
	const busy = form.isSending || form.isSavingDraft;
	useEffect(() => {
		const previousFocus = document.activeElement as HTMLElement;
		toRef.current?.focus();
		return () => {
			if (previousFocus?.isConnected) previousFocus.focus();
		};
	}, []);
	useEffect(() => {
		setMinimized(false);
	}, [focusRequest]);
	useEffect(() => {
		if (!minimized) toRef.current?.focus();
	}, [focusRequest, minimized]);
	useEffect(() => {
		if (!isMobile || minimized) return;
		const handler = (event: KeyboardEvent) => {
			if (event.defaultPrevented || discardOpen || event.key !== "Tab") return;
			const elements = [
				...(panelRef.current?.querySelectorAll<HTMLElement>(
					'button:not(:disabled), input, [contenteditable="true"]',
				) || []),
			].filter((element) => element.offsetParent !== null);
			const first = elements[0],
				last = elements.at(-1);
			if (event.shiftKey && document.activeElement === first) {
				event.preventDefault();
				last?.focus();
			} else if (!event.shiftKey && document.activeElement === last) {
				event.preventDefault();
				first?.focus();
			}
		};
		document.addEventListener("keydown", handler);
		return () => document.removeEventListener("keydown", handler);
	}, [isMobile, minimized, discardOpen]);
	return (
		<section
			ref={panelRef}
			className={`mail-compose-window ${minimized ? "is-minimized" : ""} ${maximized ? "is-maximized" : ""}`}
			role={isMobile && !minimized ? "dialog" : "region"}
			aria-modal={isMobile && !minimized ? true : undefined}
			aria-label={form.formTitle}
		>
			<div className="mail-compose-titlebar">
				<button
					type="button"
					className="mail-compose-title"
					onClick={() => setMinimized(!minimized)}
					aria-expanded={!minimized}
				>
					{minimized && form.subject ? form.subject : form.formTitle}
				</button>
				<div className="mail-compose-window-actions">
					<MailIconButton
						label={minimized ? "Restore composer" : "Minimize composer"}
						onClick={() => setMinimized(!minimized)}
					>
						<MinusIcon size={18} />
					</MailIconButton>
					<MailIconButton
						label={maximized ? "Exit full screen" : "Expand composer"}
						onClick={() => {
							setMaximized(!maximized);
							setMinimized(false);
						}}
					>
						{maximized ? (
							<ArrowsInSimpleIcon size={17} />
						) : (
							<ArrowsOutSimpleIcon size={17} />
						)}
					</MailIconButton>
					<MailIconButton
						label="Save and close"
						disabled={busy}
						onClick={() => void form.handleClose()}
					>
						<XIcon size={19} />
					</MailIconButton>
				</div>
			</div>
			<form
				ref={formRef}
				className="mail-compose-form"
				onSubmit={(event) => form.handleSend(event, form.closeCompose)}
				onKeyDown={(event) => {
					if (event.key === "Escape" && !discardOpen) {
						event.preventDefault();
						event.stopPropagation();
						void form.handleClose();
					}
					if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
						event.preventDefault();
						formRef.current?.requestSubmit();
					}
					if (
						(event.ctrlKey || event.metaKey) &&
						event.key.toLowerCase() === "s"
					) {
						event.preventDefault();
						void form.handleSaveDraft();
					}
				}}
			>
				{form.error && (
					<div role="alert" className="mail-compose-error">
						{form.error}
						<button
							className="mail-text-button"
							type="button"
							onClick={() => {
								form.setError(null);
								if (form.saveState === "error") void form.handleSaveDraft();
							}}
						>
							{form.saveState === "error" ? "Retry save" : "Dismiss"}
						</button>
					</div>
				)}
				<div className="mail-compose-fields">
					<div className="mail-compose-field">
						<label htmlFor="compose-to">To</label>
						<input
							ref={toRef}
							id="compose-to"
							value={form.to}
							onChange={(event) => form.setTo(event.target.value)}
							placeholder="Recipients"
							autoComplete="off"
							required
						/>
						<button
							type="button"
							className="mail-cc-toggle"
							aria-expanded={form.showCcBcc}
							onClick={() => form.setShowCcBcc(!form.showCcBcc)}
						>
							Cc / Bcc
						</button>
					</div>
					{form.showCcBcc && (
						<>
							<div className="mail-compose-field">
								<label htmlFor="compose-cc">Cc</label>
								<input
									id="compose-cc"
									value={form.cc}
									onChange={(event) => form.setCc(event.target.value)}
									placeholder="Separate addresses with commas"
								/>
							</div>
							<div className="mail-compose-field">
								<label htmlFor="compose-bcc">Bcc</label>
								<input
									id="compose-bcc"
									value={form.bcc}
									onChange={(event) => form.setBcc(event.target.value)}
									placeholder="Separate addresses with commas"
								/>
							</div>
						</>
					)}
					<div className="mail-compose-field">
						<label htmlFor="compose-subject" className="sr-only">
							Subject
						</label>
						<input
							id="compose-subject"
							value={form.subject}
							onChange={(event) => form.setSubject(event.target.value)}
							placeholder="Subject"
						/>
					</div>
				</div>
				<div className="mail-compose-editor">
					<RichTextEditor value={form.body} onChange={form.setBody} />
				</div>
				<div className="mail-compose-footer">
					<button type="submit" className="mail-primary-button" disabled={busy}>
						<PaperPlaneTiltIcon size={17} />
						{form.isSending ? "Sending…" : "Send"}
					</button>
					<MailIconButton
						label="Save draft (⌘/Ctrl S)"
						disabled={busy}
						onClick={() => void form.handleSaveDraft()}
					>
						<FloppyDiskIcon size={20} />
					</MailIconButton>
					<span className="mail-draft-status" role="status">
						{form.isSavingDraft ? (
							"Saving…"
						) : form.saveState === "error" ? (
							"Not saved"
						) : form.dirty ? (
							"Unsaved changes"
						) : form.saveState === "saved" ? (
							<>
								<CheckIcon size={13} />
								Saved to Drafts
							</>
						) : (
							""
						)}
					</span>
					<MailIconButton
						label="Discard draft"
						className="mail-discard-button"
						disabled={busy}
						onClick={() => {
							if (form.hasContent || form.saveState === "saved")
								setDiscardOpen(true);
							else void form.handleDiscard();
						}}
					>
						<TrashIcon size={20} />
					</MailIconButton>
				</div>
			</form>
			<Dialog.Root open={discardOpen} onOpenChange={setDiscardOpen}>
				<Dialog size="sm" className="p-6 mail-dialog">
					<Dialog.Title className="text-lg mb-3">
						Discard this draft?
					</Dialog.Title>
					<Dialog.Description className="text-sm text-kumo-subtle mb-6">
						Your message will be deleted. To keep it, save and close the
						composer instead.
					</Dialog.Description>
					<div className="flex justify-end gap-2">
						<button
							className="mail-text-button"
							type="button"
							onClick={() => setDiscardOpen(false)}
						>
							Keep writing
						</button>
						<button
							className="mail-primary-button"
							type="button"
							disabled={busy}
							onClick={() => {
								setDiscardOpen(false);
								void form.handleDiscard();
							}}
						>
							Discard
						</button>
					</div>
				</Dialog>
			</Dialog.Root>
		</section>
	);
}
