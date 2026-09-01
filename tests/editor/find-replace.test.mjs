import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { TextSelection } from "prosemirror-state";
import { fakeView, findAll, replaceAll, replaceMatch, selectMatch, stateWithText } from "./editor-test-env.mjs";

const root = new URL("../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

// A match is a pair of document positions, and every replacement shifts,
// merges or removes the positions after it. A match list is therefore only
// valid against the document it was found in.

test("findAll locates every occurrence in document coordinates", () => {
  const state = stateWithText("aaa aaa aaa");
  assert.deepEqual(findAll(state.doc, "aaa"), [
    { from: 1, to: 4 },
    { from: 5, to: 8 },
    { from: 9, to: 12 },
  ]);
});

test("one replacement invalidates every later position in the list", () => {
  const view = fakeView(stateWithText("aaa aaa aaa"));
  const stale = findAll(view.state.doc, "aaa");

  replaceMatch(view, stale[0], "b");
  assert.equal(view.state.doc.textContent, "b aaa aaa");

  // Reusing the list is not merely inaccurate, it is out of bounds: the third
  // match ended at 12 in a document whose last text position is now 10.
  const lastTextPosition = view.state.doc.content.size - 1;
  assert.equal(lastTextPosition, 10);
  assert.ok(stale[2].to > lastTextPosition);
  assert.throws(() => TextSelection.create(view.state.doc, stale[2].from, stale[2].to), RangeError);

  // And the second stale position has slid across the shortened text, so
  // replacing through it would eat the wrong characters.
  assert.equal(view.state.doc.textBetween(stale[1].from, stale[1].to), "a a");
});

test("re-finding after each replacement keeps every position inside the document", () => {
  const view = fakeView(stateWithText("aaa aaa aaa"));

  // What the find bar does now: the list is read out of the live document
  // immediately before it is used, never carried across an edit.
  for (let guard = 0; guard < 10; guard++) {
    const live = findAll(view.state.doc, "aaa");
    if (live.length === 0) break;
    selectMatch(view, live[0]);
    replaceMatch(view, live[0], "b");
  }

  assert.equal(view.state.doc.textContent, "b b b");
  assert.deepEqual(findAll(view.state.doc, "aaa"), []);
});

test("stepping past the end of a shrunken match list wraps instead of throwing", () => {
  const view = fakeView(stateWithText("aaa aaa aaa"));
  replaceMatch(view, findAll(view.state.doc, "aaa")[0], "b");

  // The find bar's index was 2 when there were three matches; two remain.
  const live = findAll(view.state.doc, "aaa");
  assert.equal(live.length, 2);
  const clamped = ((2 % live.length) + live.length) % live.length;
  assert.equal(clamped, 0);
  assert.doesNotThrow(() => selectMatch(view, live[clamped]));
  assert.deepEqual(
    { from: view.state.selection.from, to: view.state.selection.to },
    live[0],
  );
});

test("a replacement that contains the query does not re-match itself", () => {
  const view = fakeView(stateWithText("a a"));
  const target = findAll(view.state.doc, "a")[0];
  replaceMatch(view, target, "aa");
  assert.equal(view.state.doc.textContent, "aa a");

  // The find bar lands on the first match starting at or after the end of the
  // text it just wrote, so Replace keeps making progress through the document.
  const after = target.from + "aa".length;
  const following = findAll(view.state.doc, "a").findIndex((m) => m.from >= after);
  assert.equal(following, 2);
});

test("replaceAll rewrites every occurrence in one transaction", () => {
  const view = fakeView(stateWithText("aaa aaa aaa"));
  assert.equal(replaceAll(view, "aaa", "b"), 3);
  assert.equal(view.dispatched.length, 1);
  assert.equal(view.state.doc.textContent, "b b b");
});

// --- Wiring -----------------------------------------------------------------

test("the find bar recomputes its matches on every transaction", () => {
  const bar = read("src/components/FindReplace.svelte");
  // controller.doc reads through the EditorView, which is not $state; the
  // snapshot is what the controller republishes per transaction.
  assert.match(bar, /const matches = \$derived\.by<Match\[\]>\(\(\) => \{[\s\S]*?void controller\.snapshot;/);
  assert.doesNotMatch(
    bar,
    /const matches = \$derived<Match\[\]>\(query \?/,
    "the match list must not depend on the query alone",
  );
});

test("the find bar re-finds and clamps before it selects or replaces", () => {
  const bar = read("src/components/FindReplace.svelte");
  assert.match(bar, /function liveMatches\(\): Match\[\]/);
  assert.match(bar, /return query \? findAll\(controller\.doc, query\) : \[\];/);
  assert.match(bar, /function clampIndex\(index: number, length: number\): number/);
  for (const fn of ["function goTo", "function doReplace"]) {
    const body = bar.slice(bar.indexOf(fn), bar.indexOf("}", bar.indexOf(fn)));
    assert.match(body, /liveMatches\(\)/, `${fn} must read positions from the live document`);
  }
  // Navigation goes through the clamping helper rather than indexing the
  // rendered list directly.
  assert.match(bar, /function next\(\): void \{\s*goTo\(matchIndex \+ 1\);/);
  assert.match(bar, /function prev\(\): void \{\s*goTo\(matchIndex - 1\);/);
  assert.doesNotMatch(bar, /selectMatch\(controller\.view, matches\[/);
  assert.doesNotMatch(bar, /replaceMatch\(controller\.view, matches\[/);
});

test("the find bar selects from event handlers, never from a tracked effect", () => {
  const bar = read("src/components/FindReplace.svelte");
  // Now that the match list tracks the snapshot, an effect that both read it
  // and dispatched a selection would re-enter itself on the transaction it
  // just dispatched. Navigation is therefore event-driven, and the one effect
  // that still selects — the jump back to the first match when the bar
  // reopens — depends on `open` alone and does the rest untracked.
  const effects = [...bar.matchAll(/\$effect\(\(\) => \{([\s\S]*?)\n  \}\);/g)]
    // Comments explain the dependencies; only the code declares them.
    .map((m) => m[1].replace(/^\s*\/\/.*$/gm, ""));
  assert.equal(effects.length, 1, "the find bar should need exactly one effect");
  for (const body of effects) {
    assert.doesNotMatch(body, /\bmatches\b/, "no effect may depend on the match list");
    assert.doesNotMatch(body, /controller\.snapshot/, "no effect may depend on the snapshot");
    assert.doesNotMatch(body, /\bquery\b/, "no effect may depend on the query");
    assert.doesNotMatch(body, /selectMatch/, "no effect may select without untracking");
    assert.match(body, /untrack\(\(\) => goTo\(0\)\)/);
  }
  assert.match(bar, /import \{ getContext, untrack \} from "svelte"/);
  assert.match(bar, /oninput=\{\(e\) => onQueryInput\(\(e\.target as HTMLInputElement\)\.value\)\}/);
});
