import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const app = readFileSync(new URL("../../src/App.svelte", import.meta.url), "utf8");

test("native formatting and page-break menu actions use the same semantic Writer command bus", () => {
  assert.match(app, /async function execute\(command: WriterCommand\)/);
  const mappings = [
    ["insert_page_break", "insert.pageBreak"],
    ["format_bold", "format.toggleBold"],
    ["format_italic", "format.toggleItalic"],
    ["format_underline", "format.toggleUnderline"],
    ["format_align_left", "paragraph.alignLeft"],
    ["format_align_center", "paragraph.alignCenter"],
    ["format_align_right", "paragraph.alignRight"],
    ["format_align_justify", "paragraph.alignJustify"],
    ["format_bullet_list", "list.toggleBullets"],
    ["format_ordered_list", "list.toggleNumbering"],
  ];
  for (const [menuId, command] of mappings) {
    assert.match(
      app,
      new RegExp(`case "${menuId}": return execute\\(\\{ type: "${command.replaceAll(".", "\\.")}" \\}\\)`),
    );
  }
});

test("native Word Count action displays Writer's authoritative status label", () => {
  assert.match(app, /case "tools_word_count":/);
  assert.match(app, /writerState\.wordCountLabel/);
  assert.match(app, /title: "Word count"/);
});
