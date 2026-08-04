import type { FileDescriptor, FileFormat } from "../document/model";
import { isTauriRuntime } from "./tauri";

export type ImportableFormat = Exclude<FileFormat, "pdf">;

export interface PickedDocumentFile {
  name: string;
  path?: string;
  format: ImportableFormat;
  bytes: Uint8Array;
}

export interface SaveBytesOptions {
  bytes: Uint8Array;
  suggestedName: string;
  format: ImportableFormat;
  existingPath?: string;
}

const EXTENSIONS: Record<ImportableFormat, string> = {
  openword: "openword",
  docx: "docx",
  markdown: "md",
  html: "html",
  text: "txt",
};

function fileName(path: string): string {
  return path.split(/[\\/]/).pop() || "document";
}

function formatFromName(name: string): ImportableFormat {
  const extension = name.split(".").pop()?.toLowerCase();
  if (extension === "openword") return "openword";
  if (extension === "docx") return "docx";
  if (extension === "md" || extension === "markdown") return "markdown";
  if (extension === "html" || extension === "htm") return "html";
  if (extension === "txt" || extension === "text") return "text";
  throw new Error(`OpenWord does not support the .${extension ?? "unknown"} file type.`);
}

function suggestedFilename(name: string, format: ImportableFormat): string {
  const extension = EXTENSIONS[format];
  const stem = name.replace(/\.(?:openword|docx|md|markdown|html?|txt|text)$/i, "") || "Untitled document";
  return `${stem}.${extension}`;
}

async function browserPick(): Promise<PickedDocumentFile | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".openword,.docx,.md,.markdown,.html,.htm,.txt,.text";
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      void file.arrayBuffer().then((buffer) => resolve({
        name: file.name,
        format: formatFromName(file.name),
        bytes: new Uint8Array(buffer),
      })).catch(() => resolve(null));
    }, { once: true });
    input.click();
  });
}

export async function pickDocumentFile(): Promise<PickedDocumentFile | null> {
  if (!isTauriRuntime()) return browserPick();
  const [{ open }, { readFile }] = await Promise.all([
    import("@tauri-apps/plugin-dialog"),
    import("@tauri-apps/plugin-fs"),
  ]);
  const selected = await open({
    multiple: false,
    directory: false,
    filters: [{
      name: "Documents",
      extensions: ["openword", "docx", "md", "markdown", "html", "htm", "txt", "text"],
    }],
  });
  if (!selected || Array.isArray(selected)) return null;
  return {
    name: fileName(selected),
    path: selected,
    format: formatFromName(selected),
    bytes: await readFile(selected),
  };
}

export async function readDocumentPath(path: string): Promise<PickedDocumentFile> {
  if (!isTauriRuntime()) throw new Error("Reopening a desktop path is only available in the Tauri app.");
  const { readFile } = await import("@tauri-apps/plugin-fs");
  return {
    name: fileName(path),
    path,
    format: formatFromName(path),
    bytes: await readFile(path),
  };
}

function exactArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export async function saveBytes(options: SaveBytesOptions): Promise<FileDescriptor | null> {
  const name = suggestedFilename(options.suggestedName, options.format);
  if (!isTauriRuntime()) {
    const url = URL.createObjectURL(new Blob([exactArrayBuffer(options.bytes)], { type: "application/octet-stream" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    return { name, format: options.format };
  }

  const [{ save }, { writeFile }] = await Promise.all([
    import("@tauri-apps/plugin-dialog"),
    import("@tauri-apps/plugin-fs"),
  ]);
  const path = options.existingPath ?? await save({
    defaultPath: name,
    filters: [{ name: `${options.format.toUpperCase()} document`, extensions: [EXTENSIONS[options.format]] }],
  });
  if (!path) return null;
  await writeFile(path, options.bytes);
  return { name: fileName(path), path, format: options.format };
}

export async function revealFile(path: string): Promise<void> {
  if (!isTauriRuntime()) throw new Error("Show in folder is only available in the desktop app.");
  const { revealItemInDir } = await import("@tauri-apps/plugin-opener");
  await revealItemInDir(path);
}
