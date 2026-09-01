import { appDialogs } from "@/lib/appDialogs.svelte";
import { resolveShellMode } from "@/lib/shellMode";
import { createShellScopedRecoveryStore } from "../recovery_slots";
import type {
  DocumentPick,
  DocumentReplaceResult,
  FileDialogFilter,
  MessageDialogOptions,
  Platform,
  SaveDialogOptions,
} from "../types";
import { webKvStore } from "./idbKv";
import {
  readOpfsFile,
  writeOpfsFileAtomic,
  type OpfsDirectoryHandle,
} from "./opfs_files";
import {
  downloadWebPath,
  handleWebPath,
  opfsWebPath,
  parseWebDocumentPath,
  webDocumentFileName,
} from "./web_paths";
import { createWebRecoveryStore } from "./web_recovery_store";

// The browser backend. Documents live in three kinds of places:
//  - real files the user picked through the File System Access API
//    (Chromium): saved in place, exactly like desktop;
//  - the Origin Private File System, when the browser has no save picker:
//    plain Save keeps working against browser storage, and Save As hands the
//    user a downloaded copy;
//  - one-shot downloads for exports.
// Recovery snapshots always live in IndexedDB.

const OPFS_DOCUMENTS_DIRECTORY = "Documents";

const MIME_BY_EXTENSION: Record<string, string> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  odt: "application/vnd.oasis.opendocument.text",
  owdoc: "application/x-openword",
  pdf: "application/pdf",
};

function pickerTypes(filters: FileDialogFilter[]): FilePickerAcceptType[] {
  return filters.map((filter) => {
    const accept: Record<string, string[]> = {};
    for (const extension of filter.extensions) {
      const mime = MIME_BY_EXTENSION[extension] ?? "application/octet-stream";
      accept[mime] = [...(accept[mime] ?? []), `.${extension}`];
    }
    return { description: filter.name, accept };
  });
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

// --- File System Access handle registry ------------------------------------
// Handles are keyed by an opaque id embedded in the document path token and
// persisted in IndexedDB (handles are structured-cloneable), so a document
// restored from recovery after a reload can still be saved back in place
// once the user re-grants permission.

const handleCache = new Map<string, FileSystemFileHandle>();

function handleStorageKey(handleId: string): string {
  return `handle/${handleId}`;
}

function newHandleId(): string {
  const raw = typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return raw.replace(/[^a-zA-Z0-9-]/g, "");
}

async function registerHandle(handle: FileSystemFileHandle): Promise<string> {
  const handleId = newHandleId();
  handleCache.set(handleId, handle);
  try {
    await webKvStore.set(handleStorageKey(handleId), handle);
  } catch {
    // Persistence is an enhancement for after-reload saves; the in-memory
    // registration is enough for this session.
  }
  return handleId;
}

async function resolveHandle(handleId: string): Promise<FileSystemFileHandle> {
  const cached = handleCache.get(handleId);
  if (cached) return cached;
  const stored = await webKvStore.get(handleStorageKey(handleId)).catch(() => null);
  if (!stored) {
    throw new Error("This document's file handle is no longer available. Use Save As to choose a location again.");
  }
  const handle = stored as FileSystemFileHandle;
  handleCache.set(handleId, handle);
  return handle;
}

async function ensureHandlePermission(
  handle: FileSystemFileHandle,
  mode: "read" | "readwrite",
): Promise<void> {
  const descriptor: FileSystemHandlePermissionDescriptor = { mode };
  const current = (await handle.queryPermission?.(descriptor)) ?? "granted";
  if (current === "granted") return;
  const granted = (await handle.requestPermission?.(descriptor)) ?? "denied";
  if (granted !== "granted") {
    throw new Error("OpenWord no longer has permission for this file. Use Save As to choose a location again.");
  }
}

// --- Origin Private File System --------------------------------------------

let opfsRootPromise: Promise<OpfsDirectoryHandle> | null = null;

function opfsAvailable(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.storage?.getDirectory === "function";
}

function opfsRoot(): Promise<OpfsDirectoryHandle> {
  opfsRootPromise ??= (async () => {
    if (!opfsAvailable()) {
      throw new Error("This browser does not provide origin private file system storage.");
    }
    // Ask the browser to treat OpenWord's storage as persistent so documents
    // and recovery data are not silently evicted under storage pressure.
    await navigator.storage.persist?.().catch(() => false);
    return (await navigator.storage.getDirectory()) as unknown as OpfsDirectoryHandle;
  })().catch((error) => {
    opfsRootPromise = null;
    throw error;
  });
  return opfsRootPromise;
}

// --- Downloads --------------------------------------------------------------

function triggerDownload(fileName: string, bytes: Uint8Array): void {
  const extension = fileName.toLowerCase().split(".").pop() ?? "";
  const type = MIME_BY_EXTENSION[extension] ?? "application/octet-stream";
  const blob = new Blob([bytes.slice().buffer], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

// Browser-storage documents created through the fallback Save As dialog also
// hand the user one downloaded copy on that first save, so choosing "Save"
// in the dialog always produces a tangible file.
const pendingFirstDownload = new Set<string>();

// --- File-input fallback ----------------------------------------------------

function pickWithFileInput(filters: FileDialogFilter[]): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = filters
      .flatMap((filter) => filter.extensions)
      .map((extension) => `.${extension}`)
      .join(",");
    input.style.display = "none";
    let settled = false;
    const finish = (file: File | null) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(file);
    };
    input.addEventListener("change", () => finish(input.files?.[0] ?? null));
    input.addEventListener("cancel", () => finish(null));
    document.body.appendChild(input);
    input.click();
  });
}

