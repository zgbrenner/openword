import { basename } from "@tauri-apps/api/path";
import { open, save } from "@tauri-apps/plugin-dialog";
import { exists, readFile, remove, rename, writeFile } from "@tauri-apps/plugin-fs";
import type { WriterClient } from "./client";
import type { WriterFormat } from "./protocol";
import type { WriterRuntimeHost } from "./runtimeHost";

export interface WriterOpenResult {
  path: string;
  name: string;
  format: WriterFormat;
}

export interface WriterSaveResult {
  path: string;
  format: WriterFormat;
  bytesWritten: number;
  recoveryPath: string | null;
}

const OPEN_FILTERS = [
  { name: "All supported documents", extensions: ["docx", "odt"] },
  { name: "Word Document", extensions: ["docx"] },
  { name: "OpenDocument Text", extensions: ["odt"] },
];

export function formatFromPath(path: string): WriterFormat {
  const lower = path.toLowerCase();
  if (lower.endsWith(".docx")) return "docx";
  if (lower.endsWith(".odt")) return "odt";
  throw new Error(`Unsupported Writer document format: ${path}`);
}

function virtualPath(name: "source" | "staged", format: WriterFormat): string {
  return `/tmp/openword/${name}.${format}`;
}

function virtualUrl(path: string): string {
  return `file://${path}`;
}

export async function openWriterDocumentDialog(
  client: WriterClient,
  host: WriterRuntimeHost,
): Promise<WriterOpenResult | null> {
  const selected = await open({ multiple: false, filters: OPEN_FILTERS });
  const path = Array.isArray(selected) ? selected[0] : selected;
  if (!path) return null;
  return openWriterDocumentAtPath(path, client, host);
}

export async function openWriterDocumentAtPath(
  path: string,
  client: WriterClient,
  host: WriterRuntimeHost,
): Promise<WriterOpenResult> {
  const format = formatFromPath(path);
  const bytes = await readFile(path);
  const sourcePath = virtualPath("source", format);

  host.writeVirtualFile(sourcePath, bytes);
  try {
    await client.openPath(virtualUrl(sourcePath));
  } finally {
    host.removeVirtualFile(sourcePath);
  }

  return { path, name: await basename(path), format };
}

export async function saveWriterDocumentAsDialog(
  client: WriterClient,
  host: WriterRuntimeHost,
  suggestedBaseName = "Document1",
): Promise<WriterSaveResult | null> {
  const path = await save({
    defaultPath: `${suggestedBaseName}.docx`,
    filters: [
      { name: "Word Document", extensions: ["docx"] },
      { name: "OpenDocument Text", extensions: ["odt"] },
    ],
  });
  if (!path) return null;
  return saveWriterDocument(path, formatFromPath(path), client, host);
}

export async function saveWriterDocument(
  targetPath: string,
  format: WriterFormat,
  client: WriterClient,
  host: WriterRuntimeHost,
): Promise<WriterSaveResult> {
  const stagedVirtualPath = virtualPath("staged", format);
  await client.savePath(virtualUrl(stagedVirtualPath), format);

  let bytes: Uint8Array;
  try {
    bytes = host.readVirtualFile(stagedVirtualPath);
  } finally {
    host.removeVirtualFile(stagedVirtualPath);
  }

  const recoveryPath = await replaceWithStagedFile(targetPath, bytes);
  return { path: targetPath, format, bytesWritten: bytes.byteLength, recoveryPath };
}

/**
 * Writes the complete new document beside the target before touching the
 * original. The backup is removed only after the staged file is in place.
 * A failed replacement restores the original when possible and deliberately
 * retains the staged file so the user's new bytes are recoverable.
 */
async function replaceWithStagedFile(targetPath: string, bytes: Uint8Array): Promise<string | null> {
  const stagedPath = `${targetPath}.openword-tmp`;
  const backupPath = `${targetPath}.openword-backup`;
  const hadOriginal = await exists(targetPath);

  if (await exists(backupPath)) await remove(backupPath);
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

  if (hadOriginal && (await exists(backupPath))) await remove(backupPath);
  return null;
}
