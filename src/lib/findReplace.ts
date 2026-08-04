import type { EditorView } from "prosemirror-view";
import type { Node as PMNode } from "prosemirror-model";
import { TextSelection } from "prosemirror-state";

export interface Match {
  from: number;
  to: number;
}

function buildTextIndex(doc: PMNode): { text: string; positions: number[] } {
  let text = "";
  const positions: number[] = [];
  doc.descendants((node, pos) => {
    if (node.isText) {
      const t = node.text ?? "";
      for (let i = 0; i < t.length; i++) positions.push(pos + i);
      text += t;
    } else if (node.isBlock) {
      text += "\n";
      positions.push(pos);
    }
    return true;
  });
  return { text, positions };
}

export function findAll(doc: PMNode, query: string, caseSensitive = false): Match[] {
  if (!query) return [];
  const { text, positions } = buildTextIndex(doc);
  const hay = caseSensitive ? text : text.toLowerCase();
  const needle = caseSensitive ? query : query.toLowerCase();
  const matches: Match[] = [];
  let idx = 0;
  while (idx <= hay.length) {
    const found = hay.indexOf(needle, idx);
    if (found === -1) break;
    const from = positions[found];
    const to = positions[found + needle.length - 1] + 1;
    matches.push({ from, to });
    idx = found + needle.length;
  }
  return matches;
}

export function selectMatch(view: EditorView, match: Match) {
  const selection = TextSelection.create(view.state.doc, match.from, match.to);
  view.dispatch(view.state.tr.setSelection(selection).scrollIntoView());
  view.focus();
}

export function replaceMatch(view: EditorView, match: Match, replacement: string) {
  view.dispatch(view.state.tr.insertText(replacement, match.from, match.to));
}

export function replaceAll(view: EditorView, query: string, replacement: string, caseSensitive = false): number {
  const matches = findAll(view.state.doc, query, caseSensitive);
  if (matches.length === 0) return 0;
  let tr = view.state.tr;
  // Apply back-to-front so earlier offsets stay valid as later ones shift.
  for (let i = matches.length - 1; i >= 0; i--) {
    tr = tr.insertText(replacement, matches[i].from, matches[i].to);
  }
  view.dispatch(tr);
  return matches.length;
}
