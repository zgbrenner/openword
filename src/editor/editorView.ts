import { EditorState, type Transaction } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { history } from "prosemirror-history";
import { keymap } from "prosemirror-keymap";
import { dropCursor } from "prosemirror-dropcursor";
import { gapCursor } from "prosemirror-gapcursor";
import { columnResizing, tableEditing } from "prosemirror-tables";
import { suggestChanges, withSuggestChanges } from "@handlewithcare/prosemirror-suggest-changes";
import type { Node as PMNode } from "prosemirror-model";
import { schema } from "./schema";
import { buildKeymap } from "./keymap";
import { buildInputRules } from "./inputRules";
import { paginationPlugin, type PaginationRuntime } from "./paginationPlugin";

export function buildPlugins(paginationRuntime: PaginationRuntime) {
  return [
    buildInputRules(),
    keymap(buildKeymap()),
    history(),
    dropCursor(),
    gapCursor(),
    columnResizing({}),
    tableEditing(),
    suggestChanges(),
    paginationPlugin(paginationRuntime),
  ];
}

export function buildEditorState(doc: PMNode | undefined, paginationRuntime: PaginationRuntime): EditorState {
  return EditorState.create({ schema, doc, plugins: buildPlugins(paginationRuntime) });
}

export interface AppliedTransaction {
  state: EditorState;
  /**
   * False for transactions that only moved the selection or set metadata.
   * The shell needs the distinction because "the document is dirty" and
   * "something happened in the editor" are not the same thing: clicking once
   * in an untouched document must not arm the unsaved-changes prompt, while
   * every selection-dependent piece of UI still has to be recomputed.
   */
  docChanged: boolean;
}

/**
 * Fold a transaction into a new state, reporting whether it actually changed
 * the document. Split out from the dispatcher below so the distinction is
 * unit-testable without a DOM.
 */
export function applyTransaction(state: EditorState, tr: Transaction): AppliedTransaction {
  return { state: state.apply(tr), docChanged: tr.docChanged };
}

export function mountEditorView(
  mount: HTMLElement,
  state: EditorState,
  onTransaction: (state: EditorState, docChanged: boolean) => void,
): EditorView {
  const view = new EditorView(mount, {
    state,
    // withSuggestChanges intercepts every transaction and, when suggesting
    // mode is on, rewrites it so deletions become `deletion` marks instead
    // of real removals and new content gets an `insertion` mark — otherwise
    // it's a no-op passthrough to the dispatch below.
    dispatchTransaction: withSuggestChanges((tr: Transaction) => {
      const { state: newState, docChanged } = applyTransaction(view.state, tr);
      view.updateState(newState);
      onTransaction(newState, docChanged);
    }),
    attributes: {
      class: "ow-prosemirror",
      spellcheck: "true",
    },
  });
  return view;
}

export { schema };
