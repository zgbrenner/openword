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

  it("restores task lists and OpenWord page-break comments", () => {
    const result = importMarkdown("- [x] Complete\n- [ ] Pending\n\n<!-- pagebreak -->\n");
    const types = result.document.content.content?.map((node) => node.type);

    expect(types).toContain("taskList");
    expect(types).toContain("pageBreak");
    expect(result.document.content.content?.find((node) => node.type === "taskList")?.content?.[0]?.attrs?.checked).toBe(true);
  });

  it("round trips highlight markup as portable inline HTML", () => {
    const imported = importMarkdown("A <mark>highlighted</mark> phrase.");
    const exported = exportMarkdown(imported.document);
    const roundTrip = importMarkdown(exported.data);
    const highlighted = roundTrip.document.content.content?.[0]?.content?.find((node) =>
      node.marks?.some((mark) => mark.type === "highlight"),
    );

    expect(exported.data).toContain("<mark>highlighted</mark>");
    expect(highlighted?.text).toBe("highlighted");
  });

  it("exports portable Markdown with an explicit compatibility warning", () => {
    const imported = importMarkdown("# Title\n\n- Item\n");
    const exported = exportMarkdown(imported.document);
    expect(exported.data).toContain("# Title");
    expect(exported.data).toMatch(/-\s+Item/);
    expect(exported.warnings.join(" ")).toMatch(/layout|metadata/i);
  });
});
