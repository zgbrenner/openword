import type { Editor } from "@tiptap/core";
import type { OpenDocumentTab } from "../../core/document/model";
import type { WorkspaceUiState } from "../../store/workspaceStore";

export interface RibbonActions {
  openBackstage: () => void;
  openFindReplace: () => void;
  openPageSetup: () => void;
  openHeaderFooter: () => void;
  openLinkDialog: () => void;
  insertImage: () => void;
  addComment: () => void;
  toggleNavigation: () => void;
  toggleReview: () => void;
  setSpellcheck: (enabled: boolean) => void;
  setFormattingMarks: (enabled: boolean) => void;
  setDarkMode: (enabled: boolean) => void;
  setFocusMode: (enabled: boolean) => void;
  setLayoutMode: (mode: "print" | "web") => void;
  setZoom: (zoom: number) => void;
  openCommandPalette: () => void;
}

export interface RibbonTabProps {
  editor: Editor | null;
  tab: OpenDocumentTab;
  ui: WorkspaceUiState;
  revision: number;
  actions: RibbonActions;
}
