import type { JSONContent } from "@tiptap/core";
import { createBlankDocument } from "../document/factory";
import type { OpenWordDocument } from "../document/model";
import { sanitizeHtml } from "../security/sanitize";
import type { ExportResult, ImportResult } from "./types";

type Mark = NonNullable<JSONContent["marks"]>[number];

function cloneMarks(marks: Mark[]): Mark[] | undefined {
  return marks.length ? marks.map((mark) => ({ ...mark, attrs: mark.attrs ? { ...mark.attrs } : undefined })) : undefined;
}

function textStyleMark(element: HTMLElement): Mark | undefined {
  const attrs: Record<string, string> = {};
  if (element.style.fontFamily) attrs.fontFamily = element.style.fontFamily;
  if (element.style.fontSize) attrs.fontSize = element.style.fontSize;
  if (element.style.color) attrs.color = element.style.color;
  if (element.style.backgroundColor) attrs.backgroundColor = element.style.backgroundColor;
  if (element.style.lineHeight) attrs.lineHeight = element.style.lineHeight;
  return Object.keys(attrs).length ? { type: "textStyle", attrs } : undefined;
}

function marksForElement(element: HTMLElement, marks: Mark[]): Mark[] {
  const next = [...marks];
  const tag = element.tagName.toLowerCase();
  if (tag === "strong" || tag === "b") next.push({ type: "bold" });
  if (tag === "em" || tag === "i") next.push({ type: "italic" });
  if (tag === "u") next.push({ type: "underline" });
  if (tag === "s" || tag === "strike" || tag === "del") next.push({ type: "strike" });
  if (tag === "code" && element.parentElement?.tagName.toLowerCase() !== "pre") next.push({ type: "code" });
  if (tag === "sup") next.push({ type: "superscript" });
  if (tag === "sub") next.push({ type: "subscript" });
  if (tag === "mark") next.push({ type: "highlight", attrs: element.style.backgroundColor ? { color: element.style.backgroundColor } : undefined });
  if (tag === "a") {
    const href = element.getAttribute("href");
    if (href) next.push({ type: "link", attrs: { href, target: element.getAttribute("target"), rel: "noreferrer noopener" } });
  }
  const commentId = element.getAttribute("data-comment-id");
  if (commentId) next.push({ type: "comment", attrs: { commentId } });
  const style = textStyleMark(element);
  if (style) next.push(style);
  return next;
}

function parseInline(node: Node, marks: Mark[] = []): JSONContent[] {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent ?? "";
    return text ? [{ type: "text", text, marks: cloneMarks(marks) }] : [];
  }
  if (!(node instanceof HTMLElement)) return [];

  const tag = node.tagName.toLowerCase();
  if (tag === "br") return [{ type: "hardBreak" }];
  if (tag === "img") {
    const src = node.getAttribute("src");
    if (!src) return [];
    const width = Number(node.getAttribute("width"));
    const height = Number(node.getAttribute("height"));
    return [{
      type: "image",
      attrs: {
        src,
        alt: node.getAttribute("alt") ?? "",
        title: node.getAttribute("title") ?? "",
        width: Number.isFinite(width) && width > 0 ? width : null,
        height: Number.isFinite(height) && height > 0 ? height : null,
      },
    }];
  }

  const nextMarks = marksForElement(node, marks);
  return [...node.childNodes].flatMap((child) => parseInline(child, nextMarks));
}

function paragraphAttrs(element: HTMLElement): Record<string, unknown> {
  const attrs: Record<string, unknown> = {};
  const align = element.style.textAlign || element.getAttribute("align");
  if (align) attrs.textAlign = align;
  if (element.classList.contains("openword-title")) attrs.paragraphStyle = "title";
  if (element.classList.contains("openword-subtitle")) attrs.paragraphStyle = "subtitle";
  return attrs;
}

function parseList(element: HTMLElement): JSONContent {
  const ordered = element.tagName.toLowerCase() === "ol";
  const items = [...element.children]
    .filter((child): child is HTMLElement => child instanceof HTMLElement && child.tagName.toLowerCase() === "li")
    .map((item) => {
      const checkbox = item.querySelector(':scope > input[type="checkbox"]') as HTMLInputElement | null;
      const blockChildren: JSONContent[] = [];
      const inlineNodes: Node[] = [];
      for (const child of [...item.childNodes]) {
        if (child instanceof HTMLElement && ["ul", "ol"].includes(child.tagName.toLowerCase())) {
          if (inlineNodes.length) {
            blockChildren.push({ type: "paragraph", content: inlineNodes.flatMap((node) => parseInline(node)) });
            inlineNodes.length = 0;
          }
          blockChildren.push(parseList(child));
        } else if (child !== checkbox) {
          inlineNodes.push(child);
        }
      }
      if (inlineNodes.length || !blockChildren.length) {
        blockChildren.unshift({ type: "paragraph", content: inlineNodes.flatMap((node) => parseInline(node)) });
      }
      return {
        type: checkbox ? "taskItem" : "listItem",
        attrs: checkbox ? { checked: checkbox.checked } : undefined,
        content: blockChildren,
      } satisfies JSONContent;
    });

  const task = items.some((item) => item.type === "taskItem");
  return {
    type: task ? "taskList" : ordered ? "orderedList" : "bulletList",
    attrs: ordered ? { start: Number(element.getAttribute("start")) || 1 } : undefined,
    content: items,
  };
}

