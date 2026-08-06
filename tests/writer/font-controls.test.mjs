import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

test("protocol carries semantic font commands and authoritative selection values", () => {
  const protocol = read("src/writer/protocol.ts");
  assert.match(protocol, /type:\s*"format\.setFontFamily"; fontFamily: string/);
  assert.match(protocol, /type:\s*"format\.setFontSize"; fontSize: number/);
  assert.match(protocol, /fontFamily:\s*string;\s*fontSize:\s*number \| null;/);
});

test("UNO worker sets font properties for Latin Asian and complex scripts", () => {
  const worker = read("public/writer-runtime/openword_writer_thread.js");
  for (const property of [
    "CharFontName",
    "CharFontNameAsian",
    "CharFontNameComplex",
    "CharHeight",
    "CharHeightAsian",
    "CharHeightComplex",
  ]) {
    assert.match(worker, new RegExp(`setPropertyValue\\("${property}"`));
  }
  assert.match(worker, /function readTextFormatting\(\)/);
  assert.match(worker, /getPropertyValue\("CharFontName"\)/);
  assert.match(worker, /getPropertyValue\("CharHeight"\)/);
});

test("Svelte state and Home ribbon expose font family and size controls", () => {
  const state = read("src/writer/state.svelte.ts");
  const ribbon = read("src/components/WriterHomeBar.svelte");
  assert.match(state, /fontFamily = \$state\(""\)/);
  assert.match(state, /fontSize = \$state<number \| null>\(null\)/);
  assert.match(ribbon, /aria-label="Font family"/);
  assert.match(ribbon, /aria-label="Font size"/);
  assert.match(ribbon, /format\.setFontFamily/);
  assert.match(ribbon, /format\.setFontSize/);
});
