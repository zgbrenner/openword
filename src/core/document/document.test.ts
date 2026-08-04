import { describe, expect, it } from "vitest";
import { createBlankDocument } from "./factory";
import { migrateDocument } from "./migrations";
import { BUILT_IN_TEMPLATES, createDocumentFromTemplate } from "./templates";

describe("native document model", () => {
  it("creates a complete blank document", () => {
    const document = createBlankDocument("Draft");

    expect(document.schemaVersion).toBe(1);
    expect(document.title).toBe("Draft");
    expect(document.content.type).toBe("doc");
    expect(document.content.content?.[0]?.type).toBe("paragraph");
    expect(document.page.size).toBe("letter");
    expect(document.settings.defaultFontFamily).toBeTruthy();
  });

  it("creates independent identifiers", () => {
    const first = createBlankDocument();
    const second = createBlankDocument();

    expect(first.id).not.toBe(second.id);
  });

  it("migrates an unversioned document without dropping content", () => {
    const migrated = migrateDocument({
      title: "Legacy",
      content: {
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "Preserved" }] }],
      },
    });

    expect(migrated.schemaVersion).toBe(1);
    expect(migrated.title).toBe("Legacy");
    expect(migrated.content.content?.[0]?.content?.[0]?.text).toBe("Preserved");
  });

  it("sanitizes unsafe native document content and reports simplification", () => {
    const migrated = migrateDocument({
      schemaVersion: 1,
      title: "Untrusted native file",
      content: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "Unsafe link",
                marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }],
              },
              { type: "image", attrs: { src: "https://tracker.example/pixel.png" } },
            ],
          },
          { type: "future-widget", content: [{ type: "text", text: "Preserve the words" }] },
        ],
      },
    });

    expect(JSON.stringify(migrated.content)).not.toContain("javascript:");
    expect(JSON.stringify(migrated.content)).not.toContain("tracker.example");
    expect(JSON.stringify(migrated.content)).toContain("Preserve the words");
    expect(migrated.compatibilityWarnings.some((warning) => warning.code === "native-content-simplified")).toBe(true);
  });

  it("does not duplicate native simplification warnings across migrations", () => {
    const first = migrateDocument({
      schemaVersion: 1,
      title: "Repeated migration",
      compatibilityWarnings: [
        {
          id: "warning-existing",
          code: "native-content-simplified",
          message: "An unsafe or unsupported hyperlink was removed from the native document.",
          severity: "warning",
        },
      ],
      content: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "Unsafe",
                marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }],
              },
            ],
          },
        ],
      },
    });

    const warnings = first.compatibilityWarnings.filter(
      (warning) => warning.code === "native-content-simplified",
    );

    expect(warnings).toHaveLength(1);
  });

  it("instantiates every built-in template", () => {
    for (const template of BUILT_IN_TEMPLATES) {
      const document = createDocumentFromTemplate(template.id);
      expect(document.content.type).toBe("doc");
      expect(document.title.length).toBeGreaterThan(0);
    }
  });
});