function parseTable(element: HTMLElement): JSONContent {
  const rows = [...element.querySelectorAll(":scope > thead > tr, :scope > tbody > tr, :scope > tfoot > tr, :scope > tr")].map((row) => ({
    type: "tableRow",
    content: [...row.children]
      .filter((cell): cell is HTMLElement => cell instanceof HTMLElement && ["td", "th"].includes(cell.tagName.toLowerCase()))
      .map((cell) => {
        const blocks = parseBlocks(cell);
        return {
          type: cell.tagName.toLowerCase() === "th" ? "tableHeader" : "tableCell",
          attrs: {
            colspan: Number(cell.getAttribute("colspan")) || 1,
            rowspan: Number(cell.getAttribute("rowspan")) || 1,
            colwidth: null,
          },
          content: blocks.length ? blocks : [{ type: "paragraph" }],
        };
      }),
  } satisfies JSONContent));
  return { type: "table", content: rows };
}

function parseBlockElement(element: HTMLElement): JSONContent[] {
  const tag = element.tagName.toLowerCase();
  if (element.hasAttribute("data-openword-page-break")) return [{ type: "pageBreak" }];
  if (/^h[1-6]$/.test(tag)) {
    return [{ type: "heading", attrs: { ...paragraphAttrs(element), level: Number(tag[1]) }, content: parseInline(element) }];
  }
  if (tag === "p" || tag === "div") {
    return [{ type: "paragraph", attrs: paragraphAttrs(element), content: parseInline(element) }];
  }
  if (tag === "blockquote") {
    const content = parseBlocks(element);
    return [{ type: "blockquote", content: content.length ? content : [{ type: "paragraph", content: parseInline(element) }] }];
  }
  if (tag === "pre") {
    return [{ type: "codeBlock", content: element.textContent ? [{ type: "text", text: element.textContent }] : undefined }];
  }
  if (tag === "ul" || tag === "ol") return [parseList(element)];
  if (tag === "table") return [parseTable(element)];
  if (tag === "hr") return [{ type: "horizontalRule" }];
  if (tag === "img") return [{ type: "paragraph", content: parseInline(element) }];
  return parseBlocks(element);
}

function parseBlocks(parent: ParentNode): JSONContent[] {
  const blocks: JSONContent[] = [];
  const inlineBuffer: Node[] = [];
  const flushInline = () => {
    if (!inlineBuffer.length) return;
    const content = inlineBuffer.flatMap((node) => parseInline(node));
    if (content.length) blocks.push({ type: "paragraph", content });
    inlineBuffer.length = 0;
  };

  for (const node of [...parent.childNodes]) {
    if (node.nodeType === Node.TEXT_NODE && !(node.textContent ?? "").trim()) continue;
    if (node instanceof HTMLElement && ["p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "pre", "ul", "ol", "table", "hr"].includes(node.tagName.toLowerCase())) {
      flushInline();
      blocks.push(...parseBlockElement(node));
    } else {
      inlineBuffer.push(node);
    }
  }
  flushInline();
  return blocks;
}

export function htmlFragmentToContent(html: string): JSONContent {
  const parser = new DOMParser();
  const parsed = parser.parseFromString(`<body>${sanitizeHtml(html)}</body>`, "text/html");
  const blocks = parseBlocks(parsed.body);
  return { type: "doc", content: blocks.length ? blocks : [{ type: "paragraph" }] };
}

export function importHtml(html: string, filename = "Imported page.html"): ImportResult {
  const document = createBlankDocument(filename.replace(/\.html?$/i, "") || "Imported page");
  document.content = htmlFragmentToContent(html);
  document.source = { format: "html", importedAt: new Date().toISOString() };
  return { document, warnings: [] };
}

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character] ?? character);
}

function styleAttribute(attrs: Record<string, unknown> | undefined): string {
  if (!attrs) return "";
  const styles: string[] = [];
  if (attrs.textAlign) styles.push(`text-align:${escapeHtml(attrs.textAlign)}`);
  if (attrs.indentLevel) styles.push(`margin-left:${Number(attrs.indentLevel) * 1.5}em`);
  if (attrs.spacingBeforePt) styles.push(`margin-top:${Number(attrs.spacingBeforePt)}pt`);
  if (attrs.spacingAfterPt) styles.push(`margin-bottom:${Number(attrs.spacingAfterPt)}pt`);
  return styles.length ? ` style="${styles.join(";")}"` : "";
}

