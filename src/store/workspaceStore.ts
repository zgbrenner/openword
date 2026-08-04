import { create } from "zustand";
import { createBlankDocument, touchDocument } from "../core/document/factory";
import type {
  CommentThread,
  FileDescriptor,
  LayoutMode,
  OpenDocumentTab,
  OpenWordDocument,
  PageSetup,
  SidebarKind,
} from "../core/document/model";
import { createDocumentFromTemplate, type TemplateId } from "../core/document/templates";
import {
  loadRecoverySnapshots,
  removeRecoverySnapshot,
  saveRecoverySnapshot,
} from "../core/storage/recovery";

export type RibbonTabId = "home" | "insert" | "layout" | "review" | "view";

export interface WorkspaceUiState {
  activeRibbonTab: RibbonTabId;
  leftSidebar: boolean;
  rightSidebar: boolean;
  zoom: number;
  layoutMode: LayoutMode;
  darkMode: boolean;
  focusMode: boolean;
  backstageOpen: boolean;
  commandPaletteOpen: boolean;
  findReplaceOpen: boolean;
  pageSetupOpen: boolean;
}

export interface RecentFile extends FileDescriptor {
  openedAt: string;
}

interface WorkspaceState {
  tabs: OpenDocumentTab[];
  activeTabId: string;
  ui: WorkspaceUiState;
  recentFiles: RecentFile[];
  newDocument: (template?: TemplateId) => void;
  openDocument: (document: OpenWordDocument, file?: FileDescriptor) => void;
  closeDocument: (id: string) => void;
  setActiveTab: (id: string) => void;
  updateDocument: (id: string, patch: Partial<OpenWordDocument>) => void;
  markSaved: (id: string, file: FileDescriptor) => void;
  addCommentThread: (thread: CommentThread) => void;
  updateCommentThread: (id: string, patch: Partial<CommentThread>) => void;
  deleteCommentThread: (id: string) => void;
  setRibbonTab: (tab: RibbonTabId) => void;
  toggleSidebar: (kind: SidebarKind) => void;
  setZoom: (zoom: number) => void;
  setLayoutMode: (mode: LayoutMode) => void;
  setUi: (patch: Partial<WorkspaceUiState>) => void;
  updatePageSetup: (page: PageSetup) => void;
  setDocumentTitle: (id: string, title: string) => void;
  restoreRecoverySnapshots: () => number;
  resetForTests: () => void;
}

const RECENT_KEY = "openword.recent.v1";
const recoveryTimers = new Map<string, number>();

const DEFAULT_UI: WorkspaceUiState = {
  activeRibbonTab: "home",
  leftSidebar: false,
  rightSidebar: false,
  zoom: 100,
  layoutMode: "print",
  darkMode: typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches === true,
  focusMode: false,
  backstageOpen: false,
  commandPaletteOpen: false,
  findReplaceOpen: false,
  pageSetupOpen: false,
};

function makeTab(document = createBlankDocument(), file?: FileDescriptor, dirty = false): OpenDocumentTab {
  return {
    id: document.id,
    document,
    file,
    dirty,
    lastSavedAt: dirty ? undefined : new Date().toISOString(),
  };
}

function initialTabs(): OpenDocumentTab[] {
  return [makeTab()];
}

function loadRecentFiles(): RecentFile[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const value = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as unknown;
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is RecentFile => Boolean(
      item && typeof item === "object" && typeof (item as RecentFile).name === "string" && typeof (item as RecentFile).format === "string" && typeof (item as RecentFile).openedAt === "string",
    )).slice(0, 20);
  } catch {
    return [];
  }
}

function persistRecentFiles(files: RecentFile[]): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(files.slice(0, 20)));
  } catch {
    // Recent-file metadata is optional.
  }
}

function addRecent(current: RecentFile[], file?: FileDescriptor): RecentFile[] {
  if (!file) return current;
  const next: RecentFile = { ...file, openedAt: new Date().toISOString() };
  const filtered = current.filter((candidate) => candidate.path
    ? candidate.path !== file.path
    : !(candidate.name === file.name && candidate.format === file.format));
  const result = [next, ...filtered].slice(0, 20);
  persistRecentFiles(result);
  return result;
}

function scheduleRecovery(document: OpenWordDocument): void {
  if (typeof window === "undefined") return;
  const existing = recoveryTimers.get(document.id);
  if (existing !== undefined) window.clearTimeout(existing);
  const timer = window.setTimeout(() => {
    saveRecoverySnapshot(document);
    recoveryTimers.delete(document.id);
  }, 500);
  recoveryTimers.set(document.id, timer);
}

function activeDocumentPatch(
  state: WorkspaceState,
  transform: (document: OpenWordDocument) => OpenWordDocument,
): Pick<WorkspaceState, "tabs"> {
  return {
    tabs: state.tabs.map((tab) => {
      if (tab.id !== state.activeTabId) return tab;
      const document = touchDocument(transform(tab.document));
      scheduleRecovery(document);
      return { ...tab, document, dirty: true };
    }),
  };
}

