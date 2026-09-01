import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

test("Home ribbon exposes extended character formatting commands with pressed state", () => {
  const ribbon = read("src/components/WriterHomeBar.svelte");
  for (const command of [
    "format.toggleStrikethrough",
    "format.toggleSubscript",
    "format.toggleSuperscript",
    "format.clearFormatting",
  ]) {
    assert.match(ribbon, new RegExp(command.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(ribbon, /aria-pressed=\{state\.strikethrough\}/);
  assert.match(ribbon, /aria-pressed=\{state\.subscript\}/);
  assert.match(ribbon, /aria-pressed=\{state\.superscript\}/);
});

test("Home ribbon exposes a Styles gallery dispatching every quick style", () => {
  const ribbon = read("src/components/WriterHomeBar.svelte");
  assert.match(ribbon, /aria-label="Styles"/);
  assert.match(ribbon, /<span>Styles<\/span>/);
  assert.match(ribbon, /paragraph\.applyStyle/);
  for (const style of ["normal", "heading1", "heading2", "heading3", "title", "quote"]) {
    assert.match(ribbon, new RegExp(`style:\\s*"${style}"`));
  }
});

test("Styles gallery marks the active chip from the raw Writer style name", () => {
  const ribbon = read("src/components/WriterHomeBar.svelte");
  assert.match(ribbon, /writerNames\.includes\(state\.paragraphStyleName\)/);
  assert.match(ribbon, /"Standard", "Default Paragraph Style"/);
  assert.match(ribbon, /"Heading 1"/);
  assert.match(ribbon, /"Heading 2"/);
  assert.match(ribbon, /"Heading 3"/);
  assert.match(ribbon, /"Title"/);
  assert.match(ribbon, /"Quotations"/);
});

test("Home ribbon exposes an Editing group that opens find and replace", () => {
  const ribbon = read("src/components/WriterHomeBar.svelte");
  assert.match(ribbon, /export let onfindreplace: \(\) => void = \(\) => \{\};/);
  assert.match(ribbon, /aria-label="Editing"/);
  assert.match(ribbon, /<span>Editing<\/span>/);
  assert.match(ribbon, /aria-label="Find and replace"/);
  assert.match(ribbon, /onfindreplace\(\)/);
});

test("UNO worker publishes extended formatting status for the new toggles", () => {
  const worker = read("public/writer-runtime/openword_writer_thread.js");
  assert.match(worker, /addFormattingStatus\("Strikeout", "strikethrough"\)/);
  assert.match(worker, /addFormattingStatus\("SubScript", "subscript"\)/);
  assert.match(worker, /addFormattingStatus\("SuperScript", "superscript"\)/);
});

test("UNO worker maps quick styles onto verified Writer paragraph styles", () => {
  const worker = read("public/writer-runtime/openword_writer_thread.js");
  assert.match(worker, /PARAGRAPH_QUICK_STYLES = Object\.freeze\(/);
  assert.match(worker, /PARAGRAPH_QUICK_STYLES\[style\]/);
  assert.match(worker, /normal: "Standard"/);
  assert.match(worker, /heading1: "Heading 1"/);
  assert.match(worker, /heading2: "Heading 2"/);
  assert.match(worker, /heading3: "Heading 3"/);
  assert.match(worker, /title: "Title"/);
  assert.match(worker, /quote: "Quotations"/);
});
