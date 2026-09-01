<script lang="ts">
  // The application root picks which shell to mount. OpenWord ships the
  // ProseMirror editor; the LibreOffice Writer engine shell below is opt-in
  // (see lib/shellMode.ts) because its WebAssembly runtime is a separate
  // artifact that is not part of a normal package. Both shells speak the same
  // menu-action ids and both persist through the platform layer.
  import { onMount } from "svelte";
  import { listen } from "@tauri-apps/api/event";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import AppDialog from "@/components/AppDialog.svelte";
  import EditorShell from "@/components/EditorShell.svelte";
  import WebMenuBar from "@/components/WebMenuBar.svelte";
  import WriterCanvas from "@/components/WriterCanvas.svelte";
  import WriterFindBar from "@/components/WriterFindBar.svelte";
  import WriterHomeBar from "@/components/WriterHomeBar.svelte";
  import WriterStatusBar from "@/components/WriterStatusBar.svelte";
  import { registerOpenWordServiceWorker } from "@/lib/serviceWorkerClient";
  import { resolveShellMode } from "@/lib/shellMode";
  import { shortcutMenuAction } from "@/lib/webShortcuts";
  import { isTauri } from "@/lib/tauriEnv";
  import { getPlatform } from "@/platform";
  import { registerWebDocumentHandle } from "@/platform/web/webPlatform";
  import { WriterClient } from "@/writer/client";
  import {
    exportWriterPdfDialog,
    openWriterDocumentAtPath,
    openWriterDocumentBytes,
    openWriterDocumentDialog,
    saveWriterDocument,
    saveWriterDocumentAsDialog,
    type WriterOpenResult,
    type WriterSaveResult,
  } from "@/writer/fileApi";
  import type {
    PackageCompatibilityReport,
    PackagePreservationSnapshot,
  } from "@/writer/packagePassthrough";
  import type { WriterCommand } from "@/writer/protocol";
  import {
    clearRecoverySnapshot,
    readRecoverySnapshot,
    writerRecoveryFormat,
    writeRecoverySnapshot,
  } from "@/writer/recovery";
  import { WriterRuntimeHost } from "@/writer/runtimeHost";
  import { WriterState } from "@/writer/state.svelte";

  const shell = resolveShellMode();
  const platform = getPlatform();
  const writerState = new WriterState();
  let client = $state<WriterClient | null>(null);
  let runtimeHost = $state<WriterRuntimeHost | null>(null);
  let packagePreservation = null as PackagePreservationSnapshot | null;
  let compatibilityReport = $state<PackageCompatibilityReport | null>(null);
  let unsubscribeWriter: (() => void) | null = null;
  let pendingOpenPath: string | null = null;
  let documentInitialized = false;
  let recoveryInFlight = false;
  let findBarOpen = $state(false);

  $effect(() => {
    if (shell !== "writer") return;
    const title = `${writerState.dirty ? "● " : ""}${writerState.fileName} — OpenWord`;
    if (isTauri()) getCurrentWindow().setTitle(title).catch(() => {});
    else document.title = title;
  });

  function requireWriter(): { client: WriterClient; host: WriterRuntimeHost } | null {
    if (!client || !runtimeHost || !writerState.ready) return null;
    return { client, host: runtimeHost };
  }

  async function confirmDiscard(action: string): Promise<boolean> {
    if (!writerState.dirty) return true;
    return platform.ask(`You have unsaved changes. Discard them and ${action}?`, { title: "OpenWord" });
  }

  function applyOpenResult(result: WriterOpenResult): void {
    packagePreservation = result.preservation;
    compatibilityReport = null;
    writerState.setDocument(result.path, result.name, result.format);
  }

  async function clearRecoveryAfterDiscard(): Promise<void> {
    await clearRecoverySnapshot().catch(() => {});
  }

  async function openAtPath(path: string): Promise<void> {
    const writer = requireWriter();
    if (!writer) {
      pendingOpenPath = path;
      return;
    }
    if (!(await confirmDiscard("open another document"))) return;

    try {
      applyOpenResult(await openWriterDocumentAtPath(path, writer.client, writer.host));
      await clearRecoveryAfterDiscard();
    } catch (error) {
      await showError("Could not open document", error);
    }
  }

  async function doOpen(): Promise<void> {
    const writer = requireWriter();
    if (!writer || !(await confirmDiscard("open another document"))) return;
    try {
      const result = await openWriterDocumentDialog(writer.client, writer.host);
      if (!result) return;
      applyOpenResult(result);
      await clearRecoveryAfterDiscard();
    } catch (error) {
      await showError("Could not open document", error);
    }
  }

  async function doNew(): Promise<void> {
    const writer = requireWriter();
    if (!writer || !(await confirmDiscard("start a new document"))) return;
    try {
      await writer.client.newDocument("docx");
      packagePreservation = null;
      compatibilityReport = null;
      writerState.setDocument(null, "Document1.docx", "docx");
      await clearRecoveryAfterDiscard();
    } catch (error) {
      await showError("Could not create document", error);
    }
  }

  async function reportRetainedBackup(result: { recoveryPath: string | null }): Promise<void> {
    if (!result.recoveryPath) return;
    const detail = `The file was written, but OpenWord could not remove the prior-file backup at:\n${result.recoveryPath}`;
    await platform.message(detail, { title: "Backup retained", kind: "warning" });
  }

  async function reportCompatibility(result: WriterSaveResult): Promise<void> {
    packagePreservation = result.preservation;
    compatibilityReport = result.compatibilityReport;
    const report = result.compatibilityReport;
    const lines: string[] = [];
    if (report.droppedSignatures.length) {
      lines.push(`${report.droppedSignatures.length} invalidated digital signature part(s) were removed.`);
    }
    if (report.blockedExecutables.length) {
      lines.push(`${report.blockedExecutables.length} executable or macro payload(s) were quarantined.`);
    }
    if (report.notCarriedAcrossFormat.length) {
      lines.push(`${report.notCarriedAcrossFormat.length} opaque part(s) could not be carried across formats.`);
    }
    lines.push(...report.warnings);
    if (!lines.length) return;

    await platform.message(lines.join("\n"), { title: "Document compatibility", kind: "warning" });
  }

  async function doSave(): Promise<void> {
    const writer = requireWriter();
    if (!writer) return;
    if (!writerState.filePath) return doSaveAs();

    try {
      const result = await saveWriterDocument(
        writerState.filePath,
        writerState.format,
        writer.client,
        writer.host,
        packagePreservation,
      );
      writerState.dirty = false;
      await clearRecoveryAfterDiscard();
      await reportRetainedBackup(result);
      await reportCompatibility(result);
    } catch (error) {
      await showError("Could not save document", error);
    }
  }

  async function doSaveAs(): Promise<void> {
    const writer = requireWriter();
    if (!writer) return;
    const baseName = writerState.fileName.replace(/\.[^.]+$/, "") || "Document1";

    try {
      const result = await saveWriterDocumentAsDialog(
        writer.client,
        writer.host,
        baseName,
        packagePreservation,
      );
      if (!result) return;
      writerState.setDocument(
        result.path,
        result.path.split(/[\\/]/).pop() ?? `${baseName}.${result.format}`,
        result.format,
      );
      await clearRecoveryAfterDiscard();
      await reportRetainedBackup(result);
      await reportCompatibility(result);
    } catch (error) {
      await showError("Could not save document", error);
    }
  }

  async function doExportPdf(): Promise<void> {
    const writer = requireWriter();
    if (!writer) return;
    const baseName = writerState.fileName.replace(/\.[^.]+$/, "") || "Document1";
    try {
      const result = await exportWriterPdfDialog(writer.client, writer.host, baseName);
      if (!result) return;
      await reportRetainedBackup(result);
    } catch (error) {
      await showError("Could not export PDF", error);
    }
  }

  async function persistRecovery(): Promise<void> {
    const writer = requireWriter();
    if (!writer || !writerState.dirty || recoveryInFlight) return;
    recoveryInFlight = true;
    try {
      await writeRecoverySnapshot(writer.client, writer.host, {
        fileName: writerState.fileName,
        originalPath: writerState.filePath,
        format: writerState.format,
        preservation: packagePreservation,
      });
    } catch (error) {
      console.error("Could not write OpenWord recovery snapshot", error);
    } finally {
      recoveryInFlight = false;
    }
  }

  async function restoreRecoveryIfAvailable(
    nextClient: WriterClient,
    nextHost: WriterRuntimeHost,
  ): Promise<boolean> {
    const snapshot = await readRecoverySnapshot().catch(() => null);
    if (!snapshot) return false;
    // An .owdoc snapshot belongs to the editor shell, not to Writer: leave it
    // in place for that shell rather than failing to load it as a package.
    const snapshotFormat = writerRecoveryFormat(snapshot);
    if (!snapshotFormat) return false;

    const restore = await platform.ask(
      `OpenWord found unsaved work from ${new Date(snapshot.metadata.createdAt).toLocaleString()}. Restore it?`,
      { title: "Recover document" },
    );
    if (!restore) {
      await clearRecoverySnapshot().catch(() => {});
      return false;
    }

    packagePreservation = await openWriterDocumentBytes(
      snapshot.bytes,
      snapshotFormat,
      nextClient,
      nextHost,
    );
    compatibilityReport = null;
    writerState.setDocument(
      snapshot.metadata.originalPath,
      snapshot.metadata.fileName,
      snapshotFormat,
    );
    writerState.dirty = true;
    return true;
  }

  async function showError(title: string, error: unknown): Promise<void> {
    const detail = error instanceof Error ? error.message : String(error);
    await platform.message(detail, { title, kind: "error" });
  }

  async function unavailable(feature: string): Promise<void> {
    const detail = `${feature} is not wired to the Writer engine in this foundation build yet.`;
    await platform.message(detail, { title: "OpenWord" });
  }

  async function execute(command: WriterCommand): Promise<void> {
    const writer = requireWriter();
    if (!writer) return;
    try {
      await writer.client.execute(command);
      requestAnimationFrame(() => document.getElementById("qtcanvas")?.focus());
    } catch (error) {
      await showError("Writer command failed", error);
    }
  }

  async function showWordCount(): Promise<void> {
    const detail = writerState.wordCountLabel || "Writer is calculating the document statistics.";
    await platform.message(detail, { title: "Word count" });
  }

  async function handleMenuAction(id: string): Promise<void> {
    switch (id) {
      case "file_new": return doNew();
      case "file_open": return doOpen();
      case "file_save": return doSave();
      case "file_save_as": return doSaveAs();
      case "file_export_pdf": return doExportPdf();
      case "file_print": return unavailable("Printing");
      case "file_close": return;
      case "edit_undo": return execute({ type: "history.undo" });
      case "edit_redo": return execute({ type: "history.redo" });
      case "insert_page_break": return execute({ type: "insert.pageBreak" });
      case "format_bold": return execute({ type: "format.toggleBold" });
      case "format_italic": return execute({ type: "format.toggleItalic" });
      case "format_underline": return execute({ type: "format.toggleUnderline" });
      case "format_align_left": return execute({ type: "paragraph.alignLeft" });
      case "format_align_center": return execute({ type: "paragraph.alignCenter" });
      case "format_align_right": return execute({ type: "paragraph.alignRight" });
      case "format_align_justify": return execute({ type: "paragraph.alignJustify" });
      case "format_bullet_list": return execute({ type: "list.toggleBullets" });
      case "format_ordered_list": return execute({ type: "list.toggleNumbering" });
      case "tools_word_count": return showWordCount();
      case "help_about":
        await platform.message(
          "OpenWord Writer foundation build. One local LibreOffice Writer engine; macros and extensions are disabled.",
          { title: "OpenWord" },
        );
        return;
      default:
        return unavailable(id.replaceAll("_", " "));
    }
  }

  async function handleWriterReady(nextClient: WriterClient, nextHost: WriterRuntimeHost): Promise<void> {
    unsubscribeWriter?.();
    client?.destroy();
    runtimeHost?.destroy();
    client = nextClient;
    runtimeHost = nextHost;
    unsubscribeWriter = nextClient.subscribe((event) => writerState.apply(event));
    writerState.apply({ kind: "event", event: "engine.ready", payload: { version: "writer-lowa" } });

    try {
      if (pendingOpenPath) {
        const path = pendingOpenPath;
        pendingOpenPath = null;
        applyOpenResult(await openWriterDocumentAtPath(path, nextClient, nextHost));
      } else if (!documentInitialized) {
        const restored = await restoreRecoveryIfAvailable(nextClient, nextHost);
        if (!restored) {
          await nextClient.newDocument("docx");
          packagePreservation = null;
          compatibilityReport = null;
          writerState.setDocument(null, "Document1.docx", "docx");
        }
      }
      documentInitialized = true;
    } catch (error) {
      writerState.setStartupFailure(error);
      await showError("Writer initialization failed", error);
    }
  }

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
        if (!writerState.dirty) return;
        event.preventDefault();
        await persistRecovery();
        const discard = await platform.ask(
          "You have unsaved changes. Quit without saving? A recovery snapshot is available unless you choose to discard it.",
          { title: "OpenWord" },
        );
        if (discard) {
          const keepRecovery = await platform.ask(
            "Keep the recovery snapshot for the next launch?",
            { title: "OpenWord recovery", kind: "warning" },
          );
          if (!keepRecovery) await clearRecoverySnapshot().catch(() => {});
          await getCurrentWindow().destroy();
        }
      })
      .then((fn) => (unlistenClose = fn));

    return () => {
      unlistenMenu.then((fn) => fn());
      unlistenOpen.then((fn) => fn());
      unlistenClose?.();
    };
  }

  // The website version wires the same menu-action ids through the in-app
  // menu bar and a keyboard accelerator layer, replaces the native close
  // hook with beforeunload, flushes recovery when the tab is hidden, and
  // accepts OS documents through the installed-app launch queue.
  function mountWebShell(): () => void {
    void registerOpenWordServiceWorker();

    const onKeydown = (event: KeyboardEvent) => {
      const action = shortcutMenuAction(event);
      if (!action) return;
      event.preventDefault();
      void handleMenuAction(action);
    };
    window.addEventListener("keydown", onKeydown, { capture: true });

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!writerState.dirty) return;
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
      window.removeEventListener("keydown", onKeydown, { capture: true });
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("visibilitychange", flushRecovery);
      window.removeEventListener("pagehide", flushRecovery);
    };
  }

  onMount(() => {
    // EditorShell owns its own document lifecycle and window wiring; only the
    // Writer engine shell's engine-backed autosave belongs to this component.
    if (shell !== "writer") return;

    const autosave = window.setInterval(() => void persistRecovery(), 20_000);
    const unmountShell = isTauri() ? mountDesktopShell() : mountWebShell();

    return () => {
      window.clearInterval(autosave);
      unmountShell();
      unsubscribeWriter?.();
      client?.destroy();
      runtimeHost?.destroy();
    };
  });
