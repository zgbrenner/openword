import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

test("Writer ribbon exposes only implemented Home Insert and Layout tabs", () => {
  const ribbon = read("src/components/WriterHomeBar.svelte");
  assert.match(ribbon, /type RibbonTab = "home" \| "insert" \| "layout"/);
  assert.match(ribbon, />Home<\/button>/);
  assert.match(ribbon, />Insert<\/button>/);
  assert.match(ribbon, />Layout<\/button>/);
  assert.doesNotMatch(ribbon, />Review<\/button>/);
  assert.doesNotMatch(ribbon, />Mailings<\/button>/);
});

test("tab panels separate formatting, insertion, and page-layout commands", () => {
  const ribbon = read("src/components/WriterHomeBar.svelte");
  assert.match(ribbon, /activeTab === "home"/);
  assert.match(ribbon, /activeTab === "insert"/);
  assert.match(ribbon, /activeTab === "layout"/);
  assert.match(ribbon, /aria-label="Font"/);
  assert.match(ribbon, /aria-label="Paragraph"/);
  assert.match(ribbon, /aria-label="Pages"/);
  assert.match(ribbon, /aria-label="Headers and footers"/);
  assert.match(ribbon, /aria-label="Page setup"/);
});

test("ribbon uses shared line icons and reports engine command failures", () => {
  const ribbon = read("src/components/WriterHomeBar.svelte");
  assert.match(ribbon, /import WriterGlyph from "\.\/WriterGlyph\.svelte"/);
  assert.match(ribbon, /export let onerror:/);
  assert.match(ribbon, /catch \(error\)/);
  assert.match(ribbon, /onerror\(error\)/);
});

test("ribbon remains keyboard and screen-reader navigable", () => {
  const ribbon = read("src/components/WriterHomeBar.svelte");
  assert.match(ribbon, /role="tablist"/);
  assert.match(ribbon, /role="tab"/);
  assert.match(ribbon, /aria-selected=/);
  assert.match(ribbon, /role="tabpanel"/);
  assert.match(ribbon, /aria-pressed=/);
});
