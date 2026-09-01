import { getPlatform } from "@/platform";
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
  sourcePath: string | null;
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
  const pick = await getPlatform().pickOpenDocument(OPEN_FILTERS);
  if (!pick) return null;
  if (pick.kind === "path") return openWriterDocumentAtPath(pick.path, client, host);

  // The platform could only produce bytes (plain file-input fallback), so
  // there is no writable location to save back to: the document opens
  // detached and requires Save As, exactly like legacy migration.
  if (/\.owdoc$/i.test(pick.name)) {
    return migrateLegacyOwDocContent(
      new TextDecoder().decode(pick.bytes),
      pick.name,
      null,
      client,
      host,
    );
  }
  const format = formatFromPath(pick.name);
  const preservation = await openWriterDocumentBytes(pick.bytes, format, client, host);
  return { path: null, name: pick.name, format, preservation };
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
  const platform = getPlatform();
  const sourceName = await platform.documentDisplayName(path);
  const text = await platform.readDocumentText(path);
  return migrateLegacyOwDocContent(text, sourceName, path, client, host);
}

async function migrateLegacyOwDocContent(
  text: string,
  sourceName: string,
  sourcePath: string | null,
  client: WriterClient,
  host: WriterRuntimeHost,
): Promise<WriterOpenResult> {
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
      sourcePath,
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

  const platform = getPlatform();
  const format = formatFromPath(path);
  const bytes = await platform.readDocument(path);
  const preservation = await openWriterDocumentBytes(bytes, format, client, host);
  return { path, name: await platform.documentDisplayName(path), format, preservation };
}

export async function saveWriterDocumentAsDialog(
  client: WriterClient,
  host: WriterRuntimeHost,
  suggestedBaseName = "Document1",
  preservation: PackagePreservationSnapshot | null = null,
): Promise<WriterSaveResult | null> {
  const path = await getPlatform().pickSaveDocument({
    defaultBaseName: suggestedBaseName,
    filters: [
      { name: "Word Document", extensions: ["docx"] },
      { name: "OpenDocument Text", extensions: ["odt"] },
    ],
    webFallback: "browser-storage",
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
  const targetPath = await getPlatform().pickSaveDocument({
    defaultBaseName: suggestedBaseName,
    filters: [{ name: "PDF Document", extensions: ["pdf"] }],
    webFallback: "download",
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
 * Atomically replaces the target document through the platform backend: the
 * desktop shell writes a complete staged file beside the target before any
 * rename touches the original, and the web backend's writable streams commit
 * a complete swap file on close. Either way the previous document survives
 * any failure, and a retained desktop backup path is reported to the caller.
 */
async function replaceWithStagedFile(targetPath: string, bytes: Uint8Array): Promise<string | null> {
  const result = await getPlatform().replaceDocument(targetPath, bytes);
  return result.retainedBackupPath;
}
