import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

function loadRegistry() {
  const context = { Object };
  runInNewContext(read("public/writer-runtime/openword_writer_commands.js"), context);
  return context.OPENWORD_WRITER_COMMANDS;
}

test("semantic review commands map to verified Writer dispatch URLs", () => {
  const registry = loadRegistry();
  assert.equal(registry["review.toggleTrackChanges"], ".uno:TrackChanges");
  assert.equal(registry["review.previousChange"], ".uno:PreviousTrackedChange");
  assert.equal(registry["review.nextChange"], ".uno:NextTrackedChange");
  assert.equal(registry["review.acceptChange"], ".uno:AcceptTrackedChange");
  assert.equal(registry["review.rejectChange"], ".uno:RejectTrackedChange");
  assert.equal(registry["review.acceptAllChanges"], ".uno:AcceptAllTrackedChanges");
  assert.equal(registry["review.rejectAllChanges"], ".uno:RejectAllTrackedChanges");
});

test("protocol and Writer state carry authoritative track-changes state", () => {
  const protocol = read("src/writer/protocol.ts");
  const state = read("src/writer/state.svelte.ts");
  assert.match(protocol, /type:\s*"review\.toggleTrackChanges"/);
  assert.match(protocol, /type:\s*"review\.acceptAllChanges"/);
  assert.match(protocol, /event:\s*"review\.state"/);
  assert.match(protocol, /trackChangesEnabled: boolean/);
  assert.match(state, /trackChangesEnabled = \$state\(false\)/);
  assert.match(state, /case "review\.state"/);
});

test("UNO worker listens to TrackChanges status and publishes review state", () => {
  const worker = read("public/writer-runtime/openword_writer_thread.js");
  assert.match(worker, /addStatusListener\("TrackChanges"/);
  assert.match(worker, /postEvent\("review\.state"/);
});

test("clean ribbon exposes a keyboard-accessible Review tab and verified controls", () => {
  const ribbon = read("src/components/WriterHomeBar.svelte");
  assert.match(ribbon, /type RibbonTab = "home" \| "insert" \| "layout" \| "review"/);
  assert.match(ribbon, /id="ow-ribbon-tab-review"/);
  assert.match(ribbon, /aria-controls="ow-ribbon-panel-review"/);
  for (const command of [
    "review.toggleTrackChanges",
    "review.previousChange",
    "review.nextChange",
    "review.acceptChange",
    "review.rejectChange",
    "review.acceptAllChanges",
    "review.rejectAllChanges",
  ]) {
    assert.match(ribbon, new RegExp(command.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});
