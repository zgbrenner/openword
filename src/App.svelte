<script lang="ts">
  import { onMount, setContext } from "svelte";
  import { listen } from "@tauri-apps/api/event";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { ask, save } from "@tauri-apps/plugin-dialog";
  import { addRowAfter, addColumnAfter, deleteRow, deleteColumn, deleteTable } from "prosemirror-tables";
  import Toolbar from "@/components/Toolbar.svelte";
  import Ruler from "@/components/Ruler.svelte";
  import PageCanvas from "@/components/PageCanvas.svelte";
  import StatusBar from "@/components/StatusBar.svelte";
  import FindReplace from "@/components/FindReplace.svelte";
  import { EditorController } from "@/lib/editorController.svelte";
  import { ViewState } from "@/lib/viewState.svelte";
  import { PaginationState } from "@/lib/paginationState.svelte";
  import { isTauri } from "@/lib/tauriEnv";
  import {
    newDocument,
    openDocumentDialog,
    openDocumentAtPath,
    saveDocumentAsDialog,
    writeDocument,
    writeRecoverySnapshot,
    readRecoverySnapshot,
    clearRecoverySnapshot,
    notify,
  } from "@/lib/fileApi";

  const controller = new EditorController(newDocument());
  const view = new ViewState();
  const pagination = new PaginationState();
  setContext("editor", controller);
  setContext("view", view);
  setContext("pagination", pagination);

  let findOpen = $state(false);
  let findWithReplace = $state(false);

  $effect(() => {
    const title = `${controller.dirty ? "● " : ""}${controller.fileName} — OpenWord`;
    if (isTauri()) {
      getCurrentWindow()
        .setTitle(title)
        .catch(() => {});
    } else {
      document.title = title;
    }
  });

  async function doSave() {
    if (controller.filePath) {
      await writeDocument(controller.doc, controller.filePath, controller.fileFormat);
      controller.markDirty(false);
      await clearRecoverySnapshot();
    } else {
      await doSaveAs();
    }
  }

  async function doSaveAs() {
    const result = await saveDocumentAsDialog(controller.doc, controller.fileName.replace(/\.[^.]+$/, ""));
    if (!result) return;
    controller.filePath = result.path;
    controller.fileFormat = result.format;
    controller.fileName = result.path.split(/[\\/]/).pop() ?? controller.fileName;
    controller.markDirty(false);
    await clearRecoverySnapshot();
  }

  async function doExportDocx() {
    const path = await save({
      defaultPath: `${controller.fileName.replace(/\.[^.]+$/, "")}.docx`,
      filters: [{ name: "Word Document", extensions: ["docx"] }],
    });
    if (!path) return;
    await writeDocument(controller.doc, path, "docx");
  }

  async function doOpen() {
    if (controller.dirty) {
      const proceed = await ask("You have unsaved changes. Discard them and open another document?", {
        title: "OpenWord",
      });
      if (!proceed) return;
    }
    const result = await openDocumentDialog();
    if (!result) return;
    applyOpenResult(result);
  }

  function applyOpenResult(result: { doc: any; path: string; format: "owdoc" | "docx"; name: string }) {
    controller.loadDocument(result.doc);
    controller.filePath = result.path;
    controller.fileFormat = result.format;
    controller.fileName = result.name;
  }

  async function doNew() {
    if (controller.dirty) {
      const proceed = await ask("You have unsaved changes. Discard them and start a new document?", {
        title: "OpenWord",
      });
      if (!proceed) return;
    }
    controller.loadDocument(newDocument());
    controller.filePath = null;
    controller.fileFormat = "owdoc";
    controller.fileName = "Untitled document";
    await clearRecoverySnapshot();
  }

  function tableCommand(fn: (state: any, dispatch: any) => boolean) {
    if (!controller.view) return;
    fn(controller.view.state, controller.view.dispatch);
    controller.focus();
  }

  async function handleMenuAction(id: string) {
    switch (id) {
      case "file_new": return doNew();
      case "file_open": return doOpen();
      case "file_save": return doSave();
      case "file_save_as": return doSaveAs();
      case "file_export_docx": return doExportDocx();
      case "file_print": return window.print();
      case "file_close": return;

      case "edit_undo": return controller.undo();
      case "edit_redo": return controller.redo();
      case "edit_find":
        findWithReplace = false;
        findOpen = true;
        return;
      case "edit_find_replace":
        findWithReplace = true;
        findOpen = true;
        return;
      case "edit_paste_without_formatting":
        return document.execCommand?.("paste");

      case "view_zoom_in": return view.zoomIn();
      case "view_zoom_out": return view.zoomOut();
      case "view_zoom_reset": return view.zoomReset();
      case "view_toggle_ruler": return view.toggleRuler();

      case "insert_image": {
        const toolbar = document.querySelector<HTMLButtonElement>('[title="Insert image"]');
        toolbar?.click();
        return;
      }
      case "insert_table": {
        const toolbar = document.querySelector<HTMLButtonElement>('[title="Insert table"]');
        toolbar?.click();
        return;
      }
      case "insert_link": {
        const toolbar = document.querySelector<HTMLButtonElement>('[title="Insert link (Ctrl+K)"]');
        toolbar?.click();
        return;
      }
      case "insert_page_break": return controller.insertPageBreak();
      case "insert_comment":
        return notify("Comments", "Comments aren't implemented yet — tracked as a follow-up in ARCHITECTURE.md.");

      case "format_bold": return controller.toggleBold();
      case "format_italic": return controller.toggleItalic();
      case "format_underline": return controller.toggleUnderline();
      case "format_strikethrough": return controller.toggleStrike();
      case "format_align_left": return controller.setAlign("left");
      case "format_align_center": return controller.setAlign("center");
      case "format_align_right": return controller.setAlign("right");
      case "format_align_justify": return controller.setAlign("justify");
      case "format_bullet_list": return controller.toggleBulletList();
      case "format_ordered_list": return controller.toggleOrderedList();
      case "format_clear": return controller.clearFormatting();

      case "tools_word_count": {
        const wc = controller.snapshot.wordCount;
        return notify("Word count", `Words: ${wc.words}\nCharacters: ${wc.characters}\nCharacters (no spaces): ${wc.charactersNoSpaces}\nPages: ${pagination.pageCount}`);
      }
      case "tools_spelling":
        return notify("Spelling and grammar", "Spellcheck uses your OS's built-in checker (right-click a misspelled word). A dedicated grammar checker is a possible future add-on, kept out of the lightweight core.");

      case "table_insert_row_below": return tableCommand(addRowAfter);
      case "table_insert_column_right": return tableCommand(addColumnAfter);
      case "table_delete_row": return tableCommand(deleteRow);
      case "table_delete_column": return tableCommand(deleteColumn);
      case "table_delete": return tableCommand(deleteTable);

      case "help_shortcuts":
        return notify(
          "Keyboard shortcuts",
          "Bold: Ctrl/Cmd+B  Italic: Ctrl/Cmd+I  Underline: Ctrl/Cmd+U\nUndo: Ctrl/Cmd+Z  Redo: Ctrl/Cmd+Shift+Z\nFind: Ctrl/Cmd+F  Replace: Ctrl/Cmd+H\nSave: Ctrl/Cmd+S  Print: Ctrl/Cmd+P\nBullet list: Ctrl/Cmd+Shift+8  Numbered list: Ctrl/Cmd+Shift+7",
        );
      case "help_about":
        return notify("OpenWord", "OpenWord 0.1.0 — a free, open-source, lightweight word processor.\nApache-2.0 licensed.");
      default:
        return;
    }
  }

  onMount(() => {
    // Outside the real Tauri shell (e.g. a plain-browser dev preview) none of
    // the native menu/window/fs bridges exist — skip wiring them up rather
    // than letting the IPC calls throw during startup.
    if (!isTauri()) return;

    const unlistenMenu = listen<string>("menu:action", (e) => handleMenuAction(e.payload));
    const unlistenOpen = listen<string[]>("file:open-path", async (e) => {
      const path = e.payload[0];
      if (!path) return;
      const result = await openDocumentAtPath(path);
      applyOpenResult(result);
    });

    (async () => {
      const recovered = await readRecoverySnapshot().catch(() => null);
      if (recovered) {
        const restore = await ask("OpenWord found unsaved work from a previous session. Restore it?", {
          title: "Recover document",
        });
        if (restore) {
          controller.loadDocument(recovered);
          controller.markDirty(true);
        } else {
          await clearRecoverySnapshot();
        }
      }
    })();

    const autosave = window.setInterval(() => {
      if (controller.dirty) writeRecoverySnapshot(controller.doc).catch(() => {});
    }, 20000);

    let unlistenClose: (() => void) | undefined;
    getCurrentWindow()
      .onCloseRequested(async (event) => {
        if (!controller.dirty) return;
        event.preventDefault();
        const discard = await ask("You have unsaved changes. Quit without saving?", { title: "OpenWord" });
        if (discard) {
          await clearRecoverySnapshot().catch(() => {});
          await getCurrentWindow().destroy();
        }
      })
      .then((fn) => (unlistenClose = fn));

    return () => {
      unlistenMenu.then((fn) => fn());
      unlistenOpen.then((fn) => fn());
      unlistenClose?.();
      window.clearInterval(autosave);
    };
  });
</script>

<div class="ow-app">
  <Toolbar />
  <Ruler />
  <div class="ow-canvas-area">
    <PageCanvas />
    <FindReplace bind:open={findOpen} bind:withReplace={findWithReplace} />
  </div>
  <StatusBar />
</div>

<style>
  .ow-canvas-area {
    position: relative;
    flex: 1;
    display: flex;
    min-height: 0;
  }
</style>
