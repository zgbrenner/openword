import { invoke } from "@tauri-apps/api/core";
import { appDataDir, basename } from "@tauri-apps/api/path";
import { ask, message, open, save } from "@tauri-apps/plugin-dialog";
import {
  exists,
  mkdir,
  readFile,
  readTextFile,
  remove,
  rename,
  writeFile,
  writeTextFile,
} from "@tauri-apps/plugin-fs";
import { resolveShellMode } from "@/lib/shellMode";
import { createShellScopedRecoveryStore } from "./recovery_slots";
import type {
  DocumentPick,
  DocumentReplaceResult,
  FileDialogFilter,
  MessageDialogOptions,
  Platform,
  PlatformRecoveryStore,
  RecoveryMetadata,
  RecoverySnapshot,
  SaveDialogOptions,
} from "./types";

/**
 * Replacing a document is one Rust command rather than a sequence of
 * filesystem-plugin calls, because a staged write needs sibling paths
 * (`<target>.openword-tmp-*` and `<target>.openword-backup-*`) that no
 * capability grants: the dialog plugin only ever allows the exact file the
 * user picked, and the filesystem plugin only allows what `fs:scope` lists.
 * Staging from the frontend therefore made every document outside `$HOME`,
 * `$DOCUMENT` and `$APPDATA` — a second drive, a mapped network share —
 * impossible to save. The shell performs the same staged write, backup and
 * pair of renames, all inside the target's own directory so the final rename
 * never has to cross a volume.
 */
async function replaceWithStagedNativeFile(
  targetPath: string,
  bytes: Uint8Array,
): Promise<DocumentReplaceResult> {
  // The bytes travel as the raw IPC body (`plugin:fs|write_file` uses the same
  // shape) so a large document is not re-encoded as a JSON array of numbers.
  const result = await invoke<DocumentReplaceResult>("replace_document_atomically", bytes, {
    headers: { path: encodeURIComponent(targetPath) },
  });
  return { retainedBackupPath: result.retainedBackupPath ?? null };
}

// --- Generation-safe recovery storage under the Tauri app-data directory ---

async function recoveryDirectory(): Promise<string> {
  const directory = `${await appDataDir()}/recovery`;
  if (!(await exists(directory))) await mkdir(directory, { recursive: true });
  return directory;
}

function isValidMetadata(parsed: RecoveryMetadata | null): parsed is RecoveryMetadata {
  return Boolean(
    parsed &&
    parsed.version === 1 &&
    typeof parsed.generation === "string" &&
    typeof parsed.documentFile === "string" &&
    (parsed.format === "docx" || parsed.format === "odt" || parsed.format === "owdoc"),
  );
}

