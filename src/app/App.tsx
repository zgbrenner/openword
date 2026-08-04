import type { Editor } from "@tiptap/core";
import { Focus, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getCommands } from "../core/commands/registry";
import { createCommentThread, removeCommentMarks } from "../core/document/comments";
import type { FileDescriptor, OpenWordDocument } from "../core/document/model";
import type { TemplateId } from "../core/document/templates";
import { exportDocument, importPickedFile } from "../core/formats";
import { collectSaveWarnings } from "../core/formats/warnings";
import {
  pickDocumentFile,
  readDocumentPath,
  revealFile,
  saveBytes,
} from "../core/platform/files";
import { Backstage } from "../components/backstage/Backstage";
import { IconButton } from "../components/common/IconButton";
import { Notice, type NoticeKind, type NoticeState } from "../components/common/Notice";
import { AddCommentDialog } from "../components/dialogs/AddCommentDialog";
import { CommandPalette } from "../components/dialogs/CommandPalette";
import { FindReplaceDialog } from "../components/dialogs/FindReplaceDialog";
import { HeaderFooterDialog } from "../components/dialogs/HeaderFooterDialog";
import { LinkDialog } from "../components/dialogs/LinkDialog";
import { PageSetupDialog } from "../components/dialogs/PageSetupDialog";
import { DocumentEditor } from "../components/editor/DocumentEditor";
import { Ribbon } from "../components/ribbon/Ribbon";
import type { RibbonActions } from "../components/ribbon/types";
import { DocumentTabs } from "../components/shell/DocumentTabs";
import { TitleBar } from "../components/shell/TitleBar";
import { NavigationSidebar } from "../components/sidebar/NavigationSidebar";
import { ReviewSidebar } from "../components/sidebar/ReviewSidebar";
import { StatusBar } from "../components/status/StatusBar";
import { useWorkspaceStore } from "../store/workspaceStore";
import { useKeyboardShortcuts } from "./useKeyboardShortcuts";

const WRITABLE_FORMATS = new Set(["openword", "docx", "markdown", "html", "text"]);

type WritableFormat = "openword" | "docx" | "markdown" | "html" | "text";

function selectedText(editor: Editor | null): string {
  if (!editor) return "";
  const { from, to } = editor.state.selection;
  return editor.state.doc.textBetween(from, to, " ").trim();
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "An unexpected error occurred.";
}

function shouldContinueWithWarnings(warnings: string[]): boolean {
  if (!warnings.length) return true;
  return window.confirm(
    `This format cannot preserve every OpenWord feature:\n\n${warnings.slice(0, 8).map((warning) => `• ${warning}`).join("\n")}\n\nContinue with export?`,
  );
}

