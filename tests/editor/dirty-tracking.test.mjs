import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { TextSelection } from "prosemirror-state";
import { applyTransaction, fakeView, replaceMatch, schema, selectMatch, stateWithText } from "./editor-test-env.mjs";

const root = new URL("../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

// "The document has unsaved changes" and "something happened in the editor"
// are different questions. Every transaction has to refresh the snapshot the
// toolbar, status bar and review panel read; only the ones that changed the
// document may arm the unsaved-changes prompt and the recovery snapshot.

test("moving the caret is not a document change", () => {
  const state = stateWithText("Hello world");
  const tr = state.tr.setSelection(TextSelection.create(state.doc, 3, 3));
  assert.equal(applyTransaction(state, tr).docChanged, false);
});

test("selecting a range is not a document change", () => {
  const state = stateWithText("Hello world");
  const tr = state.tr.setSelection(TextSelection.create(state.doc, 1, 6));
  assert.equal(applyTransaction(state, tr).docChanged, false);
});

test("a transaction that only carries metadata is not a document change", () => {
  const state = stateWithText("Hello world");
  const tr = state.tr.setMeta("addToHistory", false);
  assert.equal(applyTransaction(state, tr).docChanged, false);
});

test("jumping to a search match is not a document change", () => {
  // The exact path the find bar takes on open and on every next/previous.
  const view = fakeView(stateWithText("Hello world"));
  selectMatch(view, { from: 1, to: 6 });
  assert.equal(view.dispatched.length, 1);
  assert.equal(view.lastDocChanged, false);
});

test("typing, replacing and formatting are document changes", () => {
  const state = stateWithText("Hello world");
  assert.equal(applyTransaction(state, state.tr.insertText("!", 12)).docChanged, true);
  assert.equal(applyTransaction(state, state.tr.delete(1, 6)).docChanged, true);
  assert.equal(
    applyTransaction(state, state.tr.addMark(1, 6, schema.marks.bold.create())).docChanged,
    true,
  );
});

test("replacing a match is a document change", () => {
  const view = fakeView(stateWithText("Hello world"));
  replaceMatch(view, { from: 1, to: 6 }, "Howdy");
  assert.equal(view.lastDocChanged, true);
  assert.equal(view.state.doc.textContent, "Howdy world");
});

test("applyTransaction still produces the state the view would have shown", () => {
  const state = stateWithText("Hello world");
  const applied = applyTransaction(state, state.tr.insertText("!", 12));
  assert.equal(applied.state.doc.textContent, "Hello world!");
});

// --- Wiring -----------------------------------------------------------------

test("the view dispatcher reports docChanged alongside the new state", () => {
  const source = read("src/editor/editorView.ts");
  assert.match(source, /onTransaction: \(state: EditorState, docChanged: boolean\) => void/);
  assert.match(source, /const \{ state: newState, docChanged \} = applyTransaction\(view\.state, tr\)/);
  assert.match(source, /onTransaction\(newState, docChanged\)/);
  assert.match(source, /docChanged: tr\.docChanged/);
});

test("the controller marks the document dirty only for real document changes", () => {
  const source = read("src/lib/editorController.svelte.ts");
  const handler = source.slice(source.indexOf("mountEditorView("), source.indexOf("mouseup"));
  assert.match(handler, /\(state, docChanged\) =>/);
  assert.match(handler, /if \(docChanged\) this\.dirty = true;/);
  assert.doesNotMatch(
    handler,
    /^\s*this\.dirty = true;/m,
    "dirty must never be set unconditionally on every transaction",
  );
  // The selection-dependent UI still has to be refreshed every time.
  assert.match(handler, /this\.snapshot = computeSnapshot\(state\)/);
  assert.match(handler, /this\.suggestionMeta = reconcileSuggestionMeta\(/);
});
