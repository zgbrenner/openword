// Test harness for the editor shell's state plumbing.
//
// The pieces under test here — the transaction dispatcher in
// src/editor/editorView.ts and the find/replace primitives in
// src/lib/findReplace.ts — are real TypeScript sources, and these suites are
// plain `.mjs` run by `node --test`. Node 24 strips the types itself; the one
// thing its resolver cannot do is supply the extensions the sources omit
// (`./schema` -> `schema.ts`, `./document_file` -> `.js`), so a synchronous
// resolve hook does that. Same technique as tests/editor/docx-test-env.mjs.
//
// Nothing here is a stand-in for the shipping code: the schema, the plugin
// stack, the ProseMirror state machine and the search primitives are all the
// real thing. Only the EditorView is absent, because it needs a DOM — see
// `fakeView()` below for what replaces it.

import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (!specifier.startsWith(".")) throw error;
      for (const extension of [".ts", ".js"]) {
        try {
          return nextResolve(specifier + extension, context);
        } catch {
          // try the next extension
        }
      }
      throw error;
    }
  },
});

const sourceUrl = (path) => new URL(`../../src/${path}`, import.meta.url).href;

export const { applyTransaction, buildEditorState } = await import(sourceUrl("editor/editorView.ts"));
export const { schema } = await import(sourceUrl("editor/schema.ts"));
export const { PaginationRuntime } = await import(sourceUrl("editor/paginationPlugin.ts"));
export const { PAGE_SIZES, geometryFor } = await import(sourceUrl("editor/pagination.ts"));
export const { findAll, replaceAll, replaceMatch, selectMatch } = await import(sourceUrl("lib/findReplace.ts"));

/** An editor state over the real schema and the real plugin stack. */
export function stateWithText(text) {
  const runtime = new PaginationRuntime(geometryFor(PAGE_SIZES.letter), 1);
  const paragraph = text.length > 0
    ? schema.node("paragraph", null, [schema.text(text)])
    : schema.node("paragraph");
  return buildEditorState(schema.node("doc", null, [paragraph]), runtime);
}

/**
 * Everything the find/replace primitives use of an EditorView — `state`,
 * `dispatch`, `focus` — over the real EditorState, so transactions are
 * applied by ProseMirror itself. Records each transaction so a test can ask
 * what the shell's dispatcher would have been handed.
 */
export function fakeView(state) {
  return {
    state,
    /** One entry per dispatch: the transaction and what the shell's dispatcher would have reported. */
    dispatched: [],
    dispatch(tr) {
      const applied = applyTransaction(this.state, tr);
      this.state = applied.state;
      this.dispatched.push({ tr, docChanged: applied.docChanged });
      return applied;
    },
    focus() {},
    get lastDocChanged() {
      return this.dispatched[this.dispatched.length - 1]?.docChanged;
    },
  };
}
