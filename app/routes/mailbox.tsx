import {
	SparkleIcon,
	PlugsIcon,
	XIcon,
	PencilSimpleIcon,
} from "@phosphor-icons/react";
import { useEffect, useRef } from "react";
import { Outlet, useParams } from "react-router";
import AgentSidebar from "~/components/AgentSidebar";
import ComposePanel from "~/components/ComposePanel";
import Header from "~/components/Header";
import MailIconButton from "~/components/MailIconButton";
import MailSnackbar from "~/components/MailSnackbar";
import Sidebar from "~/components/Sidebar";
import { useIsMobile } from "~/hooks/useIsMobile";
import { useMailbox } from "~/queries/mailboxes";
import { useUIStore } from "~/hooks/useUIStore";

export default function MailboxRoute() {
	const { mailboxId } = useParams<{ mailboxId: string }>();
	useMailbox(mailboxId);
	const previousMailbox = useRef(mailboxId);
	const mountedRef = useRef(false);
	const sidebarRef = useRef<HTMLDivElement>(null);
	const isMobile = useIsMobile();
	const {
		isSidebarOpen,
		isSidebarCollapsed,
		closeSidebar,
		isAgentPanelOpen,
		assistantTab,
		openAssistant,
		closeAssistant,
		closePanel,
		isComposing,
		startCompose,
		closeCompose,
	} = useUIStore();
	useEffect(() => {
		if (previousMailbox.current !== mailboxId) {
			closePanel();
			closeCompose();
			closeSidebar();
		}
		previousMailbox.current = mailboxId;
	}, [mailboxId, closePanel, closeCompose, closeSidebar]);
	useEffect(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
			// Strict Mode replays mount effects; only reset when this route actually leaves.
			queueMicrotask(() => {
				if (!mountedRef.current) {
					closePanel();
					closeCompose();
					closeSidebar();
				}
			});
		};
	}, [closePanel, closeCompose, closeSidebar]);
	useEffect(() => {
		if (!isMobile || !isSidebarOpen) return;
		const previous = document.activeElement as HTMLElement;
		sidebarRef.current?.querySelector<HTMLElement>("button, a")?.focus();
		const trapFocus = (event: KeyboardEvent) => {
			if (event.defaultPrevented) return;
			const dialog = (event.target as HTMLElement).closest('[role="dialog"]');
			if (dialog && dialog !== sidebarRef.current) return;
			if (event.key === "Escape") {
				event.preventDefault();
				closeSidebar();
			}
			if (event.key !== "Tab") return;
			const items = [
				...(sidebarRef.current?.querySelectorAll<HTMLElement>(
					'a, button:not(:disabled), input, [tabindex="0"]',
				) || []),
			].filter((element) => element.offsetParent !== null);
			const first = items[0],
				last = items.at(-1);
			if (event.shiftKey && document.activeElement === first) {
				event.preventDefault();
				last?.focus();
			} else if (!event.shiftKey && document.activeElement === last) {
				event.preventDefault();
				first?.focus();
			}
		};
		document.addEventListener("keydown", trapFocus);
		return () => {
			document.removeEventListener("keydown", trapFocus);
			if (previous?.isConnected) previous.focus();
		};
	}, [isMobile, isSidebarOpen, closeSidebar]);
	useEffect(() => {
		const handler = (event: KeyboardEvent) => {
			const target = event.target as HTMLElement;
			if (
				target.matches("input, textarea, select") ||
				target.isContentEditable ||
				target.closest('[role="dialog"]')
			)
				return;
			if (
				event.key === "c" &&
				!event.metaKey &&
				!event.ctrlKey &&
				!event.altKey &&
				!isComposing
			) {
				event.preventDefault();
				startCompose();
			}
			if (event.key === "Escape") {
				closeSidebar();
				if (isAgentPanelOpen) closeAssistant();
				else closePanel();
			}
		};
		document.addEventListener("keydown", handler);
		return () => document.removeEventListener("keydown", handler);
	}, [
		isComposing,
		isAgentPanelOpen,
		startCompose,
		closeSidebar,
		closeAssistant,
		closePanel,
	]);
	return (
		<div
			className={`mail-shell ${isSidebarCollapsed ? "navigation-collapsed" : ""}`}
		>
			<a href="#mail-content" className="mail-skip-link">
				Skip to mail
			</a>
			<Header />
			<div className="mail-workspace">
				{isSidebarOpen && (
					<button
						className="mail-sidebar-backdrop"
						aria-label="Close navigation"
						onClick={closeSidebar}
					/>
				)}
				<div
					ref={sidebarRef}
					inert={isMobile && !isSidebarOpen}
					role={isMobile && isSidebarOpen ? "dialog" : undefined}
					aria-modal={isMobile && isSidebarOpen ? true : undefined}
					aria-label="Mailbox navigation"
					className={`mail-sidebar-container ${isSidebarOpen ? "is-open" : ""}`}
				>
					<button
						className="mail-sidebar-close"
						onClick={closeSidebar}
						aria-label="Close navigation"
					>
						<XIcon size={22} />
					</button>
					<Sidebar />
				</div>
				<main
					id="mail-content"
					tabIndex={-1}
					className="mail-content"
					inert={isMobile && isSidebarOpen}
				>
					<Outlet />
				</main>
				<div
					className={`mail-assistant-container ${isAgentPanelOpen ? "is-open" : ""}`}
				>
					{isAgentPanelOpen && (
						<>
							<div className="mail-assistant-title">
								<span>
									<SparkleIcon size={20} weight="duotone" />
									Your email assistant
								</span>
								<MailIconButton
									label="Close email assistant"
									onClick={closeAssistant}
								>
									<XIcon size={18} />
								</MailIconButton>
							</div>
							<AgentSidebar />
						</>
					)}
				</div>
				<aside className="mail-app-rail" aria-label="Email tools">
					<MailIconButton
						label="Email assistant"
						active={isAgentPanelOpen && assistantTab === "agent"}
						onClick={() => {
							if (isAgentPanelOpen && assistantTab === "agent")
								closeAssistant();
							else openAssistant("agent");
						}}
					>
						<SparkleIcon size={23} weight="duotone" />
					</MailIconButton>
					<MailIconButton
						label="MCP connections"
						active={isAgentPanelOpen && assistantTab === "mcp"}
						onClick={() => {
							if (isAgentPanelOpen && assistantTab === "mcp") closeAssistant();
							else openAssistant("mcp");
						}}
					>
						<PlugsIcon size={21} />
					</MailIconButton>
				</aside>
			</div>
			{isMobile && !isComposing && !isSidebarOpen && (
				<button
					type="button"
					className="mail-mobile-compose-button"
					onClick={() => startCompose()}
				>
					<PencilSimpleIcon size={23} />
					Compose
				</button>
			)}
			{isComposing && <ComposePanel key={mailboxId} />}
			<MailSnackbar />
		</div>
	);
}
