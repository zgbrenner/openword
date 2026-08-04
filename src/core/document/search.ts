import type { JSONContent } from "@tiptap/core";

export interface ReplaceOptions {
  matchCase?: boolean;
  wholeWord?: boolean;
}

export interface ReplaceResult {
  content: JSONContent;
  replacements: number;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildPattern(query: string, options: ReplaceOptions): RegExp {
  const escaped = escapeRegExp(query);
  const source = options.wholeWord ? `(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])` : escaped;
  return new RegExp(source, `gu${options.matchCase ? "" : "i"}`);
}

export function replaceTextInDocument(
  content: JSONContent,
  query: string,
  replacement: string,
  options: ReplaceOptions = {},
): ReplaceResult {
  if (!query) {
    return {
      content: JSON.parse(JSON.stringify(content)) as JSONContent,
      replacements: 0,
    };
  }

  const pattern = buildPattern(query, options);
  let replacements = 0;

  const visit = (node: JSONContent): JSONContent => {
    const next: JSONContent = { ...node };

    if (typeof node.text === "string") {
      next.text = node.text.replace(pattern, () => {
        replacements += 1;
        return replacement;
      });
    }

    if (node.content) {
      next.content = node.content.map(visit);
    }

    if (node.marks) {
      next.marks = node.marks.map((mark) => ({ ...mark, attrs: mark.attrs ? { ...mark.attrs } : undefined }));
    }

    if (node.attrs) {
      next.attrs = { ...node.attrs };
    }

    return next;
  };

  return {
    content: visit(content),
    replacements,
  };
}
