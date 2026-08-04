import { EditorState, type Transaction } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { history } from "prosemirror-history";
import { keymap } from "prosemirror-keymap";
import { dropCursor } from "prosemirror-dropcursor";
import { gapCursor } from "prosemirror-gapcursor";
import { columnResizing, tableEditing } from "prosemirror-tables";
import type { Node as PMNode } from "prosemirror-model";
import { schema } from "./schema";
import { buildKeymap } from "./keymap";
import { buildInputRules } from "./inputRules";

export function buildPlugins() {
  return [
    buildInputRules(),
    keymap(buildKeymap()),
    history(),
    dropCursor(),
    gapCursor(),
    columnResizing({}),
    tableEditing(),
  ];
}

export function buildEditorState(doc?: PMNode): EditorState {
  return EditorState.create({ schema, doc, plugins: buildPlugins() });
}

export function mountEditorView(
  mount: HTMLElement,
  state: EditorState,
  onTransaction: (state: EditorState) => void,
): EditorView {
  const view = new EditorView(mount, {
    state,
    dispatchTransaction(tr: Transaction) {
      const newState = view.state.apply(tr);
      view.updateState(newState);
      onTransaction(newState);
    },
    attributes: {
      class: "ow-prosemirror",
      spellcheck: "true",
    },
  });
  return view;
}

export { schema };
