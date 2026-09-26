import { useI18n } from "~/hooks/useI18n";
import {
	GearSixIcon,
	ListIcon,
	MagnifyingGlassIcon,
	SlidersHorizontalIcon,
	SparkleIcon,
	XIcon,
} from "@phosphor-icons/react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import {
	useLocation,
	useNavigate,
	useParams,
	useSearchParams,
} from "react-router";
import { parseSearchQuery } from "~/lib/search-parser";
import { useIsMobile } from "~/hooks/useIsMobile";
import { useUIStore } from "~/hooks/useUIStore";
import { useMailbox } from "~/queries/mailboxes";
import MailBrand from "./MailBrand";
import MailIconButton from "./MailIconButton";

export default function Header() {
	const { t } = useI18n();

	const isMobile = useIsMobile();
	const { mailboxId } = useParams<{ mailboxId: string }>();
	const { data: mailbox } = useMailbox(mailboxId);
	const navigate = useNavigate();
	const location = useLocation();
	const [searchParams] = useSearchParams();
	const urlQuery = searchParams.get("q") || "";
	const [searchQuery, setSearchQuery] = useState(urlQuery);
	const [filtersOpen, setFiltersOpen] = useState(false);
	const [from, setFrom] = useState("");
	const [subject, setSubject] = useState("");
	const [unread, setUnread] = useState(false);
	const [hasAttachment, setHasAttachment] = useState(false);
	const searchRef = useRef<HTMLInputElement>(null);
	const filtersRef = useRef<HTMLDivElement>(null);
	const filtersButtonRef = useRef<HTMLButtonElement>(null);
	const {
		toggleSidebar,
		toggleSidebarCollapsed,
		isSidebarCollapsed,
		isSidebarOpen,
		toggleAgentPanel,
		isAgentPanelOpen,
	} = useUIStore();

	useEffect(() => {
		const query = location.pathname.includes("/search") ? urlQuery : "";
		setSearchQuery(query);
		const parsed = parseSearchQuery(query);
		setFrom(parsed.from || "");
		setSubject(parsed.subject || "");
		setUnread(parsed.is_read === false);
		setHasAttachment(!!parsed.has_attachment);
		setFiltersOpen(false);
	}, [urlQuery, location.pathname]);

	useEffect(() => {
		const handler = (event: KeyboardEvent) => {
			const target = event.target as HTMLElement;
			const editing =
				target.matches("input, textarea, select") || target.isContentEditable;
			if (
				((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") ||
				(event.key === "/" && !editing)
			) {
				event.preventDefault();
				searchRef.current?.focus();
			}
		};
		document.addEventListener("keydown", handler);
		return () => document.removeEventListener("keydown", handler);
	}, []);

	useEffect(() => {
		if (!filtersOpen) return;
		filtersRef.current?.querySelector<HTMLInputElement>("input")?.focus();
		const handleOutside = (event: MouseEvent) => {
			if (
				!filtersRef.current?.contains(event.target as Node) &&
				!filtersButtonRef.current?.contains(event.target as Node)
			)
				setFiltersOpen(false);
		};
		document.addEventListener("mousedown", handleOutside);
		return () => document.removeEventListener("mousedown", handleOutside);
	}, [filtersOpen]);

	const search = (query: string) => {
		if (!mailboxId || !query.trim()) return;
		navigate(
			`/mailbox/${mailboxId}/search?q=${encodeURIComponent(query.trim())}`,
		);
		setFiltersOpen(false);
		searchRef.current?.blur();
	};
	const clearSearch = () => {
		setSearchQuery("");
		searchRef.current?.focus();
		if (location.pathname.includes("/search"))
			navigate(`/mailbox/${mailboxId}/emails/inbox`);
	};
	const filterSearch = (event: FormEvent) => {
		event.preventDefault();
		const quote = (value: string) => `"${value.trim().replaceAll('"', "")}"`;
		const baseQuery = searchQuery
			.replace(
				/\b(?:from|subject):(?:"[^"]*"|\S+)|\bis:(?:unread|read)\b|\bhas:attachment\b/gi,
				"",
			)
			.trim();
		const query = [
			baseQuery,
			from.trim() && `from:${quote(from)}`,
			subject.trim() && `subject:${quote(subject)}`,
			unread && "is:unread",
			hasAttachment && "has:attachment",
		]
			.filter(Boolean)
			.join(" ");
		setSearchQuery(query);
		search(query);
	};
	const isSettings = location.pathname.includes("/settings");

	return (
		<header className="mail-header" inert={isMobile && isSidebarOpen}>
			<div className="mail-header-brand">
				<MailIconButton
					label={t("Toggle navigation")}
					aria-expanded={isMobile ? isSidebarOpen : !isSidebarCollapsed}
					onClick={() => {
						if (window.matchMedia("(max-width: 767px)").matches)
							toggleSidebar();
						else toggleSidebarCollapsed();
					}}
				>
					<ListIcon size={23} />
				</MailIconButton>
				<MailBrand />
			</div>
			<div className="mail-search-area">
				<form
					className={`mail-search ${filtersOpen ? "is-expanded" : ""}`}
					role="search"
					onSubmit={(event) => {
						event.preventDefault();
						search(searchQuery);
					}}
				>
					<MailIconButton label={t("Search mail")} type="submit">
						<MagnifyingGlassIcon size={22} />
					</MailIconButton>
					<input
						ref={searchRef}
						type="search"
						aria-label={t("Search mail")}
						placeholder={t("Search mail")}
						value={searchQuery}
						onChange={(event) => setSearchQuery(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === "Escape") {
								event.stopPropagation();
								setFiltersOpen(false);
								searchRef.current?.blur();
							}
						}}
					/>
					{searchQuery && (
						<MailIconButton label={t("Clear search")} onClick={clearSearch}>
							<XIcon size={20} />
						</MailIconButton>
					)}
					<MailIconButton
						ref={filtersButtonRef}
						label={t("Show search options")}
						active={filtersOpen}
						aria-expanded={filtersOpen}
						aria-controls="mail-search-options"
						onClick={() => setFiltersOpen(!filtersOpen)}
					>
						<SlidersHorizontalIcon size={21} />
					</MailIconButton>
				</form>
				{filtersOpen && (
					<div
						ref={filtersRef}
						id="mail-search-options"
						className="mail-search-options"
						onKeyDown={(event) => {
							if (event.key === "Escape") {
								event.stopPropagation();
								setFiltersOpen(false);
								filtersButtonRef.current?.focus();
							}
						}}
					>
						<form onSubmit={filterSearch}>
							<div className="mail-popover-heading">
								{t("Search options")}
								<MailIconButton
									label={t("Close search options")}
									onClick={() => {
										setFiltersOpen(false);
										filtersButtonRef.current?.focus();
									}}
								>
									<XIcon size={18} />
								</MailIconButton>
							</div>
							<label className="mail-filter-field">
								{t("From")}
								<input
									value={from}
									onChange={(event) => setFrom(event.target.value)}
									placeholder={t("Name or email address")}
								/>
							</label>
							<label className="mail-filter-field">
								{t("Subject")}
								<input
									value={subject}
									onChange={(event) => setSubject(event.target.value)}
									placeholder={t("Words in the subject")}
								/>
							</label>
							<div className="mail-filter-checks">
								<label>
									<input
										type="checkbox"
										checked={unread}
										onChange={(event) => setUnread(event.target.checked)}
									/>{" "}
									{t("Unread only")}
								</label>
								<label>
									<input
										type="checkbox"
										checked={hasAttachment}
										onChange={(event) => setHasAttachment(event.target.checked)}
									/>{" "}
									{t("Has attachment")}
								</label>
							</div>
							<div className="mail-filter-footer">
								<span>{t("Tip: try from:name or is:starred")}</span>
								<button className="mail-primary-button" type="submit">
									{t("Search")}
								</button>
							</div>
						</form>
					</div>
				)}
			</div>
			<div className="mail-header-actions">
				<MailIconButton
					label={
						isAgentPanelOpen
							? t("Close email assistant")
							: t("Open email assistant")
					}
					active={isAgentPanelOpen}
					onClick={toggleAgentPanel}
					className="mail-mobile-assistant"
				>
					<SparkleIcon size={21} />
				</MailIconButton>
				<MailIconButton
					label={t("Settings")}
					active={isSettings}
					onClick={() =>
						navigate(
							`/mailbox/${mailboxId}/${isSettings ? "emails/inbox" : "settings"}`,
						)
					}
				>
					<GearSixIcon size={23} />
				</MailIconButton>
				<button
					type="button"
					className="mail-account-avatar"
					aria-label={t("Switch mailbox ({email})", {
						email: mailbox?.email || mailboxId || "",
					})}
					title={mailbox?.email || mailboxId}
					onClick={() => navigate("/")}
				>
					{(mailbox?.settings?.fromName || mailboxId || "A")
						.charAt(0)
						.toUpperCase()}
				</button>
			</div>
		</header>
	);
}