function renderMarks(text: string, marks: JSONContent["marks"]): string {
  let result = escapeHtml(text);
  for (const mark of marks ?? []) {
    if (mark.type === "bold") result = `<strong>${result}</strong>`;
    else if (mark.type === "italic") result = `<em>${result}</em>`;
    else if (mark.type === "underline") result = `<u>${result}</u>`;
    else if (mark.type === "strike") result = `<s>${result}</s>`;
    else if (mark.type === "code") result = `<code>${result}</code>`;
    else if (mark.type === "superscript") result = `<sup>${result}</sup>`;
    else if (mark.type === "subscript") result = `<sub>${result}</sub>`;
    else if (mark.type === "highlight") result = `<mark${mark.attrs?.color ? ` style="background-color:${escapeHtml(mark.attrs.color)}"` : ""}>${result}</mark>`;
    else if (mark.type === "link" && mark.attrs?.href) result = `<a href="${escapeHtml(mark.attrs.href)}" rel="noreferrer noopener">${result}</a>`;
    else if (mark.type === "comment" && mark.attrs?.commentId) result = `<span data-comment-id="${escapeHtml(mark.attrs.commentId)}">${result}</span>`;
    else if (mark.type === "textStyle") {
      const style = [
        mark.attrs?.fontFamily ? `font-family:${escapeHtml(mark.attrs.fontFamily)}` : "",
        mark.attrs?.fontSize ? `font-size:${escapeHtml(mark.attrs.fontSize)}` : "",
        mark.attrs?.color ? `color:${escapeHtml(mark.attrs.color)}` : "",
        mark.attrs?.backgroundColor ? `background-color:${escapeHtml(mark.attrs.backgroundColor)}` : "",
        mark.attrs?.lineHeight ? `line-height:${escapeHtml(mark.attrs.lineHeight)}` : "",
      ].filter(Boolean).join(";");
      if (style) result = `<span style="${style}">${result}</span>`;
    }
  }
  return result;
}

function renderInline(node: JSONContent): string {
  if (node.type === "text") return renderMarks(node.text ?? "", node.marks);
  if (node.type === "hardBreak") return "<br>";
  if (node.type === "image") {
    const width = node.attrs?.width ? ` width="${Number(node.attrs.width)}"` : "";
    const height = node.attrs?.height ? ` height="${Number(node.attrs.height)}"` : "";
    return `<img src="${escapeHtml(node.attrs?.src)}" alt="${escapeHtml(node.attrs?.alt)}" title="${escapeHtml(node.attrs?.title)}"${width}${height}>`;
  }
  return (node.content ?? []).map(renderInline).join("");
}

function renderBlock(node: JSONContent): string {
  const content = (node.content ?? []).map((child) => ["text", "hardBreak", "image"].includes(child.type ?? "") ? renderInline(child) : renderBlock(child)).join("");
  if (node.type === "paragraph") return `<p${styleAttribute(node.attrs)}>${content}</p>`;
  if (node.type === "heading") return `<h${Number(node.attrs?.level) || 1}${styleAttribute(node.attrs)}>${content}</h${Number(node.attrs?.level) || 1}>`;
  if (node.type === "blockquote") return `<blockquote>${content}</blockquote>`;
  if (node.type === "codeBlock") return `<pre><code>${escapeHtml((node.content ?? []).map((child) => child.text ?? "").join(""))}</code></pre>`;
  if (node.type === "bulletList") return `<ul>${content}</ul>`;
  if (node.type === "orderedList") return `<ol start="${Number(node.attrs?.start) || 1}">${content}</ol>`;
  if (node.type === "taskList") return `<ul class="task-list">${content}</ul>`;
  if (node.type === "listItem") return `<li>${content}</li>`;
  if (node.type === "taskItem") return `<li><input type="checkbox" disabled${node.attrs?.checked ? " checked" : ""}>${content}</li>`;
  if (node.type === "table") return `<table><tbody>${content}</tbody></table>`;
  if (node.type === "tableRow") return `<tr>${content}</tr>`;
  if (node.type === "tableHeader") return `<th colspan="${Number(node.attrs?.colspan) || 1}" rowspan="${Number(node.attrs?.rowspan) || 1}">${content}</th>`;
  if (node.type === "tableCell") return `<td colspan="${Number(node.attrs?.colspan) || 1}" rowspan="${Number(node.attrs?.rowspan) || 1}">${content}</td>`;
  if (node.type === "horizontalRule") return "<hr>";
  if (node.type === "pageBreak") return '<div data-openword-page-break="true"></div>';
  return content;
}

export function exportHtml(document: OpenWordDocument): ExportResult<string> {
  const body = (document.content.content ?? []).map(renderBlock).join("\n");
  const title = escapeHtml(document.title);
  return {
    data: `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head><body>\n${body}\n</body></html>\n`,
    warnings: ["HTML export does not preserve OpenWord comments, recovery metadata, or precise page geometry."],
  };
}
