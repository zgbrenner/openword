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

function operationToken(): string {
  const raw = typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return raw.replace(/[^a-zA-Z0-9-]/g, "");
}

/**
 * Writes the complete new document beside the target before touching the
 * original. A failed replacement restores the original when possible and
 * deliberately retains the staged file so the new bytes remain recoverable.
 */
async function replaceWithStagedNativeFile(
  targetPath: string,
  bytes: Uint8Array,
): Promise<DocumentReplaceResult> {
  const token = operationToken();
  const stagedPath = `${targetPath}.openword-tmp-${token}`;
  const backupPath = `${targetPath}.openword-backup-${token}`;
  const hadOriginal = await exists(targetPath);

  await writeFile(stagedPath, bytes);
  if (hadOriginal) await rename(targetPath, backupPath);

  try {
    await rename(stagedPath, targetPath);
  } catch (error) {
    if (hadOriginal && !(await exists(targetPath)) && (await exists(backupPath))) {
      await rename(backupPath, targetPath).catch(() => {});
    }
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not replace ${targetPath}. New document bytes remain at ${stagedPath}. ${detail}`);
  }

  if (hadOriginal && (await exists(backupPath))) {
    try {
      await remove(backupPath);
    } catch {
      // The target is saved correctly. Retain the old file and report its
      // location instead of turning successful persistence into an error.
      return { retainedBackupPath: backupPath };
    }
  }
  return { retainedBackupPath: null };
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
    (parsed.format === "docx" || parsed.format === "odt"),
  );
}

async function readCurrentMetadata(directory: string): Promise<RecoveryMetadata | null> {
  const pointerPath = `${directory}/current.json`;
  if (!(await exists(pointerPath))) return null;
  try {
    const parsed = JSON.parse(await readTextFile(pointerPath)) as RecoveryMetadata;
    return isValidMetadata(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function replacePointer(directory: string, content: string): Promise<void> {
  const pointerPath = `${directory}/current.json`;
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

const desktopRecoveryStore: PlatformRecoveryStore = {
  async write(metadata: RecoveryMetadata, bytes: Uint8Array): Promise<void> {
    const directory = await recoveryDirectory();
    const previous = await readCurrentMetadata(directory);
    const documentPath = `${directory}/${metadata.documentFile}`;
    const stagedDocumentPath = `${documentPath}.tmp`;

    if (await exists(stagedDocumentPath)) await remove(stagedDocumentPath);
    await writeFile(stagedDocumentPath, bytes);
    await rename(stagedDocumentPath, documentPath);
    await replacePointer(directory, `${JSON.stringify(metadata, null, 2)}\n`);

    if (previous && previous.documentFile !== metadata.documentFile) {
      const previousPath = `${directory}/${previous.documentFile}`;
      if (await exists(previousPath)) await remove(previousPath).catch(() => {});
    }
  },

  async read(): Promise<RecoverySnapshot | null> {
    const directory = await recoveryDirectory();
    const metadata = await readCurrentMetadata(directory);
    if (!metadata) return null;
    const documentPath = `${directory}/${metadata.documentFile}`;
    if (!(await exists(documentPath))) return null;
    return { metadata, bytes: await readFile(documentPath) };
  },

  async clear(): Promise<void> {
    const directory = await recoveryDirectory();
    const metadata = await readCurrentMetadata(directory);
    const pointerPath = `${directory}/current.json`;
    if (metadata) {
      const documentPath = `${directory}/${metadata.documentFile}`;
      if (await exists(documentPath)) await remove(documentPath).catch(() => {});
    }
    if (await exists(pointerPath)) await remove(pointerPath);
  },
};

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

  recovery: desktopRecoveryStore,
};
