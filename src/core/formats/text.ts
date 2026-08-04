import type { JSONContent } from "@tiptap/core";
import { createBlankDocument } from "../document/factory";
import type { OpenWordDocument } from "../document/model";
import type { ExportResult, ImportResult } from "./types";

function textNode(text: string): JSONContent[] | undefined {
  return text ? [{ type: "text", text }] : undefined;
}

export function importText(text: string, filename = "Imported text.txt"): ImportResult {
  const document = createBlankDocument(filename.replace(/\.txt$/i, "") || "Imported text");
  const normalized = text.replace(/\r\n?/g, "\n");
  document.content = {
    type: "doc",
    content: normalized.split(/\n{2,}/).map((paragraph) => ({
      type: "paragraph",
      content: textNode(paragraph.replace(/\n/g, " ")),
    })),
  };
  document.source = { format: "text", importedAt: new Date().toISOString() };
  return { document, warnings: [] };
}

function plainText(node: JSONContent): string {
  if (typeof node.text === "string") return node.text;
  if (node.type === "hardBreak") return "\n";
  if (node.type === "image") return node.attrs?.alt ? `[${String(node.attrs.alt)}]` : "[Image]";
  const content = (node.content ?? []).map(plainText).join("");
  if (["paragraph", "heading", "blockquote", "codeBlock", "listItem", "taskItem"].includes(node.type ?? "")) return `${content}\n`;
  if (node.type === "pageBreak") return "\n\f\n";
  if (node.type === "horizontalRule") return "\n---\n";
  if (["bulletList", "orderedList", "taskList", "table", "tableRow"].includes(node.type ?? "")) return `${content}\n`;
  if (node.type === "tableCell" || node.type === "tableHeader") return `${content}\t`;
  return content;
}

export function exportText(document: OpenWordDocument): ExportResult<string> {
  return {
    data: plainText(document.content).replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trimEnd(),
    warnings: ["Plain text does not preserve formatting, images, comments, tables, headers, footers, or page layout."],
  };
}
