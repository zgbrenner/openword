<script lang="ts">
  import { onMount } from "svelte";
  import { listen } from "@tauri-apps/api/event";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { ask, message } from "@tauri-apps/plugin-dialog";
  import WriterCanvas from "@/components/WriterCanvas.svelte";
  import WriterHomeBar from "@/components/WriterHomeBar.svelte";
  import WriterStatusBar from "@/components/WriterStatusBar.svelte";
  import { WriterClient } from "@/writer/client";
  import {
    openWriterDocumentAtPath,
    openWriterDocumentDialog,
    saveWriterDocument,
    saveWriterDocumentAsDialog,
    type WriterOpenResult,
  } from "@/writer/fileApi";
  import { WriterRuntimeHost } from "@/writer/runtimeHost";
  import { WriterState } from "@/writer/state.svelte";
  import { isTauri } from "@/lib/tauriEnv";

  const writerState = new WriterState();
  let client = $state<WriterClient | null>(null);
  let runtimeHost = $state<WriterRuntimeHost | null>(null);
  let unsubscribeWriter: (() => void) | null = null;
  let pendingOpenPath: string | null = null;
  let documentInitialized = false;

  $effect(() => {
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
    return ask(`You have unsaved changes. Discard them and ${action}?`, { title: "OpenWord" });
  }

  function applyOpenResult(result: WriterOpenResult): void {
    writerState.setDocument(result.path, result.name, result.format);
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
    } catch (error) {
      await showError("Could not open document", error);
    }
  }

  async function doOpen(): Promise<void> {
    const writer = requireWriter();
    if (!writer || !(await confirmDiscard("open another document"))) return;
    try {
      const result = await openWriterDocumentDialog(writer.client, writer.host);
      if (result) applyOpenResult(result);
    } catch (error) {
      await showError("Could not open document", error);
    }
  }

  async function doNew(): Promise<void> {
    const writer = requireWriter();
    if (!writer || !(await confirmDiscard("start a new document"))) return;
    try {
      await writer.client.newDocument("docx");
      writerState.setDocument(null, "Document1.docx", "docx");
    } catch (error) {
      await showError("Could not create document", error);
    }
  }

  async function doSave(): Promise<void> {
    const writer = requireWriter();
    if (!writer) return;
    if (!writerState.filePath) return doSaveAs();

    try {
      await saveWriterDocument(writerState.filePath, writerState.format, writer.client, writer.host);
      writerState.dirty = false;
    } catch (error) {
      await showError("Could not save document", error);
    }
  }

  async function doSaveAs(): Promise<void> {
    const writer = requireWriter();
    if (!writer) return;
    const baseName = writerState.fileName.replace(/\.[^.]+$/, "") || "Document1";

    try {
      const result = await saveWriterDocumentAsDialog(writer.client, writer.host, baseName);
      if (!result) return;
      writerState.setDocument(
        result.path,
        result.path.split(/[\\/]/).pop() ?? `${baseName}.${result.format}`,
        result.format,
      );
    } catch (error) {
      await showError("Could not save document", error);
    }
  }

  async function showError(title: string, error: unknown): Promise<void> {
    const detail = error instanceof Error ? error.message : String(error);
    if (isTauri()) await message(detail, { title, kind: "error" });
    else window.alert(`${title}\n\n${detail}`);
  }

  async function unavailable(feature: string): Promise<void> {
    const detail = `${feature} is not wired to the Writer engine in this foundation build yet.`;
    if (isTauri()) await message(detail, { title: "OpenWord" });
    else window.alert(detail);
  }

  async function execute(type:
    | "format.toggleBold"
    | "format.toggleItalic"
    | "format.toggleUnderline"
    | "history.undo"
    | "history.redo"
  ): Promise<void> {
    const writer = requireWriter();
    if (!writer) return;
    try {
      await writer.client.execute({ type });
      requestAnimationFrame(() => document.getElementById("qtcanvas")?.focus());
    } catch (error) {
      await showError("Writer command failed", error);
    }
  }

  async function handleMenuAction(id: string): Promise<void> {
    switch (id) {
      case "file_new": return doNew();
      case "file_open": return doOpen();
      case "file_save": return doSave();
      case "file_save_as": return doSaveAs();
      case "file_export_docx": return unavailable("Export to DOCX");
      case "file_print": return unavailable("Printing");
      case "file_close": return;
      case "edit_undo": return execute("history.undo");
      case "edit_redo": return execute("history.redo");
      case "format_bold": return execute("format.toggleBold");
      case "format_italic": return execute("format.toggleItalic");
      case "format_underline": return execute("format.toggleUnderline");
      case "help_about":
        return isTauri()
          ? message("OpenWord Writer foundation build. One local LibreOffice Writer engine; macros and extensions are disabled.", { title: "OpenWord" })
          : undefined;
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
        await nextClient.newDocument("docx");
        writerState.setDocument(null, "Document1.docx", "docx");
      }
      documentInitialized = true;
    } catch (error) {
      writerState.setStartupFailure(error);
      await showError("Writer initialization failed", error);
    }
  }

  onMount(() => {
    if (!isTauri()) return;

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
        const discard = await ask(
          "You have unsaved changes. Quit without saving? Recovery snapshots are not available in this foundation build.",
          { title: "OpenWord" },
        );
        if (discard) await getCurrentWindow().destroy();
      })
      .then((fn) => (unlistenClose = fn));

    return () => {
      unlistenMenu.then((fn) => fn());
      unlistenOpen.then((fn) => fn());
      unlistenClose?.();
      unsubscribeWriter?.();
      client?.destroy();
      runtimeHost?.destroy();
    };
  });
</script>

<div class="ow-app">
  <WriterHomeBar {client} state={writerState} onsave={() => void doSave()} />
  <main class="ow-writer-main">
    <WriterCanvas
      onready={(nextClient, nextHost) => void handleWriterReady(nextClient, nextHost)}
      onfailure={(error) => writerState.setStartupFailure(error)}
    />
  </main>
  <WriterStatusBar state={writerState} />
</div>

<style>
  .ow-writer-main {
    flex: 1;
    display: flex;
    min-width: 0;
    min-height: 0;
  }
</style>
