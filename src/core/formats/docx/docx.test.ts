import { describe, expect, it } from "vitest";
import { createBlankDocument } from "../../document/factory";
import { exportDocx } from "./exportDocx";
import { importDocx } from "./importDocx";

describe("DOCX interchange", () => {
  it("exports a valid OOXML ZIP and imports its semantic content", async () => {
    const document = createBlankDocument("DOCX round trip");
    document.content = {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Heading" }] },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Bold text", marks: [{ type: "bold" }] }],
        },
      ],
    };

    const exported = await exportDocx(document);
    expect(exported.data[0]).toBe(0x50);
    expect(exported.data[1]).toBe(0x4b);

    const imported = await importDocx(exported.data, "Round trip.docx");
    expect(JSON.stringify(imported.document.content)).toContain("Heading");
    expect(JSON.stringify(imported.document.content)).toContain("Bold text");
  });
});