async function readCurrentMetadata(pointerPath: string): Promise<RecoveryMetadata | null> {
  if (!(await exists(pointerPath))) return null;
  try {
    const parsed = JSON.parse(await readTextFile(pointerPath)) as RecoveryMetadata;
    return isValidMetadata(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function replacePointer(pointerPath: string, content: string): Promise<void> {
  const stagedPath = `${pointerPath}.tmp`;
  const backupPath = `${pointerPath}.backup`;

  if (await exists(stagedPath)) await remove(stagedPath);
  if (await exists(backupPath)) await remove(backupPath);
  await writeTextFile(stagedPath, content);

  const hadPointer = await exists(pointerPath);
  if (hadPointer) await rename(pointerPath, backupPath);
  try {
    await rename(stagedPath, pointerPath);
  } catch (error) {
    if (hadPointer && !(await exists(pointerPath)) && (await exists(backupPath))) {
      await rename(backupPath, pointerPath).catch(() => {});
    }
    throw error;
  }
  if (hadPointer && (await exists(backupPath))) await remove(backupPath);
}

/**
 * One generation-safe slot: a pointer file naming the current snapshot, and
 * the snapshot documents themselves (each named after its own generation, so
 * two slots sharing the directory never collide).
 */
function createRecoverySlot(pointerFile: string): PlatformRecoveryStore {
  return {
    async write(metadata: RecoveryMetadata, bytes: Uint8Array): Promise<void> {
      const directory = await recoveryDirectory();
      const pointerPath = `${directory}/${pointerFile}`;
      const previous = await readCurrentMetadata(pointerPath);
      const documentPath = `${directory}/${metadata.documentFile}`;
      const stagedDocumentPath = `${documentPath}.tmp`;

      if (await exists(stagedDocumentPath)) await remove(stagedDocumentPath);
      await writeFile(stagedDocumentPath, bytes);
      await rename(stagedDocumentPath, documentPath);
      await replacePointer(pointerPath, `${JSON.stringify(metadata, null, 2)}\n`);

      if (previous && previous.documentFile !== metadata.documentFile) {
        const previousPath = `${directory}/${previous.documentFile}`;
        if (await exists(previousPath)) await remove(previousPath).catch(() => {});
      }
    },

    async read(): Promise<RecoverySnapshot | null> {
      const directory = await recoveryDirectory();
      const metadata = await readCurrentMetadata(`${directory}/${pointerFile}`);
      if (!metadata) return null;
      const documentPath = `${directory}/${metadata.documentFile}`;
      if (!(await exists(documentPath))) return null;
      return { metadata, bytes: await readFile(documentPath) };
    },

    async clear(): Promise<void> {
      const directory = await recoveryDirectory();
      const pointerPath = `${directory}/${pointerFile}`;
      const metadata = await readCurrentMetadata(pointerPath);
      if (metadata) {
        const documentPath = `${directory}/${metadata.documentFile}`;
        if (await exists(documentPath)) await remove(documentPath).catch(() => {});
      }
      if (await exists(pointerPath)) await remove(pointerPath);
    },
  };
}

const desktopRecoveryStore = createShellScopedRecoveryStore(
  {
    // The editor keeps the original pointer file, so a snapshot written
    // before the slots were split is still offered back after an update.
    editor: createRecoverySlot("current.json"),
    writer: createRecoverySlot("current-writer.json"),
  },
  resolveShellMode,
);

export const desktopPlatform: Platform = {
  kind: "desktop",

  ask(question: string, options?: MessageDialogOptions): Promise<boolean> {
    return ask(question, { title: options?.title, kind: options?.kind });
  },

  async message(detail: string, options?: MessageDialogOptions): Promise<void> {
    await message(detail, { title: options?.title, kind: options?.kind });
  },

  async pickOpenDocument(filters: FileDialogFilter[]): Promise<DocumentPick | null> {
    const selected = await open({ multiple: false, filters });
    const path = Array.isArray(selected) ? selected[0] : selected;
    if (!path) return null;
    return { kind: "path", path };
  },

  async pickSaveDocument(options: SaveDialogOptions): Promise<string | null> {
    const defaultExtension = options.filters[0]?.extensions[0];
    const defaultPath = defaultExtension
      ? `${options.defaultBaseName}.${defaultExtension}`
      : options.defaultBaseName;
    return save({ defaultPath, filters: options.filters });
  },

  readDocument(path: string): Promise<Uint8Array> {
    return readFile(path);
  },

  readDocumentText(path: string): Promise<string> {
    return readTextFile(path);
  },

  replaceDocument(path: string, bytes: Uint8Array): Promise<DocumentReplaceResult> {
    return replaceWithStagedNativeFile(path, bytes);
  },

  documentDisplayName(path: string): Promise<string> {
    return basename(path);
  },

  // `setup()` in the Rust shell runs long before the page loads, so the
  // `file:open-path` event a cold start emits reaches no listener. The shell
  // buffers those paths as well as emitting them; this drains the buffer.
  takePendingOpenPaths(): Promise<string[]> {
    return invoke<string[]>("take_pending_open_paths");
  },

  recovery: desktopRecoveryStore,
};
