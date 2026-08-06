import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

test("loads page-style policy before the UNO worker and tracks it in runtime provenance", () => {
  const host = read("src/writer/runtimeHost.ts");
  const policyIndex = host.indexOf('absoluteAssetUrl("openword_writer_page_styles.js"');
  const workerIndex = host.indexOf('absoluteAssetUrl("openword_writer_thread.js"');
  assert.notEqual(policyIndex, -1);
  assert.notEqual(workerIndex, -1);
  assert.ok(policyIndex < workerIndex);

  const manifest = JSON.parse(read("engine/manifest.json"));
  assert.ok(manifest.runtimeFiles.includes("openword_writer_page_styles.js"));
  assert.match(read(".gitignore"), /!public\/writer-runtime\/openword_writer_page_styles\.js/);
});

test("protocol exposes Word-facing page-style commands and authoritative state", () => {
  const protocol = read("src/writer/protocol.ts");
  for (const command of [
    "header.setEnabled",
    "footer.setEnabled",
    "pageStyle.setDifferentFirstPage",
    "pageStyle.setDifferentOddEven",
    "pageStyle.setOrientation",
    "pageStyle.setMargins",
  ]) {
    assert.match(protocol, new RegExp(command.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(protocol, /selection\.pageStyle/);
  assert.match(protocol, /pageStyleName/);
  assert.match(protocol, /differentFirstPage/);
  assert.match(protocol, /differentOddEven/);
  assert.match(protocol, /orientation/);
  assert.match(protocol, /marginPreset/);
});

test("UNO worker updates the current Writer page style through direct properties", () => {
  const worker = read("public/writer-runtime/openword_writer_thread.js");
  assert.match(worker, /controller\.getViewCursor\(\)/);
  assert.match(worker, /getPropertyValue\("PageStyleName"\)/);
  assert.match(worker, /model\.getStyleFamilies\(\)\.getByName\("PageStyles"\)/);
  assert.match(worker, /OPENWORD_WRITER_PAGE_STYLES\.updatesFor\(/);
  assert.match(worker, /\(property\) => pageStyle\.getPropertyValue\(property\)/);
  assert.match(worker, /pageStyle\.setPropertyValue\(update\.property, update\.value\)/);
  assert.match(worker, /postEvent\("selection\.pageStyle"/);
});

test("visible header footer and page-layout controls use semantic commands", () => {
  const home = read("src/components/WriterHomeBar.svelte");
  assert.match(home, /aria-label="Headers and footers"/);
  assert.match(home, /aria-label="Page setup"/);
  assert.match(home, /header\.setEnabled/);
  assert.match(home, /footer\.setEnabled/);
  assert.match(home, /pageStyle\.setDifferentFirstPage/);
  assert.match(home, /pageStyle\.setDifferentOddEven/);
  assert.match(home, /pageStyle\.setOrientation/);
  assert.match(home, /pageStyle\.setMargins/);
});