export function App() {
  const tabs = useWorkspaceStore((state) => state.tabs);
  const activeTabId = useWorkspaceStore((state) => state.activeTabId);
  const ui = useWorkspaceStore((state) => state.ui);
  const recentFiles = useWorkspaceStore((state) => state.recentFiles);
  const restoreRecoverySnapshots = useWorkspaceStore((state) => state.restoreRecoverySnapshots);
  const newDocument = useWorkspaceStore((state) => state.newDocument);
  const openDocument = useWorkspaceStore((state) => state.openDocument);
  const closeDocument = useWorkspaceStore((state) => state.closeDocument);
  const setActiveTab = useWorkspaceStore((state) => state.setActiveTab);
  const updateDocument = useWorkspaceStore((state) => state.updateDocument);
  const markSaved = useWorkspaceStore((state) => state.markSaved);
  const addCommentThread = useWorkspaceStore((state) => state.addCommentThread);
  const updateCommentThread = useWorkspaceStore((state) => state.updateCommentThread);
  const deleteCommentThread = useWorkspaceStore((state) => state.deleteCommentThread);
  const setRibbonTab = useWorkspaceStore((state) => state.setRibbonTab);
  const toggleSidebar = useWorkspaceStore((state) => state.toggleSidebar);
  const setZoom = useWorkspaceStore((state) => state.setZoom);
  const setLayoutMode = useWorkspaceStore((state) => state.setLayoutMode);
  const setUi = useWorkspaceStore((state) => state.setUi);
  const updatePageSetup = useWorkspaceStore((state) => state.updatePageSetup);
  const setDocumentTitle = useWorkspaceStore((state) => state.setDocumentTitle);

  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0]!;
  const [editor, setEditor] = useState<Editor | null>(null);
  const [editorRevision, setEditorRevision] = useState(0);
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [commentDialogOpen, setCommentDialogOpen] = useState(false);
  const [headerFooterOpen, setHeaderFooterOpen] = useState(false);

  const showNotice = useCallback((kind: NoticeKind, title: string, message?: string) => {
    setNotice({ id: Date.now(), kind, title, message });
  }, []);

  useEffect(() => {
    const recovered = restoreRecoverySnapshots();
    if (recovered > 0) {
      showNotice(
        "info",
        `Recovered ${recovered} unsaved document${recovered === 1 ? "" : "s"}`,
        "Review the recovered tabs and save the documents you want to keep.",
      );
    }
  }, [restoreRecoverySnapshots, showNotice]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), notice.kind === "error" ? 8000 : 4200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!tabs.some((tab) => tab.dirty)) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [tabs]);

  const handleOpen = useCallback(async () => {
    try {
      const file = await pickDocumentFile();
      if (!file) return;
      const result = await importPickedFile(file);
      const descriptor: FileDescriptor = {
        name: file.name,
        path: file.path,
        format: file.format,
      };
      openDocument(result.document, descriptor);
      showNotice(
        result.warnings.length ? "info" : "success",
        `Opened ${file.name}`,
        result.warnings.length ? `${result.warnings.length} compatibility notice${result.warnings.length === 1 ? "" : "s"} are available in Review.` : undefined,
      );
    } catch (error) {
      showNotice("error", "Could not open document", errorMessage(error));
    }
  }, [openDocument, showNotice]);

  const handleOpenRecent = useCallback(async (file: (typeof recentFiles)[number]) => {
    if (!file.path) {
      showNotice("info", "This browser download has no reusable local path", "Use Open to choose the file again.");
      return;
    }
    try {
      const picked = await readDocumentPath(file.path);
      const result = await importPickedFile(picked);
      openDocument(result.document, { name: picked.name, path: picked.path, format: picked.format });
      showNotice("success", `Opened ${picked.name}`);
    } catch (error) {
      showNotice("error", "Could not reopen document", errorMessage(error));
    }
  }, [openDocument, showNotice]);

  const saveInFormat = useCallback(async (
    format: WritableFormat,
    forceDialog: boolean,
  ): Promise<void> => {
    try {
      const current = useWorkspaceStore.getState().tabs.find((tab) => tab.id === useWorkspaceStore.getState().activeTabId);
      if (!current) return;
      const result = await exportDocument(current.document, format);
      const warnings = collectSaveWarnings(current.document, format, result.warnings);
      if (!shouldContinueWithWarnings(warnings)) return;
      const existingPath = !forceDialog && current.file?.format === format ? current.file.path : undefined;
      const descriptor = await saveBytes({
        bytes: result.data,
        suggestedName: current.file?.name ?? current.document.title,
        format,
        existingPath,
      });
      if (!descriptor) return;
      markSaved(current.id, descriptor);
      showNotice(
        "success",
        `Saved ${descriptor.name}`,
        warnings.length ? `Export completed with ${warnings.length} compatibility notice${warnings.length === 1 ? "" : "s"}.` : undefined,
      );
    } catch (error) {
      showNotice("error", "Could not save document", errorMessage(error));
    }
  }, [markSaved, showNotice]);

  const handleSave = useCallback(() => {
    const format = activeTab.file && WRITABLE_FORMATS.has(activeTab.file.format)
      ? activeTab.file.format as WritableFormat
      : "openword";
    void saveInFormat(format, !activeTab.file?.path);
  }, [activeTab.file, saveInFormat]);

  const handleSaveAs = useCallback((format: WritableFormat = "openword") => {
    void saveInFormat(format, true);
  }, [saveInFormat]);

  const handlePrint = useCallback(() => {
    setUi({ backstageOpen: false });
    window.setTimeout(() => window.print(), 50);
  }, [setUi]);

  const handleNew = useCallback((template: TemplateId = "blank") => {
    newDocument(template);
    showNotice("success", template === "blank" ? "Created a blank document" : "Created document from template");
  }, [newDocument, showNotice]);

  const handleCloseTab = useCallback((id: string) => {
    const tab = useWorkspaceStore.getState().tabs.find((candidate) => candidate.id === id);
    if (tab?.dirty && !window.confirm(`Close “${tab.document.title}” without saving your latest changes?`)) return;
    closeDocument(id);
  }, [closeDocument]);

  const handleInsertImage = useCallback(() => {
    if (!editor) return;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/png,image/jpeg,image/gif,image/bmp,image/webp";
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (!file) return;
      if (file.size > 15 * 1024 * 1024) {
        showNotice("error", "Image is too large", "Choose an image smaller than 15 MB.");
        return;
      }
      const reader = new FileReader();
      reader.addEventListener("load", () => {
        if (typeof reader.result !== "string") return;
        editor.chain().focus().setImage({ src: reader.result, alt: file.name, width: 480 } as never).run();
      });
      reader.readAsDataURL(file);
    }, { once: true });
    input.click();
  }, [editor, showNotice]);

  const submitComment = useCallback((body: string) => {
    if (!editor || editor.state.selection.empty) {
      showNotice("error", "Select text before adding a comment");
      return;
    }
    try {
      const thread = createCommentThread({ body });
      editor.chain().focus().setCommentMark(thread.id).run();
      addCommentThread(thread);
      setUi({ rightSidebar: true });
      showNotice("success", "Comment added");
    } catch (error) {
      showNotice("error", "Could not add comment", errorMessage(error));
    }
  }, [addCommentThread, editor, setUi, showNotice]);

  const handleDeleteComment = useCallback((id: string) => {
    if (editor) removeCommentMarks(editor, id);
    deleteCommentThread(id);
  }, [deleteCommentThread, editor]);

  const updateSettings = useCallback((patch: Partial<OpenWordDocument["settings"]>) => {
    const current = useWorkspaceStore.getState().tabs.find((tab) => tab.id === useWorkspaceStore.getState().activeTabId);
    if (!current) return;
    updateDocument(current.id, { settings: { ...current.document.settings, ...patch } });
  }, [updateDocument]);

  const ribbonActions = useMemo<RibbonActions>(() => ({
    openBackstage: () => setUi({ backstageOpen: true }),
    openFindReplace: () => setUi({ findReplaceOpen: true }),
    openPageSetup: () => setUi({ pageSetupOpen: true }),
    openHeaderFooter: () => setHeaderFooterOpen(true),
    openLinkDialog: () => setLinkDialogOpen(true),
    insertImage: handleInsertImage,
    addComment: () => {
      if (!editor || editor.state.selection.empty) {
        showNotice("error", "Select text before adding a comment");
        return;
      }
      setCommentDialogOpen(true);
    },
    toggleNavigation: () => toggleSidebar("navigation"),
    toggleReview: () => toggleSidebar("review"),
    setSpellcheck: (enabled) => updateSettings({ spellcheck: enabled }),
    setFormattingMarks: (enabled) => updateSettings({ showFormattingMarks: enabled }),
    setDarkMode: (enabled) => setUi({ darkMode: enabled }),
    setFocusMode: (enabled) => setUi({ focusMode: enabled }),
    setLayoutMode,
    setZoom,
    openCommandPalette: () => setUi({ commandPaletteOpen: true }),
  }), [editor, handleInsertImage, setLayoutMode, setUi, setZoom, showNotice, toggleSidebar, updateSettings]);

  const commandContext = useMemo(() => ({
    editor,
    openBackstage: ribbonActions.openBackstage,
    openDocument: () => void handleOpen(),
    saveDocument: handleSave,
    saveDocumentAs: () => handleSaveAs("openword"),
    printDocument: handlePrint,
    openFindReplace: ribbonActions.openFindReplace,
    openPageSetup: ribbonActions.openPageSetup,
    toggleNavigation: ribbonActions.toggleNavigation,
    toggleReview: ribbonActions.toggleReview,
  }), [editor, handleOpen, handlePrint, handleSave, handleSaveAs, ribbonActions]);

  const commands = useMemo(() => getCommands(commandContext), [commandContext, editorRevision]);

  const shortcutActions = useMemo(() => ({
    open: () => void handleOpen(),
    save: handleSave,
    saveAs: () => handleSaveAs("openword"),
    print: handlePrint,
    commandPalette: () => setUi({ commandPaletteOpen: true }),
    findReplace: () => setUi({ findReplaceOpen: true }),
    backstage: () => setUi({ backstageOpen: true }),
  }), [handleOpen, handlePrint, handleSave, handleSaveAs, setUi]);
  useKeyboardShortcuts(shortcutActions);

  const appClass = [
    "openword-app",
    ui.darkMode ? "theme-dark" : "theme-light",
    ui.focusMode ? "is-focus-mode" : "",
    activeTab.document.settings.showFormattingMarks ? "show-formatting-marks" : "",
  ].filter(Boolean).join(" ");

  return (
    <div className={appClass}>
      {!ui.focusMode ? (
        <>
          <TitleBar
            tab={activeTab}
            editor={editor}
            onTitleChange={(title) => setDocumentTitle(activeTab.id, title)}
            onOpen={() => void handleOpen()}
            onSave={handleSave}
            onOpenBackstage={() => setUi({ backstageOpen: true })}
            onOpenCommandPalette={() => setUi({ commandPaletteOpen: true })}
          />
          <Ribbon
            editor={editor}
            tab={activeTab}
            ui={ui}
            revision={editorRevision}
            actions={ribbonActions}
            onTabChange={setRibbonTab}
          />
          <DocumentTabs
            tabs={tabs}
            activeTabId={activeTabId}
            onActivate={setActiveTab}
            onClose={handleCloseTab}
            onNew={() => handleNew("blank")}
          />
        </>
      ) : (
        <div className="focus-mode-toolbar">
          <span><Focus size={16} /> Focus mode</span>
          <IconButton label="Exit focus mode" icon={<X size={17} />} onClick={() => setUi({ focusMode: false })} compact />
        </div>
      )}

      <main className="workspace-shell">
        {ui.leftSidebar && !ui.focusMode ? (
          <NavigationSidebar editor={editor} revision={editorRevision} onClose={() => toggleSidebar("navigation")} />
        ) : null}

        <section className="document-workspace" aria-label="Document workspace">
          <div className="document-scroll-region">
            <DocumentEditor
              tab={activeTab}
              zoom={ui.zoom}
              layoutMode={ui.layoutMode}
              onEditorReady={setEditor}
              onEditorStateChange={() => setEditorRevision((value) => value + 1)}
            />
          </div>
        </section>

        {ui.rightSidebar && !ui.focusMode ? (
          <ReviewSidebar
            editor={editor}
            comments={activeTab.document.comments}
            warnings={activeTab.document.compatibilityWarnings}
            onAddComment={submitComment}
            onUpdateComment={updateCommentThread}
            onDeleteComment={handleDeleteComment}
            onClose={() => toggleSidebar("review")}
          />
        ) : null}
      </main>

      {!ui.focusMode ? (
        <StatusBar
          tab={activeTab}
          editor={editor}
          revision={editorRevision}
          zoom={ui.zoom}
          layoutMode={ui.layoutMode}
          onZoomChange={setZoom}
          onLayoutModeChange={setLayoutMode}
        />
      ) : null}

      <Backstage
        open={ui.backstageOpen}
        tab={activeTab}
        recentFiles={recentFiles}
        onClose={() => setUi({ backstageOpen: false })}
        onNew={handleNew}
        onOpen={() => void handleOpen()}
        onOpenRecent={(file) => void handleOpenRecent(file)}
        onSave={handleSave}
        onSaveAs={handleSaveAs}
        onPrint={handlePrint}
        onReveal={() => {
          if (activeTab.file?.path) void revealFile(activeTab.file.path).catch((error) => showNotice("error", "Could not show file", errorMessage(error)));
        }}
      />

      <CommandPalette open={ui.commandPaletteOpen} commands={commands} onClose={() => setUi({ commandPaletteOpen: false })} />
      <FindReplaceDialog
        open={ui.findReplaceOpen}
        editor={editor}
        revision={editorRevision}
        onClose={() => setUi({ findReplaceOpen: false })}
        onMessage={(message) => showNotice("success", message)}
      />
      <PageSetupDialog open={ui.pageSetupOpen} page={activeTab.document.page} onApply={updatePageSetup} onClose={() => setUi({ pageSetupOpen: false })} />
      <LinkDialog open={linkDialogOpen} editor={editor} onClose={() => setLinkDialogOpen(false)} onError={(message) => showNotice("error", "Invalid link", message)} />
      <AddCommentDialog open={commentDialogOpen} selectedText={selectedText(editor)} onSubmit={submitComment} onClose={() => setCommentDialogOpen(false)} />
      <HeaderFooterDialog
        open={headerFooterOpen}
        header={activeTab.document.header}
        footer={activeTab.document.footer}
        onApply={(header, footer) => updateDocument(activeTab.id, { header, footer })}
        onClose={() => setHeaderFooterOpen(false)}
      />

      {notice ? <div className="notice-stack"><Notice notice={notice} onClose={() => setNotice(null)} /></div> : null}
    </div>
  );
}