const freshState = () => {
  const tabs = initialTabs();
  return {
    tabs,
    activeTabId: tabs[0]!.id,
    ui: { ...DEFAULT_UI },
    recentFiles: loadRecentFiles(),
  };
};

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  ...freshState(),

  newDocument: (template = "blank") => {
    const document = createDocumentFromTemplate(template);
    set((state) => ({
      tabs: [...state.tabs, makeTab(document, undefined, true)],
      activeTabId: document.id,
      ui: { ...state.ui, backstageOpen: false },
    }));
    scheduleRecovery(document);
  },

  openDocument: (document, file) => set((state) => {
    const existing = state.tabs.find((tab) => tab.document.id === document.id && tab.file?.path === file?.path);
    if (existing) return { activeTabId: existing.id, recentFiles: addRecent(state.recentFiles, file) };
    const tab = makeTab(document, file, false);
    return {
      tabs: [...state.tabs, tab],
      activeTabId: tab.id,
      recentFiles: addRecent(state.recentFiles, file),
      ui: { ...state.ui, backstageOpen: false },
    };
  }),

  closeDocument: (id) => set((state) => {
    const remaining = state.tabs.filter((tab) => tab.id !== id);
    const tabs = remaining.length ? remaining : initialTabs();
    const activeTabId = state.activeTabId === id
      ? tabs[Math.max(0, state.tabs.findIndex((tab) => tab.id === id) - 1)]?.id ?? tabs[0]!.id
      : state.activeTabId;
    removeRecoverySnapshot(id);
    return { tabs, activeTabId };
  }),

  setActiveTab: (id) => {
    if (get().tabs.some((tab) => tab.id === id)) set({ activeTabId: id });
  },

  updateDocument: (id, patch) => set((state) => ({
    tabs: state.tabs.map((tab) => {
      if (tab.id !== id) return tab;
      const document = touchDocument({ ...tab.document, ...patch });
      scheduleRecovery(document);
      return { ...tab, document, dirty: true };
    }),
  })),

  markSaved: (id, file) => {
    const timer = recoveryTimers.get(id);
    if (timer !== undefined && typeof window !== "undefined") window.clearTimeout(timer);
    recoveryTimers.delete(id);
    removeRecoverySnapshot(id);
    set((state) => ({
      tabs: state.tabs.map((tab) => tab.id === id ? {
        ...tab,
        file,
        dirty: false,
        lastSavedAt: new Date().toISOString(),
        document: {
          ...tab.document,
          source: { format: file.format, path: file.path, importedAt: tab.document.source?.importedAt },
        },
      } : tab),
      recentFiles: addRecent(state.recentFiles, file),
    }));
  },

  addCommentThread: (thread) => set((state) => activeDocumentPatch(state, (document) => ({
    ...document,
    comments: [...document.comments, thread],
  }))),

  updateCommentThread: (id, patch) => set((state) => activeDocumentPatch(state, (document) => ({
    ...document,
    comments: document.comments.map((thread) => thread.id === id ? { ...thread, ...patch } : thread),
  }))),

  deleteCommentThread: (id) => set((state) => activeDocumentPatch(state, (document) => ({
    ...document,
    comments: document.comments.filter((thread) => thread.id !== id),
  }))),

  setRibbonTab: (activeRibbonTab) => set((state) => ({ ui: { ...state.ui, activeRibbonTab } })),

  toggleSidebar: (kind) => set((state) => ({
    ui: kind === "navigation"
      ? { ...state.ui, leftSidebar: !state.ui.leftSidebar }
      : { ...state.ui, rightSidebar: !state.ui.rightSidebar },
  })),

  setZoom: (zoom) => set((state) => ({ ui: { ...state.ui, zoom: Math.min(200, Math.max(50, Math.round(zoom / 10) * 10)) } })),
  setLayoutMode: (layoutMode) => set((state) => ({ ui: { ...state.ui, layoutMode } })),
  setUi: (patch) => set((state) => ({ ui: { ...state.ui, ...patch } })),

  updatePageSetup: (page) => set((state) => activeDocumentPatch(state, (document) => ({ ...document, page }))),
  setDocumentTitle: (id, title) => get().updateDocument(id, { title: title.trim() || "Untitled document" }),

  restoreRecoverySnapshots: () => {
    const snapshots = loadRecoverySnapshots();
    let restored = 0;
    set((state) => {
      const known = new Set(state.tabs.map((tab) => tab.document.id));
      const recoveredTabs = snapshots.flatMap((snapshot) => {
        if (known.has(snapshot.document.id)) return [];
        known.add(snapshot.document.id);
        restored += 1;
        return [makeTab(snapshot.document, undefined, true)];
      });
      if (!recoveredTabs.length) return state;
      return {
        tabs: [...state.tabs, ...recoveredTabs],
        activeTabId: recoveredTabs.at(-1)!.id,
      };
    });
    return restored;
  },

  resetForTests: () => {
    if (typeof window !== "undefined") {
      for (const timer of recoveryTimers.values()) window.clearTimeout(timer);
    }
    recoveryTimers.clear();
    set(freshState());
  },
}));
