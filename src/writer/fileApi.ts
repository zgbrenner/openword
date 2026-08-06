import { basename } from "@tauri-apps/api/path";
import { open, save } from "@tauri-apps/plugin-dialog";
import { exists, readFile, readTextFile, remove, rename, writeFile } from "@tauri-apps/plugin-fs";
import type { WriterClient } from "./client";
import {
  capturePackage,
  mergeWriterPackage,
  type PackageCompatibilityReport,
  type PackagePreservationSnapshot,
} from "./packagePassthrough";
import type { WriterFormat } from "./protocol";
import type { WriterRuntimeHost } from "./runtimeHost";

export interface LegacyMigrationInfo {
  sourcePath: string;
  sourceName: string;
  message: string;
}

export interface WriterOpenResult {
  path: string | null;
  name: string;
  format: WriterFormat;
  preservation: PackagePreservationSnapshot;
  migration?: LegacyMigrationInfo;
}

export interface WriterSaveResult {
  path: string;
  format: WriterFormat;
  bytesWritten: number;
  recoveryPath: string | null;
  preservation: PackagePreservationSnapshot;
  compatibilityReport: PackageCompatibilityReport;
}

export interface WriterPdfExportResult {
  path: string;
  bytesWritten: number;
  recoveryPath: string | null;
}

const OPEN_FILTERS = [
  { name: "All supported documents", extensions: ["docx", "odt", "owdoc"] },
  { name: "Word Document", extensions: ["docx"] },
  { name: "OpenDocument Text", extensions: ["odt"] },
  { name: "Legacy OpenWord Document", extensions: ["owdoc"] },
];

export function formatFromPath(path: string): WriterFormat {
  const lower = path.toLowerCase();
  if (lower.endsWith(".docx")) return "docx";
  if (lower.endsWith(".odt")) return "odt";
  throw new Error(`Unsupported Writer document format: ${path}`);
}

function operationToken(): string {
  const raw = typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return raw.replace(/[^a-zA-Z0-9-]/g, "");
}

function virtualPath(purpose: string, extension: WriterFormat | "pdf"): string {
  return `/tmp/openword/${purpose}-${operationToken()}.${extension}`;
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

export async function openWriterDocumentBytes(
  bytes: Uint8Array,
  format: WriterFormat,
  client: WriterClient,
  host: WriterRuntimeHost,
): Promise<PackagePreservationSnapshot> {
  const preservation = await capturePackage(bytes, format);
  const sourcePath = virtualPath("source", format);
  host.writeVirtualFile(sourcePath, bytes);
  try {
    await client.openPath(virtualUrl(sourcePath));
    return preservation;
  } finally {
    host.removeVirtualFile(sourcePath);
  }
}

async function migrateLegacyOwDoc(
  path: string,
  client: WriterClient,
  host: WriterRuntimeHost,
): Promise<WriterOpenResult> {
  const sourceName = await basename(path);
  const text = await readTextFile(path);
  const [{ parseOwDoc }, { exportDocx }] = await Promise.all([
    import("@/editor/document"),
    import("@/docx/export"),
  ]);
  const legacy = parseOwDoc(text);
  const blob = await exportDocx(legacy.doc, legacy.comments, legacy.suggestionMeta);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const preservation = await openWriterDocumentBytes(bytes, "docx", client, host);
  const baseName = sourceName.replace(/\.owdoc$/i, "") || "Migrated document";

  return {
    path: null,
    name: `${baseName}.docx`,
    format: "docx",
    preservation,
    migration: {
      sourcePath: path,
      sourceName,
      message: "This legacy OpenWord document was converted into Writer and must be saved as DOCX or ODT.",
    },
  };
}

export async function openWriterDocumentAtPath(
  path: string,
  client: WriterClient,
  host: WriterRuntimeHost,
): Promise<WriterOpenResult> {
  if (/\.owdoc$/i.test(path)) return migrateLegacyOwDoc(path, client, host);

  const format = formatFromPath(path);
  const bytes = await readFile(path);
  const preservation = await openWriterDocumentBytes(bytes, format, client, host);
  return { path, name: await basename(path), format, preservation };
}

export async function saveWriterDocumentAsDialog(
  client: WriterClient,
  host: WriterRuntimeHost,
  suggestedBaseName = "Document1",
  preservation: PackagePreservationSnapshot | null = null,
): Promise<WriterSaveResult | null> {
  const path = await save({
    defaultPath: `${suggestedBaseName}.docx`,
    filters: [
      { name: "Word Document", extensions: ["docx"] },
      { name: "OpenDocument Text", extensions: ["odt"] },
    ],
  });
  if (!path) return null;
  return saveWriterDocument(path, formatFromPath(path), client, host, preservation);
}

export async function saveWriterDocument(
  targetPath: string,
  format: WriterFormat,
  client: WriterClient,
  host: WriterRuntimeHost,
  preservation: PackagePreservationSnapshot | null = null,
): Promise<WriterSaveResult> {
  const stagedVirtualPath = virtualPath("export", format);
  await client.savePath(virtualUrl(stagedVirtualPath), format);

  let bytes: Uint8Array;
  try {
    bytes = host.readVirtualFile(stagedVirtualPath);
  } finally {
    host.removeVirtualFile(stagedVirtualPath);
  }

  const merged = await mergeWriterPackage(bytes, format, preservation);
  const recoveryPath = await replaceWithStagedFile(targetPath, merged.bytes);
  return {
    path: targetPath,
    format,
    bytesWritten: merged.bytes.byteLength,
    recoveryPath,
    preservation: merged.preservation,
    compatibilityReport: merged.compatibilityReport,
  };
}

export async function exportWriterPdfDialog(
  client: WriterClient,
  host: WriterRuntimeHost,
  suggestedBaseName = "Document1",
): Promise<WriterPdfExportResult | null> {
  const targetPath = await save({
    defaultPath: `${suggestedBaseName}.pdf`,
    filters: [{ name: "PDF Document", extensions: ["pdf"] }],
  });
  if (!targetPath) return null;

  const stagedVirtualPath = virtualPath("pdf-export", "pdf");
  await client.exportPdfPath(virtualUrl(stagedVirtualPath));

  let bytes: Uint8Array;
  try {
    bytes = host.readVirtualFile(stagedVirtualPath);
  } finally {
    host.removeVirtualFile(stagedVirtualPath);
  }

  const recoveryPath = await replaceWithStagedFile(targetPath, bytes);
  return { path: targetPath, bytesWritten: bytes.byteLength, recoveryPath };
}

/**
 * Writes the complete new document beside the target before touching the
 * original. A failed replacement restores the original when possible and
 * deliberately retains the staged file so the new bytes remain recoverable.
 */
async function replaceWithStagedFile(targetPath: string, bytes: Uint8Array): Promise<string | null> {
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
      return backupPath;
    }
  }
  return null;
}
