import { Editor } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import { createEditorExtensions } from "./editorExtensions";

describe("OpenWord editor extensions", () => {
  it("registers each resolved extension exactly once", () => {
    const editor = new Editor({ extensions: createEditorExtensions() });
    const names = editor.extensionManager.extensions.map((extension) => extension.name);

    expect(new Set(names).size).toBe(names.length);
    editor.destroy();
  });
});
