import { describe, expect, it } from "vitest";
import { createBlankDocument } from "../document/factory";
import { exportHtml, importHtml } from "./html";
import { exportOpenWord, importOpenWord } from "./openword";
import { exportText, importText } from "./text";

const decoder = new TextDecoder();

describe("native OpenWord format", () => {
  it("round trips the versioned document model", () => {
    const document = createBlankDocument("Round trip");
    document.content = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Hello" }] }],
    };

    const exported = exportOpenWord(document);
    const imported = importOpenWord(exported.data, "round-trip.openword");

    expect(imported.document.title).toBe("Round trip");
    expect(imported.document.content.content?.[0]?.content?.[0]?.text).toBe("Hello");
    expect(imported.document.schemaVersion).toBe(1);
  });

  it("rejects invalid JSON with the source filename", () => {
    expect(() => importOpenWord(new TextEncoder().encode("not-json"), "broken.openword"))
      .toThrow(/broken\.openword/);
  });
});

describe("HTML format", () => {
  it("removes scripts, unsafe links, and remote images", () => {
    const result = importHtml(`
      <script>alert(1)</script>
      <p><a href="javascript:alert(1)">Unsafe</a></p>
      <img src="https://example.com/tracker.png" alt="Tracker">
      <p><strong>Safe</strong></p>
    `, "unsafe.html");
    const exported = exportHtml(result.document).data;

    expect(exported).not.toContain("<script");
    expect(exported).not.toContain("javascript:");
    expect(exported).not.toContain("tracker.png");
    expect(exported).toContain("Tracker");
    expect(exported).toContain("<strong>Safe</strong>");
  });

  it("preserves common semantic structures", () => {
    const imported = importHtml("<h2>Heading</h2><p>Hello <em>world</em>.</p><hr>");
    expect(imported.document.content.content?.map((node) => node.type)).toEqual([
      "heading",
      "paragraph",
      "horizontalRule",
    ]);
  });
});

describe("plain text format", () => {
  it("turns blank-line-separated text into paragraphs", () => {
    const imported = importText("First line\ncontinued\n\nSecond paragraph", "notes.txt");
    expect(imported.document.content.content).toHaveLength(2);
    expect(imported.document.content.content?.[0]?.content?.[0]?.text).toBe("First line continued");
  });

  it("exports readable text and reports loss", () => {
    const document = createBlankDocument("Text");
    document.content = {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Title" }] },
        { type: "paragraph", content: [{ type: "text", text: "Body" }] },
      ],
    };
    const result = exportText(document);
    expect(result.data).toBe("Title\nBody");
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(decoder.decode(exportOpenWord(document).data)).toContain('"title": "Text"');
  });
});
