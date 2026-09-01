import type { Node as PMNode } from "prosemirror-model";
import type { CommentThread } from "@/editor/comments";
import {
  documentBaseName,
  documentFormatForPath,
  emptyDoc,
  parseOwDoc,
  serializeOwDoc,
  type DocumentFormat,
  type LoadedDocument,
} from "@/editor/document";
import type { SuggestionMetaStore } from "@/editor/trackChanges";
import { getPlatform } from "@/platform";
import type {
  DocumentReplaceResult,
  FileDialogFilter,
  RecoveryMetadata,
} from "@/platform";

// The editor's document lifecycle. Everything that touches bytes goes through
// the platform layer, so the same code saves to the real filesystem inside the
// Tauri shell and to browser storage on the website.

export type FileFormat = DocumentFormat;

export interface OpenResult extends LoadedDocument {
  /**
   * Null when the platform could only hand over bytes (a browser with no File
   * System Access API): the document opens detached and needs a Save As.
   */
  path: string | null;
  format: FileFormat;
  name: string;
}

export interface SaveAsResult {
  path: string;
  format: FileFormat;
  name: string;
  /** Set when the previous file could not be removed after a successful save. */
  retainedBackupPath: string | null;
}

export interface RecoveredDocument extends LoadedDocument {
  fileName: string;
  originalPath: string | null;
  createdAt: string;
}

const OPEN_FILTERS: FileDialogFilter[] = [
  { name: "All documents", extensions: ["owdoc", "docx"] },
  { name: "OpenWord Document", extensions: ["owdoc"] },
  { name: "Word Document", extensions: ["docx"] },
];

const SAVE_FILTERS: FileDialogFilter[] = [
  { name: "OpenWord Document", extensions: ["owdoc"] },
  { name: "Word Document", extensions: ["docx"] },
];

export function newDocument(): PMNode {
  return emptyDoc();
}

// DOCX conversion is the heaviest code in the app and most sessions never
// touch it, so both directions stay behind a dynamic import.
async function decodeDocument(bytes: Uint8Array, format: FileFormat): Promise<LoadedDocument> {
  if (format === "docx") {
    const { importDocx } = await import("@/docx/import");
    return importDocx(bytes);
  }
  return parseOwDoc(new TextDecoder().decode(bytes));
}

async function encodeDocument(
  doc: PMNode,
  comments: CommentThread[],
  suggestionMeta: SuggestionMetaStore,
  format: FileFormat,
): Promise<Uint8Array> {
  if (format === "docx") {
    const { exportDocx } = await import("@/docx/export");
    const blob = await exportDocx(doc, comments, suggestionMeta);
    return new Uint8Array(await blob.arrayBuffer());
  }
  return new TextEncoder().encode(serializeOwDoc(doc, comments, suggestionMeta));
}

export async function openDocumentDialog(): Promise<OpenResult | null> {
  const pick = await getPlatform().pickOpenDocument(OPEN_FILTERS);
  if (!pick) return null;
  if (pick.kind === "path") return openDocumentAtPath(pick.path);

  const format = documentFormatForPath(pick.name);
  return { ...(await decodeDocument(pick.bytes, format)), path: null, format, name: pick.name };
}

export async function openDocumentAtPath(path: string): Promise<OpenResult> {
  const platform = getPlatform();
  const format = documentFormatForPath(path);
  const [name, bytes] = await Promise.all([
    platform.documentDisplayName(path),
    platform.readDocument(path),
  ]);
  return { ...(await decodeDocument(bytes, format)), path, format, name };
}

/** Replace the document at `path`; the platform guarantees the swap is atomic. */
export async function writeDocument(
  doc: PMNode,
  comments: CommentThread[],
  suggestionMeta: SuggestionMetaStore,
  path: string,
  format: FileFormat,
): Promise<DocumentReplaceResult> {
  const bytes = await encodeDocument(doc, comments, suggestionMeta, format);
  return getPlatform().replaceDocument(path, bytes);
}

export async function saveDocumentAsDialog(
  doc: PMNode,
  comments: CommentThread[],
  suggestionMeta: SuggestionMetaStore,
  suggestedName = "Untitled",
): Promise<SaveAsResult | null> {
  const platform = getPlatform();
  const path = await platform.pickSaveDocument({
    defaultBaseName: documentBaseName(suggestedName) || "Untitled",
    filters: SAVE_FILTERS,
    // Plain Save has to keep working after this, so a browser without a save
    // picker keeps the document in its own storage rather than only
    // downloading a detached copy.
    webFallback: "browser-storage",
  });
  if (!path) return null;

  const format = documentFormatForPath(path);
  const { retainedBackupPath } = await writeDocument(doc, comments, suggestionMeta, path, format);
  return { path, format, name: await platform.documentDisplayName(path), retainedBackupPath };
}

// --- Crash-recovery autosave -------------------------------------------
// The snapshot is a complete .owdoc file handed to the platform recovery
// store, which guarantees per generation that a crash leaves either the
// previous complete snapshot or the new one — never a torn mixture.

function generationId(): string {
  const raw = typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return raw.replace(/[^a-zA-Z0-9-]/g, "");
}

export async function writeRecoverySnapshot(
  doc: PMNode,
  comments: CommentThread[],
  suggestionMeta: SuggestionMetaStore,
  source: { fileName: string; originalPath: string | null },
): Promise<void> {
  const generation = generationId();
  const metadata: RecoveryMetadata = {
    version: 1,
    generation,
    createdAt: new Date().toISOString(),
    fileName: source.fileName,
    originalPath: source.originalPath,
    format: "owdoc",
    documentFile: `${generation}.owdoc`,
  };
  const bytes = new TextEncoder().encode(serializeOwDoc(doc, comments, suggestionMeta));
  await getPlatform().recovery.write(metadata, bytes);
}

export async function readRecoverySnapshot(): Promise<RecoveredDocument | null> {
  const snapshot = await getPlatform().recovery.read();
  // A snapshot written by the Writer engine shell is a DOCX/ODT package, not
  // an .owdoc file — leave it alone instead of failing to parse it.
  if (!snapshot || snapshot.metadata.format !== "owdoc") return null;
  return {
    ...parseOwDoc(new TextDecoder().decode(snapshot.bytes)),
    fileName: snapshot.metadata.fileName,
    originalPath: snapshot.metadata.originalPath,
    createdAt: snapshot.metadata.createdAt,
  };
}

export async function clearRecoverySnapshot(): Promise<void> {
  await getPlatform().recovery.clear();
}
