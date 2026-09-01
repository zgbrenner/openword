<script lang="ts">
  // OpenWord's shipping editor: a ProseMirror document model rendered onto a
  // paginated page canvas. It owns its whole document lifecycle — open, save,
  // crash recovery — and mounts the same menu-action ids the native menu in
  // src-tauri/src/menu.rs emits, so the desktop and website versions behave
  // identically over the platform layer.
  import { onMount, setContext } from "svelte";
  import { listen } from "@tauri-apps/api/event";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import FindReplace from "@/components/FindReplace.svelte";
  import PageCanvas from "@/components/PageCanvas.svelte";
  import ReviewPanel from "@/components/ReviewPanel.svelte";
  import Ruler from "@/components/Ruler.svelte";
  import StatusBar from "@/components/StatusBar.svelte";
  import Toolbar from "@/components/Toolbar.svelte";
  import WebMenuBar from "@/components/WebMenuBar.svelte";
  import { documentFormatForPath } from "@/editor/document";
  import { EditorController } from "@/lib/editorController.svelte";
  import {
    clearRecoverySnapshot,
    newDocument,
    openDocumentAtPath,
    openDocumentDialog,
    readRecoverySnapshot,
    saveDocumentAsDialog,
    writeDocument,
    writeRecoverySnapshot,
    type OpenResult,
  } from "@/lib/fileApi";
  import { PaginationState } from "@/lib/paginationState.svelte";
  import { ReviewPanelState } from "@/lib/reviewPanelState.svelte";
  import { registerOpenWordServiceWorker } from "@/lib/serviceWorkerClient";
  import { isTauri } from "@/lib/tauriEnv";
  import { ViewState } from "@/lib/viewState.svelte";
  import { isMacPlatform, shortcutMenuAction } from "@/lib/webShortcuts";
  import { getPlatform } from "@/platform";
  import { registerWebDocumentHandle } from "@/platform/web/webPlatform";

  const platform = getPlatform();
  const pagination = new PaginationState();
  const controller = new EditorController(newDocument(), (count) => (pagination.pageCount = count));
  const view = new ViewState();
  const reviewPanel = new ReviewPanelState();
  setContext("editor", controller);
  setContext("view", view);
  setContext("pagination", pagination);
  setContext("reviewPanel", reviewPanel);

  let findOpen = $state(false);
  let findWithReplace = $state(false);
  let recoveryInFlight = false;

  $effect(() => {
    const title = `${controller.dirty ? "● " : ""}${controller.fileName} — OpenWord`;
    if (isTauri()) getCurrentWindow().setTitle(title).catch(() => {});
    else document.title = title;
  });

  async function showError(title: string, error: unknown): Promise<void> {
    const detail = error instanceof Error ? error.message : String(error);
    await platform.message(detail, { title, kind: "error" });
  }

  async function reportRetainedBackup(result: { retainedBackupPath: string | null }): Promise<void> {
    if (!result.retainedBackupPath) return;
    await platform.message(
      `The file was written, but OpenWord could not remove the prior-file backup at:\n${result.retainedBackupPath}`,
      { title: "Backup retained", kind: "warning" },
    );
  }

  async function confirmDiscard(action: string): Promise<boolean> {
    if (!controller.dirty) return true;
    return platform.ask(`You have unsaved changes. Discard them and ${action}?`, { title: "OpenWord" });
  }

  function applyOpenResult(result: OpenResult): void {
    controller.loadDocument(result.doc, result.comments, result.suggestionMeta);
    controller.filePath = result.path;
    controller.fileFormat = result.format;
    controller.fileName = result.name;
    // A byte-only pick (a browser with no writable file handles) has nowhere
    // to save back to, so it opens dirty and the first Save becomes Save As.
    controller.markDirty(result.path === null);
  }

  // --- File workflows -------------------------------------------------------

  async function doNew(): Promise<void> {
    if (!(await confirmDiscard("start a new document"))) return;
    controller.loadDocument(newDocument());
    controller.filePath = null;
    controller.fileFormat = "owdoc";
    controller.fileName = "Untitled document";
    await clearRecoverySnapshot().catch(() => {});
  }

  async function doOpen(): Promise<void> {
    if (!(await confirmDiscard("open another document"))) return;
    try {
      const result = await openDocumentDialog();
      if (!result) return;
      applyOpenResult(result);
      await clearRecoverySnapshot().catch(() => {});
    } catch (error) {
      await showError("Could not open document", error);
    }
  }

  async function openAtPath(path: string): Promise<void> {
    if (!(await confirmDiscard("open another document"))) return;
    try {
      applyOpenResult(await openDocumentAtPath(path));
      await clearRecoverySnapshot().catch(() => {});
    } catch (error) {
      await showError("Could not open document", error);
    }
  }

  async function doSave(): Promise<void> {
    if (!controller.filePath) return doSaveAs();
    try {
      const result = await writeDocument(
        controller.doc,
        controller.comments,
        controller.suggestionMeta,
        controller.filePath,
        controller.fileFormat,
      );
      controller.markDirty(false);
      await clearRecoverySnapshot().catch(() => {});
      await reportRetainedBackup(result);
    } catch (error) {
      await showError("Could not save document", error);
    }
  }

  async function doSaveAs(): Promise<void> {
    try {
      const result = await saveDocumentAsDialog(
        controller.doc,
        controller.comments,
        controller.suggestionMeta,
        controller.fileName,
      );
      if (!result) return;
      controller.filePath = result.path;
      controller.fileFormat = result.format;
      controller.fileName = result.name;
      controller.markDirty(false);
      await clearRecoverySnapshot().catch(() => {});
      await reportRetainedBackup(result);
    } catch (error) {
      await showError("Could not save document", error);
    }
  }

  // OpenWord carries no PDF writer of its own. The page canvas already prints
  // exactly as it lays out on screen (see the print rules in styles/app.css),
  // so exporting hands the document to the print dialog's PDF destination.
  async function doExportPdf(): Promise<void> {
    await platform.message(
      'Choose a PDF destination — "Save as PDF" or "Microsoft Print to PDF" — in the print dialog that follows.',
      { title: "Export as PDF" },
    );
    window.print();
  }

  async function showWordCount(): Promise<void> {
    const { words, characters, charactersNoSpaces } = controller.snapshot.wordCount;
    await platform.message(
      `Words: ${words}\nCharacters: ${characters}\nCharacters (no spaces): ${charactersNoSpaces}\nPages: ${pagination.pageCount}`,
      { title: "Word count" },
    );
  }

  // --- Menu actions ---------------------------------------------------------
  // One handler for every id in src-tauri/src/menu.rs, shared by the native
  // menu, the web menu bar, and the web accelerator layer.

  async function handleMenuAction(id: string): Promise<void> {
    switch (id) {
      case "file_new": return doNew();
      case "file_open": return doOpen();
      case "file_save": return doSave();
      case "file_save_as": return doSaveAs();
      case "file_export_pdf": return doExportPdf();

      case "edit_undo": return controller.undo();
      case "edit_redo": return controller.redo();

      case "insert_page_break": return controller.insertPageBreak();

      case "format_bold": return controller.toggleBold();
      case "format_italic": return controller.toggleItalic();
      case "format_underline": return controller.toggleUnderline();
      case "format_align_left": return controller.setAlign("left");
      case "format_align_center": return controller.setAlign("center");
      case "format_align_right": return controller.setAlign("right");
      case "format_align_justify": return controller.setAlign("justify");
      case "format_bullet_list": return controller.toggleBulletList();
      case "format_ordered_list": return controller.toggleOrderedList();

      case "tools_word_count": return showWordCount();

      case "help_about":
        return platform.message(
          "OpenWord 0.1.0 — a free, open-source, lightweight word processor.\nApache-2.0 licensed.",
          { title: "OpenWord" },
        );

      default:
        return;
    }
  }

  // --- Keyboard -------------------------------------------------------------

  function primaryModifierOnly(event: KeyboardEvent): boolean {
    if (event.altKey || event.shiftKey) return false;
    return isMacPlatform() ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
  }

  /**
   * Find and Replace deliberately have no menu entry — the web menu mirrors
   * the native menu verbatim and the native menu carries no Find — so the
   * editor binds their accelerators itself, on both platforms.
   */
  function findBarShortcut(event: KeyboardEvent): "find" | "replace" | null {
    if (event.repeat || !primaryModifierOnly(event)) return null;
    const key = event.key.toLowerCase();
    if (key === "f") return "find";
    if (key === "h") return "replace";
    return null;
  }

  function onKeydown(event: KeyboardEvent): void {
    const findRequest = findBarShortcut(event);
    if (findRequest) {
      event.preventDefault();
      findWithReplace = findRequest === "replace";
      findOpen = true;
      return;
    }
    // Every other accelerator belongs to the native menu inside the Tauri
    // shell; only the website needs the keyboard layer derived from the
    // shared menu definition.
    if (isTauri()) return;
    const action = shortcutMenuAction(event);
    if (!action) return;
    event.preventDefault();
    void handleMenuAction(action);
  }

  // --- Crash recovery -------------------------------------------------------

  async function persistRecovery(): Promise<void> {
    if (!controller.dirty || recoveryInFlight) return;
    recoveryInFlight = true;
    try {
      await writeRecoverySnapshot(controller.doc, controller.comments, controller.suggestionMeta, {
        fileName: controller.fileName,
        originalPath: controller.filePath,
      });
    } catch (error) {
      console.error("Could not write OpenWord recovery snapshot", error);
    } finally {
      recoveryInFlight = false;
    }
  }

  async function restoreRecoveryIfAvailable(): Promise<void> {
    const snapshot = await readRecoverySnapshot().catch(() => null);
    if (!snapshot) return;

    const restore = await platform.ask(
      `OpenWord found unsaved work from ${new Date(snapshot.createdAt).toLocaleString()}. Restore it?`,
      { title: "Recover document" },
    );
    if (!restore) {
      await clearRecoverySnapshot().catch(() => {});
      return;
    }

    controller.loadDocument(snapshot.doc, snapshot.comments, snapshot.suggestionMeta);
    controller.filePath = snapshot.originalPath;
    controller.fileFormat = snapshot.originalPath ? documentFormatForPath(snapshot.originalPath) : "owdoc";
    controller.fileName = snapshot.fileName;
    controller.markDirty(true);
  }

  // --- Shell wiring ---------------------------------------------------------

  // The native shell delivers menu actions, "open with" paths, and the
  // close-confirmation flow through Tauri events and window hooks.
  function mountDesktopShell(): () => void {
    const unlistenMenu = listen<string>("menu:action", (event) => void handleMenuAction(event.payload));
    const unlistenOpen = listen<string[]>("file:open-path", (event) => {
      const path = event.payload[0];
      if (path) void openAtPath(path);
    });

    let unlistenClose: (() => void) | undefined;
    getCurrentWindow()
      .onCloseRequested(async (event) => {
        if (!controller.dirty) return;
        event.preventDefault();
        await persistRecovery();
        const discard = await platform.ask(
          "You have unsaved changes. Quit without saving? OpenWord offers the unsaved work again on the next launch.",
          { title: "OpenWord" },
        );
        if (discard) await getCurrentWindow().destroy();
      })
      .then((fn) => (unlistenClose = fn));

    return () => {
      unlistenMenu.then((fn) => fn());
      unlistenOpen.then((fn) => fn());
      unlistenClose?.();
    };
  }

  // The website replaces the native close hook with beforeunload, flushes
  // recovery when the tab is hidden, and accepts documents the OS hands to
  // the installed app through the launch queue.
  function mountWebShell(): () => void {
    void registerOpenWordServiceWorker({ requireCrossOriginIsolation: false });

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!controller.dirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);

    const flushRecovery = () => {
      if (document.visibilityState === "hidden") void persistRecovery();
    };
    document.addEventListener("visibilitychange", flushRecovery);
    window.addEventListener("pagehide", flushRecovery);

    window.launchQueue?.setConsumer((params) => {
      const handle = params.files[0];
      if (handle?.kind !== "file") return;
      void registerWebDocumentHandle(handle as FileSystemFileHandle)
        .then((path) => openAtPath(path))
        .catch((error) => void showError("Could not open document", error));
    });

    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("visibilitychange", flushRecovery);
      window.removeEventListener("pagehide", flushRecovery);
    };
  }

  onMount(() => {
    window.addEventListener("keydown", onKeydown, { capture: true });
    const autosave = window.setInterval(() => void persistRecovery(), 20_000);
    const unmountShell = isTauri() ? mountDesktopShell() : mountWebShell();
    void restoreRecoveryIfAvailable();

    return () => {
      window.removeEventListener("keydown", onKeydown, { capture: true });
      window.clearInterval(autosave);
      unmountShell();
      controller.destroy();
    };
  });
</script>

{#if !isTauri()}
  <WebMenuBar onaction={(id) => void handleMenuAction(id)} />
{/if}
<Toolbar />
<Ruler />
<div class="ow-canvas-area">
  <div class="ow-canvas-main">
    <PageCanvas />
    <FindReplace bind:open={findOpen} bind:withReplace={findWithReplace} />
  </div>
  <ReviewPanel />
</div>
<StatusBar />

<style>
  .ow-canvas-area {
    flex: 1;
    display: flex;
    min-height: 0;
  }
  .ow-canvas-main {
    position: relative;
    flex: 1;
    display: flex;
    min-width: 0;
  }
</style>
