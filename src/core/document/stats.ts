import type { JSONContent } from "@tiptap/core";

export interface DocumentStats {
  words: number;
  characters: number;
  charactersWithoutSpaces: number;
  paragraphs: number;
  readingMinutes: number;
}

const WORD_PATTERN = /[\p{L}\p{N}]+(?:['’.-][\p{L}\p{N}]+)*/gu;
const PARAGRAPH_TYPES = new Set(["paragraph", "heading"]);

export function extractPlainText(content: JSONContent): string {
  const parts: string[] = [];

  const visit = (node: JSONContent): void => {
    if (typeof node.text === "string") {
      parts.push(node.text);
    }

    if (node.content) {
      for (const child of node.content) {
        visit(child);
      }
    }

    if (PARAGRAPH_TYPES.has(node.type ?? "")) {
      parts.push("\n");
    }
  };

  visit(content);
  return parts.join("").replace(/\n{3,}/g, "\n\n").trim();
}

export function calculateDocumentStats(content: JSONContent): DocumentStats {
  let paragraphs = 0;

  const countParagraphs = (node: JSONContent): void => {
    if (PARAGRAPH_TYPES.has(node.type ?? "")) {
      paragraphs += 1;
    }
    node.content?.forEach(countParagraphs);
  };

  countParagraphs(content);
  const text = extractPlainText(content);
  const words = text.match(WORD_PATTERN)?.length ?? 0;
  const characters = text.length;
  const charactersWithoutSpaces = text.replace(/\s/gu, "").length;

  return {
    words,
    characters,
    charactersWithoutSpaces,
    paragraphs,
    readingMinutes: words === 0 ? 0 : Math.max(1, Math.ceil(words / 225)),
  };
}
