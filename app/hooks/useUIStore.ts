// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { create } from "zustand";
import type { Email } from "~/types";

export type ComposeMode = "new" | "reply" | "reply-all" | "forward";

export interface ComposeOptions {
	mode: ComposeMode;
	originalEmail?: Email | null;
	/** When editing a draft, this holds the draft email to pre-fill the composer */
	draftEmail?: Email | null;
}

interface UIState {
	// Side panel state
	selectedEmailId: string | null;
	isComposing: boolean;
	composeFocusRequest: number;
	_previousEmailId: string | null;
	selectEmail: (id: string | null) => void;
	startCompose: (options?: ComposeOptions) => void;
	closePanel: () => void;
	closeCompose: () => void;

	// Compose options
	composeOptions: ComposeOptions;

	// Mobile sidebar
	isSidebarOpen: boolean;
	openSidebar: () => void;
	closeSidebar: () => void;
	toggleSidebar: () => void;
	isSidebarCollapsed: boolean;
	toggleSidebarCollapsed: () => void;

	// Agent panel
	isAgentPanelOpen: boolean;
	toggleAgentPanel: () => void;
	assistantTab: "agent" | "mcp";
	openAssistant: (tab: "agent" | "mcp") => void;
	closeAssistant: () => void;
	notice: { message: string; actionLabel?: string; action?: () => void } | null;
	showNotice: (notice: NonNullable<UIState["notice"]>) => void;
	clearNotice: () => void;

	// Legacy dialog support (kept for non-split views)
	isComposeModalOpen: boolean;
	openComposeModal: (options?: ComposeOptions) => void;
	closeComposeModal: () => void;
}

export const useUIStore = create<UIState>((set, get) => ({
	selectedEmailId: null,
	isComposing: false,
	composeFocusRequest: 0,
	_previousEmailId: null,
	composeOptions: { mode: "new", originalEmail: null },
	isComposeModalOpen: false,
	isSidebarOpen: false,
	isAgentPanelOpen: false,
	isSidebarCollapsed: false,
	assistantTab: "agent",
	notice: null,
	showNotice: (notice) => set({ notice }),
	clearNotice: () => set({ notice: null }),
	openAssistant: (tab) => set({ assistantTab: tab, isAgentPanelOpen: true }),
	closeAssistant: () => set({ isAgentPanelOpen: false }),
	toggleSidebarCollapsed: () =>
		set({ isSidebarCollapsed: !get().isSidebarCollapsed }),

	selectEmail: (id) => set({ selectedEmailId: id }),

	startCompose: (options) =>
		set((state) => {
			if (state.isComposing)
				return {
					composeFocusRequest: state.composeFocusRequest + 1,
					notice: options
						? {
								message:
									"Save or discard your current draft before starting another message.",
							}
						: state.notice,
				};
			return {
				isComposing: true,
				_previousEmailId: state.selectedEmailId,
				// Keep selectedEmailId when replying/forwarding so the thread stays visible
				selectedEmailId: state.selectedEmailId,
				composeOptions: options || { mode: "new", originalEmail: null },
				isSidebarOpen: false,
			};
		}),

	closePanel: () => set({ selectedEmailId: null }),

	closeCompose: () =>
		set({
			isComposing: false,
			_previousEmailId: null,
			composeOptions: { mode: "new" as const, originalEmail: null },
		}),

	openSidebar: () => set({ isSidebarOpen: true }),
	closeSidebar: () => set({ isSidebarOpen: false }),
	toggleSidebar: () => set({ isSidebarOpen: !get().isSidebarOpen }),

	toggleAgentPanel: () => set({ isAgentPanelOpen: !get().isAgentPanelOpen }),

	openComposeModal: (options) =>
		set({
			composeOptions: options || { mode: "new", originalEmail: null },
			isComposeModalOpen: true,
		}),

	closeComposeModal: () =>
		set({
			isComposeModalOpen: false,
			composeOptions: { mode: "new", originalEmail: null },
		}),
}));
