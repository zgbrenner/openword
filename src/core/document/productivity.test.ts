import { describe, expect, it } from "vitest";
import type { JSONContent } from "@tiptap/core";
import { calculateDocumentStats } from "./stats";
import { replaceTextInDocument } from "./search";

const content: JSONContent = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [{ type: "text", text: "Hello world. Hello Montréal." }],
    },
    {
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: "Second section" }],
    },
  ],
};

describe("document statistics", () => {
  it("counts Unicode words and paragraphs", () => {
    const stats = calculateDocumentStats(content);

    expect(stats.words).toBe(6);
    expect(stats.paragraphs).toBe(2);
    expect(stats.readingMinutes).toBe(1);
  });

  it("returns zero counts for an empty document", () => {
    expect(calculateDocumentStats({ type: "doc" })).toEqual({
      words: 0,
      characters: 0,
      charactersWithoutSpaces: 0,
      paragraphs: 0,
      readingMinutes: 0,
    });
  });
});

describe("find and replace", () => {
  it("replaces every case-insensitive match while preserving the tree", () => {
    const result = replaceTextInDocument(content, "hello", "Hi", {
      matchCase: false,
      wholeWord: true,
    });

    expect(result.replacements).toBe(2);
    expect(result.content.content?.[0]?.content?.[0]?.text).toBe(
      "Hi world. Hi Montréal.",
    );
  });

  it("does not replace a partial whole-word match", () => {
    const result = replaceTextInDocument(
      {
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "catalog cat" }] }],
      },
      "cat",
      "dog",
      { wholeWord: true, matchCase: true },
    );

    expect(result.replacements).toBe(1);
    expect(result.content.content?.[0]?.content?.[0]?.text).toBe("catalog dog");
  });
});
