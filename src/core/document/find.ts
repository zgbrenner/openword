import type { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";

export interface FindOptions {
  matchCase?: boolean;
  wholeWord?: boolean;
}

export interface FindMatch {
  from: number;
  to: number;
  text: string;
}

function isWordCharacter(value: string | undefined): boolean {
  return Boolean(value && /[\p{L}\p{N}_]/u.test(value));
}

function matchesWholeWord(text: string, index: number, length: number): boolean {
  return !isWordCharacter(text[index - 1]) && !isWordCharacter(text[index + length]);
}

export function findMatches(editor: Editor, query: string, options: FindOptions = {}): FindMatch[] {
  if (!query) return [];
  const needle = options.matchCase ? query : query.toLocaleLowerCase();
  const matches: FindMatch[] = [];

  editor.state.doc.descendants((node, position) => {
    if (!node.isText || !node.text) return;
    const haystack = options.matchCase ? node.text : node.text.toLocaleLowerCase();
    let start = 0;

    while (start <= haystack.length - needle.length) {
      const index = haystack.indexOf(needle, start);
      if (index < 0) break;
      if (!options.wholeWord || matchesWholeWord(node.text, index, needle.length)) {
        matches.push({
          from: position + index,
          to: position + index + needle.length,
          text: node.text.slice(index, index + needle.length),
        });
      }
      start = index + Math.max(1, needle.length);
    }
  });

  return matches;
}

export function selectFindMatch(editor: Editor, match: FindMatch): void {
  const transaction = editor.state.tr.setSelection(
    TextSelection.create(editor.state.doc, match.from, match.to),
  );
  editor.view.dispatch(transaction.scrollIntoView());
  editor.commands.focus();
}
