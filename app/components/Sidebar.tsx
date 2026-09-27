import { useI18n } from "~/hooks/useI18n";
import { Dialog, Input } from "@cloudflare/kumo";
import {
	ArchiveIcon,
	FileIcon,
	FolderSimpleIcon,
	PaperPlaneTiltIcon,
	PencilSimpleIcon,
	PlusIcon,
	ShieldWarningIcon,
	StarIcon,
	TrashIcon,
	TrayIcon,
	WarningCircleIcon,
} from "@phosphor-icons/react";
import { type FormEvent, useState } from "react";
import {
	NavLink,
	useLocation,
	useParams,
	useSearchParams,
} from "react-router";
import { Folders } from "shared/folders";
import { useCreateFolder, useFolders } from "~/queries/folders";
import { useUIStore } from "~/hooks/useUIStore";
import MailIconButton from "./MailIconButton";

const SYSTEM_LINKS = [
	{ id: Folders.INBOX, label: "Inbox", icon: TrayIcon },
	{ id: "starred", label: "Starred", icon: StarIcon },
	{ id: Folders.SENT, label: "Sent", icon: PaperPlaneTiltIcon },
	{ id: Folders.DRAFT, label: "Drafts", icon: FileIcon },
	{ id: Folders.ARCHIVE, label: "Archive", icon: ArchiveIcon },
	{ id: Folders.SPAM, label: "Spam", icon: ShieldWarningIcon },
	{ id: Folders.TRASH, label: "Trash", icon: TrashIcon },
];

export default function Sidebar() {
	const { t } = useI18n();

	const { mailboxId } = useParams<{ mailboxId: string }>();
	const location = useLocation();
	const [searchParams] = useSearchParams();
	const { data: folders = [] } = useFolders(mailboxId);
	const createFolder = useCreateFolder();
	const { startCompose, closeSidebar, closePanel, isSidebarCollapsed } =
		useUIStore();
	const navigateFolder = () => {
		closePanel();
		closeSidebar();
	};
	const [createOpen, setCreateOpen] = useState(false);
	const [folderName, setFolderName] = useState("");
	const [error, setError] = useState("");
	const customFolders = folders.filter(
		(folder) =>
			!Object.values(Folders).includes(
				folder.id as (typeof Folders)[keyof typeof Folders],
			),
	);
	const handleCreate = async (event: FormEvent) => {
		event.preventDefault();
		if (!mailboxId || !folderName.trim()) return;
		setError("");
		try {
			await createFolder.mutateAsync({ mailboxId, name: folderName.trim() });
			setCreateOpen(false);
			setFolderName("");
		} catch (error) {
			setError(
				error instanceof Error
					? t(error.message)
					: t("Could not create folder."),
			);
		}
	};
	return (
		<aside
			className={`mail-sidebar ${isSidebarCollapsed ? "is-collapsed" : ""}`}
			aria-label={t("Mailbox navigation")}
		>
			<div className="mail-compose-area">
				<button
					className="mail-compose-button"
					type="button"
					onClick={() => {
						startCompose();
						closeSidebar();
					}}
					title={t("Compose (C)")}
				>
					<PencilSimpleIcon size={25} />
					<span>{t("Compose")}</span>
				</button>
			</div>
			<nav className="mail-navigation" aria-label={t("Mail folders")}>
				{SYSTEM_LINKS.map(({ id, label: labelKey, icon: Icon }) => {
					const label = t(labelKey);
					const count =
						folders.find((folder) => folder.id === id)?.unreadCount || 0;
					const starred = id === "starred";
					const active = starred
						? location.pathname.endsWith("/search") &&
							searchParams.get("q") === "is:starred"
						: location.pathname.endsWith(`/emails/${id}`);
					return (
						<NavLink
							key={id}
							to={
								starred
									? `/mailbox/${mailboxId}/search?q=is:starred`
									: `/mailbox/${mailboxId}/emails/${id}`
							}
							onClick={navigateFolder}
							className={`mail-nav-link ${active ? "is-active" : ""}`}
							title={label}
							aria-current={active ? "page" : false}
						>
							<Icon size={20} weight={active ? "fill" : "regular"} />
							<span className="mail-nav-label">{label}</span>
							{count > 0 && <span className="mail-nav-count">{count}</span>}
						</NavLink>
					);
				})}
				<NavLink
					to={`/mailbox/${mailboxId}/unconfigured`}
					onClick={navigateFolder}
					className={`mail-nav-link ${location.pathname.endsWith("/unconfigured") ? "is-active" : ""}`}
					title={t("Unconfigured mail")}
					aria-current={location.pathname.endsWith("/unconfigured") ? "page" : false}
				>
					<WarningCircleIcon size={20} weight={location.pathname.endsWith("/unconfigured") ? "fill" : "regular"} />
					<span className="mail-nav-label">{t("Unconfigured mail")}</span>
				</NavLink>
				<div className="mail-folder-heading">
					<span>{t("Folders")}</span>
					<MailIconButton
						label={t("Create folder")}
						onClick={() => setCreateOpen(true)}
					>
						<PlusIcon size={20} />
					</MailIconButton>
				</div>
				{customFolders.map((folder) => (
					<NavLink
						key={folder.id}
						to={`/mailbox/${mailboxId}/emails/${folder.id}`}
						onClick={navigateFolder}
						className={({ isActive }) =>
							`mail-nav-link ${isActive ? "is-active" : ""}`
						}
						title={folder.name}
					>
						<FolderSimpleIcon size={20} />
						<span className="mail-nav-label">{folder.name}</span>
						{folder.unreadCount > 0 && (
							<span className="mail-nav-count">{folder.unreadCount}</span>
						)}
					</NavLink>
				))}
				{customFolders.length === 0 && (
					<button
						className="mail-add-folder"
						type="button"
						onClick={() => setCreateOpen(true)}
					>
						<PlusIcon size={16} />
						<span>{t("Create a folder")}</span>
					</button>
				)}
			</nav>
			<Dialog.Root open={createOpen} onOpenChange={setCreateOpen}>
				<Dialog size="sm" className="p-6 mail-dialog">
					<Dialog.Title className="text-lg font-medium mb-5">
						{t("New folder")}
					</Dialog.Title>
					<form onSubmit={handleCreate} className="space-y-5">
						<Input
							label={t("Folder name")}
							placeholder={t("e.g. Projects")}
							value={folderName}
							onChange={(event) => setFolderName(event.target.value)}
							required
							autoFocus
						/>
						{error && (
							<p role="alert" className="mail-form-error">
								{t(error)}
							</p>
						)}
						<div className="flex justify-end gap-2">
							<button
								type="button"
								className="mail-text-button"
								onClick={() => setCreateOpen(false)}
							>
								{t("Cancel")}
							</button>
							<button
								type="submit"
								className="mail-primary-button"
								disabled={!folderName.trim() || createFolder.isPending}
							>
								{createFolder.isPending ? t("Creating…") : t("Create")}
							</button>
						</div>
					</form>
				</Dialog>
			</Dialog.Root>
		</aside>
	);
}
