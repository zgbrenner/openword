import type { WorkspaceUiState } from "./workspaceStore";
import { useWorkspaceStore } from "./workspaceStore";

export const selectActiveTab = (state: ReturnType<typeof useWorkspaceStore.getState>) =>
  state.tabs.find((tab) => tab.id === state.activeTabId) ?? state.tabs[0];

export const selectUi = (state: ReturnType<typeof useWorkspaceStore.getState>): WorkspaceUiState => state.ui;
