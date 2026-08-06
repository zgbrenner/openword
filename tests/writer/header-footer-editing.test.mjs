import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

test("protocol exposes semantic header and footer editing commands", () => {
  const protocol = read("src/writer/protocol.ts");
  assert.match(protocol, /type:\s*"header\.edit"/);
  assert.match(protocol, /type:\s*"footer\.edit"/);
});

test("UNO worker enables a missing page region before navigating into it", () => {
  const worker = read("public/writer-runtime/openword_writer_thread.js");
  assert.match(worker, /function editPageRegion\(kind\)/);
  assert.match(worker, /kind === "header" \? "HeaderIsOn" : "FooterIsOn"/);
  assert.match(worker, /pageStyle\.setPropertyValue\(enabledProperty, true\)/);
  assert.match(worker, /dispatch\(commandUrls\[kind === "header" \? "header\.edit" : "footer\.edit"\]\)/);
  assert.match(worker, /if \(type === "header\.edit"\)/);
  assert.match(worker, /if \(type === "footer\.edit"\)/);
});

test("visible controls enter the current page header or footer", () => {
  const home = read("src/components/WriterHomeBar.svelte");
  assert.match(home, /type:\s*"header\.edit"/);
  assert.match(home, /type:\s*"footer\.edit"/);
  assert.match(home, />Edit header<\/button>/);
  assert.match(home, />Edit footer<\/button>/);
});
