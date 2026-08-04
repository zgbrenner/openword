import { open, save, message } from "@tauri-apps/plugin-dialog";
import { readFile, writeFile, writeTextFile, readTextFile, rename, mkdir, exists, remove } from "@tauri-apps/plugin-fs";
import { appDataDir, basename } from "@tauri-apps/api/path";
import type { Node as PMNode } from "prosemirror-model";
import { docFromJSON, docToJSON, emptyDoc } from "@/editor/document";

export type FileFormat = "owdoc" | "docx";

export interface OpenResult {
  doc: PMNode;
  path: string;
  format: FileFormat;
  name: string;
}

const OPEN_FILTERS = [
  { name: "All documents", extensions: ["owdoc", "docx"] },
  { name: "OpenWord Document", extensions: ["owdoc"] },
  { name: "Word Document", extensions: ["docx"] },
];

function formatFromPath(path: string): FileFormat {
  return path.toLowerCase().endsWith(".docx") ? "docx" : "owdoc";
}

export function newDocument(): PMNode {
  return emptyDoc();
}

export async function openDocumentDialog(): Promise<OpenResult | null> {
  const selected = await open({ multiple: false, filters: OPEN_FILTERS });
  const path = Array.isArray(selected) ? selected[0] : selected;
  if (!path) return null;
  return openDocumentAtPath(path);
}

export async function openDocumentAtPath(path: string): Promise<OpenResult> {
  const format = formatFromPath(path);
  const name = await basename(path);
  if (format === "docx") {
    const bytes = await readFile(path);
    const { importDocx } = await import("@/docx/import");
    const doc = await importDocx(bytes);
    return { doc, path, format, name };
  }
  const text = await readTextFile(path);
  const doc = docFromJSON(JSON.parse(text));
  return { doc, path, format, name };
}

export async function saveDocumentAsDialog(doc: PMNode, suggestedName = "Untitled"): Promise<{ path: string; format: FileFormat } | null> {
  const path = await save({
    defaultPath: `${suggestedName}.owdoc`,
    filters: [
      { name: "OpenWord Document", extensions: ["owdoc"] },
      { name: "Word Document", extensions: ["docx"] },
    ],
  });
  if (!path) return null;
  const format = formatFromPath(path);
  await writeDocument(doc, path, format);
  return { path, format };
}

export async function writeDocument(doc: PMNode, path: string, format: FileFormat): Promise<void> {
  if (format === "docx") {
    const { exportDocx } = await import("@/docx/export");
    const blob = await exportDocx(doc);
    const buf = new Uint8Array(await blob.arrayBuffer());
    await writeFile(path, buf);
    return;
  }
  const json = JSON.stringify(docToJSON(doc));
  await writeTextFile(path, json);
}

// --- Crash-recovery autosave -------------------------------------------
// Deliberately not using the debounced key-value store plugin for document
// content (its writer can corrupt on power loss mid-write, per our Tauri
// research) — instead we write-to-temp then atomically rename into the app
// data dir, so a recovery file is either fully written or not touched.

async function recoveryDir(): Promise<string> {
  const dir = `${await appDataDir()}/recovery`;
  if (!(await exists(dir))) {
    await mkdir(dir, { recursive: true });
  }
  return dir;
}

export async function writeRecoverySnapshot(doc: PMNode, slot = "current"): Promise<void> {
  const dir = await recoveryDir();
  const finalPath = `${dir}/${slot}.owdoc`;
  const tmpPath = `${finalPath}.tmp`;
  await writeTextFile(tmpPath, JSON.stringify(docToJSON(doc)));
  await rename(tmpPath, finalPath);
}

export async function readRecoverySnapshot(slot = "current"): Promise<PMNode | null> {
  const dir = await recoveryDir();
  const finalPath = `${dir}/${slot}.owdoc`;
  if (!(await exists(finalPath))) return null;
  const text = await readTextFile(finalPath);
  return docFromJSON(JSON.parse(text));
}

export async function clearRecoverySnapshot(slot = "current"): Promise<void> {
  const dir = await recoveryDir();
  const finalPath = `${dir}/${slot}.owdoc`;
  if (await exists(finalPath)) await remove(finalPath);
}

export async function notify(title: string, body: string): Promise<void> {
  await message(body, { title });
}