// --- The platform -----------------------------------------------------------

export const webPlatform: Platform = {
  kind: "web",

  ask(question: string, options?: MessageDialogOptions): Promise<boolean> {
    return appDialogs.ask(question, options);
  },

  message(detail: string, options?: MessageDialogOptions): Promise<void> {
    return appDialogs.message(detail, options);
  },

  async pickOpenDocument(filters: FileDialogFilter[]): Promise<DocumentPick | null> {
    if (typeof window.showOpenFilePicker === "function") {
      let handle: FileSystemFileHandle;
      try {
        [handle] = await window.showOpenFilePicker({
          multiple: false,
          types: pickerTypes(filters),
        });
      } catch (error) {
        if (isAbortError(error)) return null;
        throw error;
      }
      if (!handle) return null;
      const handleId = await registerHandle(handle);
      return { kind: "path", path: handleWebPath(handleId, handle.name) };
    }

    const file = await pickWithFileInput(filters);
    if (!file) return null;
    return { kind: "bytes", name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) };
  },

  async pickSaveDocument(options: SaveDialogOptions): Promise<string | null> {
    const defaultExtension = options.filters[0]?.extensions[0] ?? "docx";

    if (typeof window.showSaveFilePicker === "function") {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: `${options.defaultBaseName}.${defaultExtension}`,
          types: pickerTypes(options.filters),
        });
        const handleId = await registerHandle(handle);
        return handleWebPath(handleId, handle.name);
      } catch (error) {
        if (isAbortError(error)) return null;
        throw error;
      }
    }

    const useBrowserStorage = options.webFallback === "browser-storage" && opfsAvailable();
    const result = await appDialogs.saveAs({
      baseName: options.defaultBaseName,
      formats: options.filters.map((filter) => ({
        value: filter.extensions[0],
        label: filter.name,
        extension: filter.extensions[0],
      })),
      note: useBrowserStorage
        ? "This browser cannot write files in place. The document is kept in this browser's storage and a copy is downloaded."
        : "This browser cannot write files in place. The document is downloaded through the browser.",
    });
    if (!result) return null;

    if (useBrowserStorage) {
      const path = opfsWebPath([OPFS_DOCUMENTS_DIRECTORY], result.name);
      pendingFirstDownload.add(path);
      return path;
    }
    return downloadWebPath(result.name);
  },

  async readDocument(path: string): Promise<Uint8Array> {
    const parsed = parseWebDocumentPath(path);
    if (!parsed) throw new Error(`Not an OpenWord web document path: ${path}`);
    if (parsed.scheme === "handle") {
      const handle = await resolveHandle(parsed.handleId);
      await ensureHandlePermission(handle, "read");
      const file = await handle.getFile();
      return new Uint8Array(await file.arrayBuffer());
    }
    if (parsed.scheme === "opfs") {
      return readOpfsFile(await opfsRoot(), parsed.segments);
    }
    throw new Error("Download targets cannot be read back.");
  },

  async readDocumentText(path: string): Promise<string> {
    return new TextDecoder().decode(await this.readDocument(path));
  },

  async replaceDocument(path: string, bytes: Uint8Array): Promise<DocumentReplaceResult> {
    const parsed = parseWebDocumentPath(path);
    if (!parsed) throw new Error(`Not an OpenWord web document path: ${path}`);

    if (parsed.scheme === "handle") {
      // createWritable stages into a swap file and replaces the target only
      // on close — the browser-native equivalent of the desktop staged write.
      const handle = await resolveHandle(parsed.handleId);
      await ensureHandlePermission(handle, "readwrite");
      const writable = await handle.createWritable({ keepExistingData: false });
      try {
        await writable.write(bytes.slice().buffer);
      } catch (error) {
        await writable.abort?.().catch(() => {});
        throw error;
      }
      await writable.close();
      return { retainedBackupPath: null };
    }

    if (parsed.scheme === "opfs") {
      await writeOpfsFileAtomic(await opfsRoot(), parsed.segments, bytes);
      if (pendingFirstDownload.delete(path)) {
        triggerDownload(parsed.fileName, bytes);
      }
      return { retainedBackupPath: null };
    }

    triggerDownload(parsed.fileName, bytes);
    return { retainedBackupPath: null };
  },

  async documentDisplayName(path: string): Promise<string> {
    return webDocumentFileName(path);
  },

  // Only the native shell is handed documents before its UI exists; a browser
  // launch arrives through the File Handling API once the page is running.
  async takePendingOpenPaths(): Promise<string[]> {
    return [];
  },

  // One IndexedDB slot per shell, so an editor autosave never overwrites and
  // an editor discard never deletes a Writer snapshot (and vice versa).
  recovery: createShellScopedRecoveryStore(
    {
      editor: createWebRecoveryStore(webKvStore),
      writer: createWebRecoveryStore(webKvStore, "recovery/current/writer"),
    },
    resolveShellMode,
  ),
};

/**
 * Registers an externally provided File System Access handle (a PWA launch
 * or drag-and-drop) and returns the document path token to open it with.
 */
export async function registerWebDocumentHandle(handle: FileSystemFileHandle): Promise<string> {
  await ensureHandlePermission(handle, "read");
  const handleId = await registerHandle(handle);
  return handleWebPath(handleId, handle.name);
}
