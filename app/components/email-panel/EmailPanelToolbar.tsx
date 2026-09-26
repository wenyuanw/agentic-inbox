import {
	ArchiveIcon,
	ArrowLeftIcon,
	CodeIcon,
	EnvelopeOpenIcon,
	EnvelopeSimpleIcon,
	FolderSimpleIcon,
	PencilSimpleIcon,
	StarIcon,
	TrashIcon,
} from "@phosphor-icons/react";
import { Folders } from "shared/folders";
import MailIconButton from "~/components/MailIconButton";
import type { Folder, Email } from "~/types";

interface Props {
	email: Email;
	isDraftFolder: boolean;
	busy: boolean;
	moveToFolders: Folder[];
	onBack: () => void;
	onEditDraft: () => void;
	onToggleStar: () => void;
	onToggleRead: () => void;
	onArchive: () => void;
	onMove: (folderId: string) => void;
	onViewSource: () => void;
	onDelete: () => void;
}
export default function EmailPanelToolbar({
	email,
	isDraftFolder,
	busy,
	moveToFolders,
	onBack,
	onEditDraft,
	onToggleStar,
	onToggleRead,
	onArchive,
	onMove,
	onViewSource,
	onDelete,
}: Props) {
	return (
		<div className="mail-reader-toolbar">
			<MailIconButton label="Back to list" onClick={onBack}>
				<ArrowLeftIcon size={20} />
			</MailIconButton>
			<div className="mail-toolbar-divider" />
			{isDraftFolder ? (
				<button className="mail-text-button" onClick={onEditDraft}>
					<PencilSimpleIcon size={17} />
					Edit draft
				</button>
			) : (
				<>
					{email.folder_id !== Folders.ARCHIVE &&
						email.folder_id !== Folders.TRASH && (
							<MailIconButton
								label="Archive conversation"
								disabled={busy}
								onClick={onArchive}
							>
								<ArchiveIcon size={20} />
							</MailIconButton>
						)}
					<MailIconButton
						label={email.read ? "Mark as unread" : "Mark as read"}
						disabled={busy}
						onClick={onToggleRead}
					>
						{email.read ? (
							<EnvelopeSimpleIcon size={20} />
						) : (
							<EnvelopeOpenIcon size={20} />
						)}
					</MailIconButton>
					<label className="mail-move-select" title="Move to folder">
						<FolderSimpleIcon size={20} />
						<select
							aria-label="Move to folder"
							disabled={busy}
							value=""
							onChange={(event) => {
								if (event.target.value) onMove(event.target.value);
							}}
						>
							<option value="" disabled>
								Move to folder
							</option>
							{moveToFolders
								.filter(
									(folder) =>
										folder.id !== Folders.DRAFT && folder.id !== Folders.SENT,
								)
								.map((folder) => (
									<option key={folder.id} value={folder.id}>
										{folder.name}
									</option>
								))}
						</select>
					</label>
				</>
			)}
			<MailIconButton
				label={
					email.folder_id === Folders.TRASH
						? "Delete permanently"
						: isDraftFolder
							? "Discard draft"
							: "Move conversation to Trash"
				}
				disabled={busy}
				onClick={onDelete}
			>
				<TrashIcon size={20} />
			</MailIconButton>
			<div className="mail-toolbar-spacer" />
			<MailIconButton
				label={email.starred ? "Unstar email" : "Star email"}
				disabled={busy}
				onClick={onToggleStar}
			>
				<StarIcon
					size={20}
					weight={email.starred ? "fill" : "regular"}
					className={email.starred ? "text-amber-500" : ""}
				/>
			</MailIconButton>
			<MailIconButton label="View source" onClick={onViewSource}>
				<CodeIcon size={20} />
			</MailIconButton>
		</div>
	);
}
