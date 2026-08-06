import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

test("protocol exposes a semantic page-number field command", () => {
  assert.match(read("src/writer/protocol.ts"), /type:\s*"field\.insertPageNumber"/);
});

test("UNO worker inserts the current Arabic page number at the active Writer text cursor", () => {
  const worker = read("public/writer-runtime/openword_writer_thread.js");
  assert.match(worker, /function insertPageNumberField\(\)/);
  assert.match(worker, /controller\.getViewCursor\(\)/);
  assert.match(worker, /model\.createInstance\("com\.sun\.star\.text\.TextField\.PageNumber"\)/);
  assert.match(worker, /setPropertyValue\("SubType", 1\)/);
  assert.match(worker, /setPropertyValue\("NumberingType", 4\)/);
  assert.match(worker, /text\.insertTextContent\(viewCursor, field, false\)/);
  assert.match(worker, /type === "field\.insertPageNumber"/);
});

test("Insert ribbon exposes a page-number control beside header and footer tools", () => {
  const ribbon = read("src/components/WriterHomeBar.svelte");
  assert.match(ribbon, /aria-label="Page number"/);
  assert.match(ribbon, /type:\s*"field\.insertPageNumber"/);
  assert.match(ribbon, /<WriterGlyph name="pageNumber"/);
});