</script>

<div class="ow-app">
  {#if shell === "writer"}
    {#if !isTauri()}
      <WebMenuBar onaction={(id) => void handleMenuAction(id)} />
    {/if}
    <WriterHomeBar
      {client}
      state={writerState}
      onsave={() => void doSave()}
      onfindreplace={() => (findBarOpen = !findBarOpen)}
      onerror={(error) => void showError("Writer command failed", error)}
    />
    {#if findBarOpen}
      <WriterFindBar
        client={writerState.ready ? client : null}
        onclose={() => {
          findBarOpen = false;
          requestAnimationFrame(() => document.getElementById("qtcanvas")?.focus());
        }}
        onerror={(error) => void showError("Find and replace failed", error)}
      />
    {/if}
    <main class="ow-writer-main">
      <WriterCanvas
        onready={(nextClient, nextHost) => void handleWriterReady(nextClient, nextHost)}
        onfailure={(error) => writerState.setStartupFailure(error)}
      />
    </main>
    <WriterStatusBar
      state={writerState}
      report={compatibilityReport}
      onzoom={(percent) => void execute({ type: "view.setZoom", percent })}
    />
  {:else}
    <EditorShell />
  {/if}
  <AppDialog />
</div>

<style>
  .ow-writer-main {
    flex: 1;
    display: flex;
    min-width: 0;
    min-height: 0;
  }
</style>
