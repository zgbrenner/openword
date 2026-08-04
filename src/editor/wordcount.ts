import type { Node as PMNode } from "prosemirror-model";

export interface WordCount {
  words: number;
  characters: number;
  charactersNoSpaces: number;
}

export function countWords(doc: PMNode): WordCount {
  let text = "";
  doc.descendants((node) => {
    if (node.isText) text += node.text ?? "";
    else if (node.isBlock) text += "\n";
    return true;
  });
  const trimmed = text.trim();
  const words = trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length;
  const characters = text.replace(/\n/g, "").length;
  const charactersNoSpaces = text.replace(/\s/g, "").length;
  return { words, characters, charactersNoSpaces };
}
