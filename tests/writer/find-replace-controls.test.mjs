import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

test("find bar drives search through the semantic client API only", () => {
  const bar = read("src/components/WriterFindBar.svelte");
  assert.match(bar, /\.find\(\{ query, matchCase, wholeWords, backwards \}\)/);
  assert.match(bar, /\.replaceNext\(\{ query, replacement, matchCase, wholeWords \}\)/);
  assert.match(bar, /\.replaceAll\(\{ query, replacement, matchCase, wholeWords \}\)/);
  assert.doesNotMatch(bar, /\.uno:/, "the UI must never dispatch raw UNO URLs");
});

test("find bar wires the match-case and whole-words options to checkboxes", () => {
  const bar = read("src/components/WriterFindBar.svelte");
  assert.match(bar, /let matchCase = \$state\(false\)/);
  assert.match(bar, /let wholeWords = \$state\(false\)/);
  assert.match(bar, /bind:checked=\{matchCase\}/);
  assert.match(bar, /bind:checked=\{wholeWords\}/);
});

test("find bar carries the accessible search-landmark contract", () => {
  const bar = read("src/components/WriterFindBar.svelte");
  assert.match(bar, /role="search"/);
  assert.match(bar, /aria-label="Find and replace"/);
  assert.match(bar, /aria-live="polite"/);
  assert.match(bar, /aria-label="Close find and replace"/);
  assert.match(bar, /placeholder="Find in document"/);
  assert.match(bar, /placeholder="Replace with"/);
});

test("writer client exposes find and replace over the search.* protocol methods", () => {
  const client = read("src/writer/client.ts");
  assert.match(client, /find\(options: WriterSearchOptions\): Promise<WriterFindResult>/);
  assert.match(client, /this\.request\("search\.find", options\)/);
  assert.match(client, /replaceNext\(options: WriterReplaceOptions\): Promise<WriterReplaceNextResult>/);
  assert.match(client, /this\.request\("search\.replaceNext", options\)/);
  assert.match(client, /replaceAll\(options: WriterReplaceOptions\): Promise<WriterReplaceAllResult>/);
  assert.match(client, /this\.request\("search\.replaceAll", options\)/);
});

test("UNO worker implements validated search with wrap-around and bulk replace", () => {
  const worker = read("public/writer-runtime/openword_writer_thread.js");
  assert.match(worker, /function validateSearchOptions\(options\)/);
  assert.match(worker, /function findNextMatch\(rawOptions\)/);
  assert.match(worker, /model\.findNext\(start, descriptor\)/);
  // Wrap-around: a miss past the document edge retries once from the start.
  assert.match(worker, /found = model\.findFirst\(descriptor\)/);
  assert.match(worker, /wrapped = true/);
  assert.match(worker, /function replaceAllMatches\(rawOptions\)/);
  assert.match(worker, /model\.createReplaceDescriptor\(\)/);
  assert.match(worker, /model\.replaceAll\(descriptor\)/);
  assert.match(worker, /case "search\.find":/);
  assert.match(worker, /case "search\.replaceNext":/);
  assert.match(worker, /case "search\.replaceAll":/);
});

test("protocol declares the search methods, options, and result shapes", () => {
  const protocol = read("src/writer/protocol.ts");
  assert.match(protocol, /"search\.find"/);
  assert.match(protocol, /"search\.replaceNext"/);
  assert.match(protocol, /"search\.replaceAll"/);
  assert.match(protocol, /interface WriterSearchOptions/);
  assert.match(protocol, /matchCase: boolean/);
  assert.match(protocol, /wholeWords: boolean/);
  assert.match(protocol, /interface WriterReplaceOptions extends WriterSearchOptions/);
  assert.match(protocol, /interface WriterFindResult/);
  assert.match(protocol, /wrapped: boolean/);
  assert.match(protocol, /interface WriterReplaceNextResult extends WriterFindResult/);
  assert.match(protocol, /replaced: boolean/);
  assert.match(protocol, /interface WriterReplaceAllResult/);
  assert.match(protocol, /replaced: number/);
});
