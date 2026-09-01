import { getPlatform } from "@/platform";
import type { RecoveryMetadata, RecoverySnapshot } from "@/platform";
import type { WriterClient } from "./client";
import {
  mergeWriterPackage,
  type PackagePreservationSnapshot,
} from "./packagePassthrough";
import type { WriterFormat } from "./protocol";
import type { WriterRuntimeHost } from "./runtimeHost";

export type { RecoveryMetadata, RecoverySnapshot } from "@/platform";

export interface RecoverySource {
  fileName: string;
  originalPath: string | null;
  /** Writer only ever snapshots its own package formats, never `.owdoc`. */
  format: WriterFormat;
  preservation: PackagePreservationSnapshot | null;
}

/**
 * The Writer format of a stored snapshot, or null when the snapshot is an
 * `.owdoc` file the editor shell left behind and this shell cannot reopen.
 */
export function writerRecoveryFormat(snapshot: RecoverySnapshot): WriterFormat | null {
  const { format } = snapshot.metadata;
  return format === "docx" || format === "odt" ? format : null;
}

function virtualUrl(path: string): string {
  return `file://${path}`;
}

function generationId(): string {
  const suffix = typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return suffix.replace(/[^a-zA-Z0-9-]/g, "");
}

/**
 * Snapshots the live document through Writer's storeToURL (which neither
 * changes document identity nor clears the modified state), applies the same
 * package-preservation treatment as a user save, and hands the generation to
 * the platform recovery store. Each backend guarantees that a crash leaves
 * either the previous complete snapshot or the new one — the desktop store
 * with staged files and an atomic pointer swap, the web store with a single
 * atomic browser-storage transaction.
 */
export async function writeRecoverySnapshot(
  client: WriterClient,
  host: WriterRuntimeHost,
  source: RecoverySource,
): Promise<RecoveryMetadata> {
  const generation = generationId();
  const virtualPath = `/tmp/openword/recovery-${generation}.${source.format}`;
  await client.snapshotPath(virtualUrl(virtualPath), source.format);

  let bytes: Uint8Array;
  try {
    bytes = host.readVirtualFile(virtualPath);
  } finally {
    host.removeVirtualFile(virtualPath);
  }
  const merged = await mergeWriterPackage(bytes, source.format, source.preservation);
  bytes = merged.bytes;

  const metadata: RecoveryMetadata = {
    version: 1,
    generation,
    createdAt: new Date().toISOString(),
    fileName: source.fileName,
    originalPath: source.originalPath,
    format: source.format,
    documentFile: `${generation}.${source.format}`,
  };

  await getPlatform().recovery.write(metadata, bytes);
  return metadata;
}

export async function readRecoverySnapshot(): Promise<RecoverySnapshot | null> {
  return getPlatform().recovery.read();
}

export async function clearRecoverySnapshot(): Promise<void> {
  return getPlatform().recovery.clear();
}
