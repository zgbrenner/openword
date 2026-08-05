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

export function mountEditorView(
  mount: HTMLElement,
  state: EditorState,
  onTransaction: (state: EditorState) => void,
): EditorView {
  const view = new EditorView(mount, {
    state,
    // withSuggestChanges intercepts every transaction and, when suggesting
    // mode is on, rewrites it so deletions become `deletion` marks instead
    // of real removals and new content gets an `insertion` mark — otherwise
    // it's a no-op passthrough to the dispatch below.
    dispatchTransaction: withSuggestChanges((tr: Transaction) => {
      const newState = view.state.apply(tr);
      view.updateState(newState);
      onTransaction(newState);
    }),
    attributes: {
      class: "ow-prosemirror",
      spellcheck: "true",
    },
  });
  return view;
}

export { schema };
