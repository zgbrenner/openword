import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

function registryKeys() {
  const context = { Object };
  runInNewContext(read("public/writer-runtime/openword_writer_commands.js"), context);
  return Object.keys(context.OPENWORD_WRITER_COMMANDS);
}

test("TypeScript command protocol covers every dispatch-policy command", () => {
  const protocol = read("src/writer/protocol.ts");
  for (const command of registryKeys()) {
    assert.match(protocol, new RegExp(`type:\\s*"${command.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
  }
});

test("ribbon exposes verified paragraph, list, and page-break commands", () => {
  const ribbon = read("src/components/WriterHomeBar.svelte");
  for (const command of [
    "paragraph.alignLeft",
    "paragraph.alignCenter",
    "paragraph.alignRight",
    "paragraph.alignJustify",
    "list.toggleBullets",
    "list.toggleNumbering",
    "insert.pageBreak",
  ]) {
    assert.match(ribbon, new RegExp(command.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(ribbon, /aria-label="Paragraph"/);
  assert.match(ribbon, /id="ow-ribbon-tab-insert"/);
  assert.match(ribbon, /aria-controls="ow-ribbon-panel-insert"/);
});

test("UNO worker publishes paragraph selection state for active controls", () => {
  const worker = read("public/writer-runtime/openword_writer_thread.js");
  assert.match(worker, /selection\.paragraph/);
  assert.match(worker, /addParagraphStatus\("LeftPara", "left"\)/);
  assert.match(worker, /addParagraphStatus\("CenterPara", "center"\)/);
  assert.match(worker, /addParagraphStatus\("RightPara", "right"\)/);
  assert.match(worker, /addParagraphStatus\("JustifyPara", "justify"\)/);
  assert.match(worker, /addListStatus\("DefaultBullet", "bullets"\)/);
  assert.match(worker, /addListStatus\("DefaultNumbering", "numbering"\)/);
});
