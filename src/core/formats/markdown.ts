import { marked } from "marked";
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";
import type { OpenWordDocument } from "../document/model";
import { exportHtml, importHtml } from "./html";
import type { ExportResult, ImportResult } from "./types";

export function importMarkdown(markdown: string, filename = "Imported document.md"): ImportResult {
  const withPageBreaks = markdown.replace(
    /<!--\s*(?:openword-)?pagebreak\s*-->/gi,
    '<div data-openword-page-break="true"></div>',
  );
  const html = marked.parse(withPageBreaks, { gfm: true, breaks: false, async: false }) as string;
  const result = importHtml(html, filename.replace(/\.md$/i, ".html"));
  result.document.title = filename.replace(/\.md$/i, "") || "Imported document";
  result.document.source = { format: "markdown", importedAt: new Date().toISOString() };
  return result;
}

export function exportMarkdown(document: OpenWordDocument): ExportResult<string> {
  const html = exportHtml(document).data;
  const service = new TurndownService({
    headingStyle: "atx",
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    emDelimiter: "_",
    strongDelimiter: "**",
  });
  service.use(gfm);
  service.addRule("openword-page-break", {
    filter: (node) => node instanceof HTMLElement && node.hasAttribute("data-openword-page-break"),
    replacement: () => "\n\n<!-- pagebreak -->\n\n",
  });
  service.addRule("underline", {
    filter: ["u"],
    replacement: (content) => `<u>${content}</u>`,
  });
  service.addRule("highlight", {
    filter: ["mark"],
    replacement: (content) => `==${content}==`,
  });
  service.addRule("comment-anchor", {
    filter: (node) => node instanceof HTMLElement && node.hasAttribute("data-comment-id"),
    replacement: (content) => content,
  });

  return {
    data: `${service.turndown(html).trim()}\n`,
    warnings: ["Markdown does not preserve precise page layout, headers, footers, images embedded as binary data, or review metadata."],
  };
}
