import type { FileFormat, OpenWordDocument } from "../document/model";
import type { PickedDocumentFile } from "../platform/files";
import { exportDocx } from "./docx/exportDocx";
import { importDocx } from "./docx/importDocx";
import { exportHtml, importHtml } from "./html";
import { exportMarkdown, importMarkdown } from "./markdown";
import { exportOpenWord, importOpenWord } from "./openword";
import { exportText, importText } from "./text";
import type { ExportResult, ImportResult } from "./types";

const decoder = new TextDecoder("utf-8", { fatal: false });
const encoder = new TextEncoder();

export async function importPickedFile(file: PickedDocumentFile): Promise<ImportResult> {
  let result: ImportResult;
  if (file.format === "openword") result = importOpenWord(file.bytes, file.name);
  else if (file.format === "docx") result = await importDocx(file.bytes, file.name);
  else if (file.format === "markdown") result = importMarkdown(decoder.decode(file.bytes), file.name);
  else if (file.format === "html") result = importHtml(decoder.decode(file.bytes), file.name);
  else result = importText(decoder.decode(file.bytes), file.name);

  result.document.source = {
    format: file.format,
    path: file.path,
    importedAt: new Date().toISOString(),
  };
  return result;
}

export async function exportDocument(
  document: OpenWordDocument,
  format: Exclude<FileFormat, "pdf">,
): Promise<ExportResult<Uint8Array>> {
  if (format === "openword") return exportOpenWord(document);
  if (format === "docx") return exportDocx(document);
  const result = format === "markdown"
    ? exportMarkdown(document)
    : format === "html"
      ? exportHtml(document)
      : exportText(document);
  return { data: encoder.encode(result.data), warnings: result.warnings };
}

export type { ExportResult, ImportResult } from "./types";
