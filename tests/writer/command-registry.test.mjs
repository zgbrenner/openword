import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";

const sourceUrl = new URL("../../public/writer-runtime/openword_writer_commands.js", import.meta.url);

function loadRegistry() {
  const context = { Object };
  runInNewContext(readFileSync(sourceUrl, "utf8"), context, { filename: sourceUrl.pathname });
  return context.OPENWORD_WRITER_COMMANDS;
}

test("maps Word-facing semantic commands to verified LibreOffice dispatch URLs", () => {
  const registry = loadRegistry();
  assert.deepEqual(
    JSON.parse(JSON.stringify(registry)),
    {
      "format.toggleBold": ".uno:Bold",
      "format.toggleItalic": ".uno:Italic",
      "format.toggleUnderline": ".uno:Underline",
      "history.undo": ".uno:Undo",
      "history.redo": ".uno:Redo",
      "paragraph.alignLeft": ".uno:LeftPara",
      "paragraph.alignCenter": ".uno:CenterPara",
      "paragraph.alignRight": ".uno:RightPara",
      "paragraph.alignJustify": ".uno:JustifyPara",
      "list.toggleBullets": ".uno:DefaultBullet",
      "list.toggleNumbering": ".uno:DefaultNumbering",
      "insert.pageBreak": ".uno:InsertPagebreak"
    },
  );
});

test("freezes the command registry so document content cannot mutate dispatch policy", () => {
  const registry = loadRegistry();
  assert.equal(Object.isFrozen(registry), true);
});
