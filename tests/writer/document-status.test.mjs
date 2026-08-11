import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

test("protocol carries Writer page and word status without reparsing localized labels", () => {
  const protocol = read("src/writer/protocol.ts");
  assert.match(protocol, /event:\s*"document\.statistics"/);
  assert.match(protocol, /pageLabel: string/);
  assert.match(protocol, /pageTooltip: string/);
  assert.match(protocol, /wordCountLabel: string/);
});

test("UNO worker subscribes to Writer's authoritative status items", () => {
  const worker = read("public/writer-runtime/openword_writer_thread.js");
  assert.match(worker, /addStatusListener\("StateWordCount"/);
  assert.match(worker, /addStatusListener\("StatePageNumber"/);
  assert.match(worker, /Array\.isArray\(value\)/);
  assert.match(worker, /postEvent\("document\.statistics"/);
});

test("Svelte state and status bar expose Writer-provided page and word labels", () => {
  const state = read("src/writer/state.svelte.ts");
  const status = read("src/components/WriterStatusBar.svelte");
  assert.match(state, /pageLabel = \$state\(""\)/);
  assert.match(state, /wordCountLabel = \$state\(""\)/);
  assert.match(state, /case "document\.statistics"/);
  assert.match(status, /state\.pageLabel/);
  assert.match(status, /state\.pageTooltip/);
  assert.match(status, /state\.wordCountLabel/);
});
