import { describe, expect, it } from "vitest";
import { importMarkdown, exportMarkdown } from "./markdown";

describe("Markdown interchange", () => {
  it("imports headings, emphasis, lists, links, tables, quotes, and code", () => {
    const result = importMarkdown(`# Heading

A **bold** and _italic_ [link](https://example.com).

- one
- two

> quote

| A | B |
| - | - |
| 1 | 2 |

\`\`\`ts
const value = 1;
\`\`\`
`, "sample.md");
    const types = result.document.content.content?.map((node) => node.type);
    expect(types).toContain("heading");
    expect(types).toContain("paragraph");
    expect(types).toContain("bulletList");
    expect(types).toContain("blockquote");
    expect(types).toContain("table");
    expect(types).toContain("codeBlock");
  });

  it("exports portable Markdown with an explicit compatibility warning", () => {
    const imported = importMarkdown("# Title\n\n- Item\n");
    const exported = exportMarkdown(imported.document);
    expect(exported.data).toContain("# Title");
    expect(exported.data).toMatch(/-\s+Item/);
    expect(exported.warnings.join(" ")).toMatch(/layout|metadata/i);
  });
});
