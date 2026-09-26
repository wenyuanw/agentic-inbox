import { useI18n } from "~/hooks/useI18n";
import {
	ArchiveIcon,
	ArrowBendUpLeftIcon,
	EnvelopeOpenIcon,
	EnvelopeSimpleIcon,
	StarIcon,
	TrashIcon,
} from "@phosphor-icons/react";
import { type ReactNode } from "react";
import { formatListDate } from "shared/dates";
import { Folders } from "shared/folders";
import { getSnippetText } from "~/lib/utils";
import type { Email } from "~/types";
import MailIconButton from "./MailIconButton";

interface Props {
	email: Email;
	checked?: boolean;
	onCheck?: () => void;
	onOpen: () => void;
	onStar: () => void;
	onRead: () => void;
	onArchive: () => void;
	onTrash: () => void;
	busy?: boolean;
	folderLabel?: string;
	highlight?: (text: string) => ReactNode;
}

export default function EmailRow({
	email,
	checked,
	onCheck,
	onOpen,
	onStar,
	onRead,
	onArchive,
	onTrash,
	busy,
	folderLabel,
	highlight = (text) => text,
}: Props) {
	const { t, localeTag } = useI18n();

	const unread = (email.thread_unread_count ?? (email.read ? 0 : 1)) > 0;
	const participants = (
		email.participants ||
		email.sender ||
		t("Unknown sender")
	)
		.split(",")
		.map((sender) => sender.trim().split("@")[0])
		.filter((sender, i, all) => all.indexOf(sender) === i);
	const names =
		participants.length > 3
			? `${participants.slice(0, 2).join(", ")} +${participants.length - 2}`
			: participants.join(", ");
	const snippet = getSnippetText(email.snippet || email.body);
	return (
		<div
			className={`mail-row ${unread ? "is-unread" : ""} ${checked ? "is-checked" : ""}`}
		>
			{onCheck && (
				<div className="mail-row-select">
					<input
						type="checkbox"
						className="mail-checkbox"
						aria-label={t("Select {subject}", {
							subject: email.subject || t("(no subject)"),
						})}
						checked={!!checked}
						onChange={onCheck}
					/>
				</div>
			)}
			<MailIconButton
				label={email.starred ? t("Unstar email") : t("Star email")}
				className={`mail-row-star ${email.starred ? "is-starred" : ""}`}
				onClick={onStar}
				disabled={busy}
			>
				<StarIcon size={20} weight={email.starred ? "fill" : "regular"} />
			</MailIconButton>
			<button
				type="button"
				className="mail-row-open"
				onClick={onOpen}
				aria-label={`${unread ? t("Unread: ") : ""}${names}, ${email.subject || t("(no subject)")}`}
			>
				<span className="mail-row-sender">
					{highlight(names)}
					{(email.thread_count || 1) > 1 && <small>{email.thread_count}</small>}
				</span>
				<span className="mail-row-content">
					<span className="mail-row-topic">
						{(email.has_draft || email.folder_id === Folders.DRAFT) && (
							<span className="mail-draft-label">{t("Draft")}</span>
						)}
						{folderLabel && (
							<span className="mail-folder-chip">{folderLabel}</span>
						)}
						<span className="mail-row-subject">
							{highlight(email.subject || t("(no subject)"))}
						</span>
					</span>
					{snippet && (
						<span className="mail-row-snippet">
							<span className="mail-row-separator"> — </span>
							{highlight(snippet)}
						</span>
					)}
				</span>
				<span className="mail-row-date">
					{email.needs_reply && !email.has_draft && (
						<ArrowBendUpLeftIcon size={15} />
					)}
					<time dateTime={email.date}>
						{formatListDate(email.date, localeTag)}
					</time>
				</span>
			</button>
			<div className="mail-row-actions">
				{email.folder_id !== Folders.ARCHIVE &&
					email.folder_id !== Folders.TRASH &&
					email.folder_id !== Folders.DRAFT && (
						<MailIconButton
							label={t("Archive email")}
							onClick={onArchive}
							disabled={busy}
						>
							<ArchiveIcon size={19} />
						</MailIconButton>
					)}
				<MailIconButton
					label={
						email.folder_id === Folders.TRASH
							? t("Delete permanently")
							: t("Move to Trash")
					}
					onClick={onTrash}
					disabled={busy}
				>
					<TrashIcon size={19} />
				</MailIconButton>
				<MailIconButton
					label={unread ? t("Mark as read") : t("Mark as unread")}
					onClick={onRead}
					disabled={busy}
				>
					{unread ? (
						<EnvelopeOpenIcon size={19} />
					) : (
						<EnvelopeSimpleIcon size={19} />
					)}
				</MailIconButton>
			</div>
		</div>
	);
}
