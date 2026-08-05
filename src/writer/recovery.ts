import { appDataDir } from "@tauri-apps/api/path";
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
import type { WriterClient } from "./client";
import {
  mergeWriterPackage,
  type PackagePreservationSnapshot,
} from "./packagePassthrough";
import type { WriterFormat } from "./protocol";
import type { WriterRuntimeHost } from "./runtimeHost";

export interface RecoveryMetadata {
  version: 1;
  generation: string;
  createdAt: string;
  fileName: string;
  originalPath: string | null;
  format: WriterFormat;
  documentFile: string;
}

export interface RecoverySnapshot {
  metadata: RecoveryMetadata;
  bytes: Uint8Array;
}

export interface RecoverySource {
  fileName: string;
  originalPath: string | null;
  format: WriterFormat;
  preservation: PackagePreservationSnapshot | null;
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

async function recoveryDirectory(): Promise<string> {
  const directory = `${await appDataDir()}/recovery`;
  if (!(await exists(directory))) await mkdir(directory, { recursive: true });
  return directory;
}

async function readCurrentMetadata(directory: string): Promise<RecoveryMetadata | null> {
  const pointerPath = `${directory}/current.json`;
  if (!(await exists(pointerPath))) return null;
  try {
    const parsed = JSON.parse(await readTextFile(pointerPath)) as RecoveryMetadata;
    if (
      parsed?.version !== 1 ||
      typeof parsed.generation !== "string" ||
      typeof parsed.documentFile !== "string" ||
      (parsed.format !== "docx" && parsed.format !== "odt")
    ) {
      return null;
    }
    return parsed;
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

  const directory = await recoveryDirectory();
  const previous = await readCurrentMetadata(directory);
  const documentFile = `${generation}.${source.format}`;
  const documentPath = `${directory}/${documentFile}`;
  const stagedDocumentPath = `${documentPath}.tmp`;
  const metadata: RecoveryMetadata = {
    version: 1,
    generation,
    createdAt: new Date().toISOString(),
    fileName: source.fileName,
    originalPath: source.originalPath,
    format: source.format,
    documentFile,
  };

  if (await exists(stagedDocumentPath)) await remove(stagedDocumentPath);
  await writeFile(stagedDocumentPath, bytes);
  await rename(stagedDocumentPath, documentPath);
  await replacePointer(directory, `${JSON.stringify(metadata, null, 2)}\n`);

  if (previous && previous.documentFile !== documentFile) {
    const previousPath = `${directory}/${previous.documentFile}`;
    if (await exists(previousPath)) await remove(previousPath).catch(() => {});
  }
  return metadata;
}

export async function readRecoverySnapshot(): Promise<RecoverySnapshot | null> {
  const directory = await recoveryDirectory();
  const metadata = await readCurrentMetadata(directory);
  if (!metadata) return null;
  const documentPath = `${directory}/${metadata.documentFile}`;
  if (!(await exists(documentPath))) return null;
  return { metadata, bytes: await readFile(documentPath) };
}

export async function clearRecoverySnapshot(): Promise<void> {
  const directory = await recoveryDirectory();
  const metadata = await readCurrentMetadata(directory);
  const pointerPath = `${directory}/current.json`;
  if (metadata) {
    const documentPath = `${directory}/${metadata.documentFile}`;
    if (await exists(documentPath)) await remove(documentPath).catch(() => {});
  }
  if (await exists(pointerPath)) await remove(pointerPath);
}
