import type { Editor } from "@tiptap/core";

export interface CommandContext {
  editor: Editor | null;
  openBackstage: () => void;
  openDocument: () => void;
  saveDocument: () => void;
  saveDocumentAs: () => void;
  printDocument: () => void;
  openFindReplace: () => void;
  openPageSetup: () => void;
  toggleNavigation: () => void;
  toggleReview: () => void;
}

export interface OpenWordCommand {
  id: string;
  label: string;
  keywords: string[];
  shortcut?: string;
  enabled: boolean;
  run: () => void;
}
