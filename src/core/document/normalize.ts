import type { JSONContent } from "@tiptap/core";

export interface NormalizedContentResult {
  content: JSONContent;
  warnings: string[];
}

type MarkJson = NonNullable<JSONContent["marks"]>[number];

const SAFE_LINK = /^(?:https?:|mailto:|tel:|#)/i;
const SAFE_IMAGE = /^data:image\/(?:png|jpe?g|gif|webp|bmp);base64,/i;
const SIMPLE_MARKS = new Set([
  "bold",
  "italic",
  "underline",
  "strike",
  "code",
  "superscript",
  "subscript",
]);
const PARAGRAPH_STYLES = new Set(["normal", "title", "subtitle", "quote", "compact"]);
const ALIGNMENTS = new Set(["left", "center", "right", "justify"]);

function finiteNumber(value: unknown, minimum: number, maximum: number): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.min(maximum, Math.max(minimum, value));
}

function safeString(value: unknown, maximumLength = 500): string | undefined {
  if (typeof value !== "string") return undefined;
  return value.slice(0, maximumLength);
}

function safeCssValue(value: unknown, maximumLength = 120): string | undefined {
  const string = safeString(value, maximumLength)?.trim();
  if (!string || /[;{}<>]|url\s*\(|expression\s*\(|javascript:/i.test(string)) return undefined;
  return string;
}

function safeColor(value: unknown): string | undefined {
  const color = safeCssValue(value, 64);
  if (!color) return undefined;
  if (/^#[0-9a-f]{3,8}$/i.test(color)) return color;
  if (/^(?:rgb|rgba|hsl|hsla)\([\d\s.,%+-]+\)$/i.test(color)) return color;
  if (/^[a-z]{1,24}$/i.test(color)) return color;
  return undefined;
}

function safeFontSize(value: unknown): string | undefined {
  const size = safeCssValue(value, 24);
  if (!size) return undefined;
  const match = size.match(/^(\d+(?:\.\d+)?)(pt|px|em|rem|%)$/i);
  if (!match) return undefined;
  const numeric = Number(match[1]);
  if (!Number.isFinite(numeric) || numeric <= 0 || numeric > 500) return undefined;
  return `${numeric}${match[2]!.toLowerCase()}`;
}

function safeLineHeight(value: unknown): string | undefined {
  const lineHeight = safeCssValue(value, 24);
  if (!lineHeight) return undefined;
  const match = lineHeight.match(/^(\d+(?:\.\d+)?)(px|pt|em|rem|%)?$/i);
  if (!match) return undefined;
  const numeric = Number(match[1]);
  if (!Number.isFinite(numeric) || numeric < 0.5 || numeric > 500) return undefined;
  return `${numeric}${match[2]?.toLowerCase() ?? ""}`;
}

function normalizeMarks(
  marks: JSONContent["marks"],
  warnings: Set<string>,
): MarkJson[] | undefined {
  const normalized: MarkJson[] = [];

  for (const mark of marks ?? []) {
    if (!mark || typeof mark.type !== "string") continue;

    if (SIMPLE_MARKS.has(mark.type)) {
      normalized.push({ type: mark.type });
      continue;
    }

    if (mark.type === "link") {
      const href = safeString(mark.attrs?.href, 2048)?.trim();
      if (!href || !SAFE_LINK.test(href)) {
        warnings.add("An unsafe or unsupported hyperlink was removed from the native document.");
        continue;
      }
      normalized.push({
        type: "link",
        attrs: {
          href,
          target: mark.attrs?.target === "_blank" ? "_blank" : null,
          rel: "noreferrer noopener",
        },
      });
      continue;
    }

    if (mark.type === "highlight") {
      const color = safeColor(mark.attrs?.color);
      normalized.push({
        type: "highlight",
        attrs: color ? { color } : undefined,
      });
      if (mark.attrs?.color && !color) {
        warnings.add("An invalid highlight color was removed from the native document.");
      }
      continue;
    }

    if (mark.type === "textStyle") {
      const attrs: Record<string, string> = {};
      const fontFamily = safeCssValue(mark.attrs?.fontFamily);
      const fontSize = safeFontSize(mark.attrs?.fontSize);
      const color = safeColor(mark.attrs?.color);
      const backgroundColor = safeColor(mark.attrs?.backgroundColor);
      const lineHeight = safeLineHeight(mark.attrs?.lineHeight);
      if (fontFamily) attrs.fontFamily = fontFamily;
      if (fontSize) attrs.fontSize = fontSize;
      if (color) attrs.color = color;
      if (backgroundColor) attrs.backgroundColor = backgroundColor;
      if (lineHeight) attrs.lineHeight = lineHeight;
      if (Object.keys(attrs).length) normalized.push({ type: "textStyle", attrs });

      const supplied = mark.attrs && Object.values(mark.attrs).some((value) => value != null && value !== "");
      if (supplied && !Object.keys(attrs).length) {
        warnings.add("Invalid text-style values were removed from the native document.");
      }
      continue;
    }

    if (mark.type === "comment") {
      const commentId = safeString(mark.attrs?.commentId, 128);
      if (commentId && /^[\w.-]+$/u.test(commentId)) {
        normalized.push({ type: "comment", attrs: { commentId } });
      } else {
        warnings.add("An invalid comment anchor was removed from the native document.");
      }
      continue;
    }

    warnings.add(`Unsupported native formatting mark “${mark.type}” was removed.`);
  }

  return normalized.length ? normalized : undefined;
}

function normalizeInline(nodes: JSONContent[] | undefined, warnings: Set<string>): JSONContent[] | undefined {
  const output: JSONContent[] = [];

  for (const node of nodes ?? []) {
    if (!node || typeof node.type !== "string") continue;

    if (node.type === "text") {
      if (typeof node.text !== "string" || !node.text) continue;
      output.push({
        type: "text",
        text: node.text,
        marks: normalizeMarks(node.marks, warnings),
      });
      continue;
    }

    if (node.type === "hardBreak") {
      output.push({ type: "hardBreak" });
      continue;
    }

    if (node.type === "image") {
      const source = safeString(node.attrs?.src, 30_000_000)?.trim();
      if (!source || !SAFE_IMAGE.test(source)) {
        warnings.add("A non-local or unsupported image was removed from the native document.");
        const alt = safeString(node.attrs?.alt, 500);
        if (alt) output.push({ type: "text", text: `[${alt}]` });
        continue;
      }
      output.push({
        type: "image",
        attrs: {
          src: source,
          alt: safeString(node.attrs?.alt, 500) ?? "",
          title: safeString(node.attrs?.title, 500) ?? "",
          width: finiteNumber(node.attrs?.width, 24, 4000),
          height: finiteNumber(node.attrs?.height, 24, 4000),
        },
      });
      continue;
    }

    const nested = normalizeInline(node.content, warnings);
    if (nested?.length) output.push(...nested);
    warnings.add(`Unsupported inline node “${node.type}” was simplified.`);
  }

  return output.length ? output : undefined;
}

function paragraphAttrs(node: JSONContent, heading: boolean): Record<string, unknown> {
  const attrs: Record<string, unknown> = {};
  const align = safeString(node.attrs?.textAlign, 16);
  if (align && ALIGNMENTS.has(align)) attrs.textAlign = align;

  const indentLevel = finiteNumber(node.attrs?.indentLevel, 0, 20);
  if (indentLevel !== undefined) attrs.indentLevel = Math.round(indentLevel);

  const spacingBeforePt = finiteNumber(node.attrs?.spacingBeforePt, 0, 720);
  const spacingAfterPt = finiteNumber(node.attrs?.spacingAfterPt, 0, 720);
  if (spacingBeforePt !== undefined) attrs.spacingBeforePt = spacingBeforePt;
  if (spacingAfterPt !== undefined) attrs.spacingAfterPt = spacingAfterPt;

  if (heading) {
    attrs.level = Math.round(finiteNumber(node.attrs?.level, 1, 6) ?? 1);
  } else {
    const style = safeString(node.attrs?.paragraphStyle, 24);
    if (style && PARAGRAPH_STYLES.has(style)) attrs.paragraphStyle = style;
  }

  return attrs;
}

function normalizeListItem(node: JSONContent, task: boolean, warnings: Set<string>): JSONContent {
  const content = normalizeBlocks(node.content, warnings);
  return {
    type: task ? "taskItem" : "listItem",
    attrs: task ? { checked: Boolean(node.attrs?.checked) } : undefined,
    content: content.length ? content : [{ type: "paragraph" }],
  };
}

function normalizeTable(node: JSONContent, warnings: Set<string>): JSONContent | null {
  const rows = (node.content ?? []).flatMap((row) => {
    if (row.type !== "tableRow") {
      warnings.add("Invalid table content was removed from the native document.");
      return [];
    }

    const cells = (row.content ?? []).flatMap((cell) => {
      if (cell.type !== "tableCell" && cell.type !== "tableHeader") {
        warnings.add("Invalid table-cell content was removed from the native document.");
        return [];
      }
      const content = normalizeBlocks(cell.content, warnings);
      return [{
        type: cell.type,
        attrs: {
          colspan: Math.round(finiteNumber(cell.attrs?.colspan, 1, 64) ?? 1),
          rowspan: Math.round(finiteNumber(cell.attrs?.rowspan, 1, 10_000) ?? 1),
          colwidth: Array.isArray(cell.attrs?.colwidth)
            ? cell.attrs.colwidth
                .map((value) => finiteNumber(value, 10, 5000))
                .filter((value): value is number => value !== undefined)
            : null,
        },
        content: content.length ? content : [{ type: "paragraph" }],
      } satisfies JSONContent];
    });

    return cells.length ? [{ type: "tableRow", content: cells } satisfies JSONContent] : [];
  });

  if (!rows.length) {
    warnings.add("An empty or invalid table was removed from the native document.");
    return null;
  }
  return { type: "table", content: rows };
}

function textFromUnknown(node: JSONContent): string {
  if (typeof node.text === "string") return node.text;
  return (node.content ?? []).map(textFromUnknown).join("");
}

function normalizeBlocks(nodes: JSONContent[] | undefined, warnings: Set<string>): JSONContent[] {
  const output: JSONContent[] = [];

  for (const node of nodes ?? []) {
    if (!node || typeof node.type !== "string") continue;

    if (node.type === "paragraph" || node.type === "heading") {
      output.push({
        type: node.type,
        attrs: paragraphAttrs(node, node.type === "heading"),
        content: normalizeInline(node.content, warnings),
      });
      continue;
    }

    if (node.type === "blockquote") {
      const content = normalizeBlocks(node.content, warnings);
      output.push({ type: "blockquote", content: content.length ? content : [{ type: "paragraph" }] });
      continue;
    }

    if (node.type === "codeBlock") {
      const text = textFromUnknown(node);
      output.push({
        type: "codeBlock",
        attrs: { language: safeString(node.attrs?.language, 64) ?? null },
        content: text ? [{ type: "text", text }] : undefined,
      });
      continue;
    }

    if (node.type === "bulletList" || node.type === "orderedList" || node.type === "taskList") {
      const task = node.type === "taskList";
      const content = (node.content ?? []).map((item) => normalizeListItem(item, task, warnings));
      output.push({
        type: node.type,
        attrs: node.type === "orderedList"
          ? { start: Math.round(finiteNumber(node.attrs?.start, 1, 1_000_000) ?? 1) }
          : undefined,
        content: content.length ? content : [normalizeListItem({ type: task ? "taskItem" : "listItem" }, task, warnings)],
      });
      continue;
    }

    if (node.type === "table") {
      const table = normalizeTable(node, warnings);
      if (table) output.push(table);
      continue;
    }

    if (node.type === "horizontalRule" || node.type === "pageBreak") {
      output.push({ type: node.type });
      continue;
    }

    if (node.type === "text" || node.type === "hardBreak" || node.type === "image") {
      const inline = normalizeInline([node], warnings);
      if (inline?.length) output.push({ type: "paragraph", content: inline });
      continue;
    }

    const nestedBlocks = normalizeBlocks(node.content, warnings);
    if (nestedBlocks.length) {
      output.push(...nestedBlocks);
    } else {
      const text = textFromUnknown(node);
      if (text) output.push({ type: "paragraph", content: [{ type: "text", text }] });
    }
    warnings.add(`Unsupported native node “${node.type}” was simplified.`);
  }

  return output;
}

export function normalizeDocumentContent(input: JSONContent): NormalizedContentResult {
  const warnings = new Set<string>();
  const content = input.type === "doc"
    ? normalizeBlocks(input.content, warnings)
    : normalizeBlocks([input], warnings);

  if (input.type !== "doc") {
    warnings.add("The native document root was repaired.");
  }

  return {
    content: {
      type: "doc",
      content: content.length ? content : [{ type: "paragraph" }],
    },
    warnings: [...warnings],
  };
}
