import type { CommandContext, OpenWordCommand } from "./types";

export function getCommands(context: CommandContext): OpenWordCommand[] {
  const editor = context.editor;
  const editorCommand = (
    id: string,
    label: string,
    keywords: string[],
    shortcut: string | undefined,
    run: () => void,
  ): OpenWordCommand => ({ id, label, keywords, shortcut, enabled: Boolean(editor), run });

  return [
    {
      id: "file",
      label: "Open File menu",
      keywords: ["file", "backstage", "new", "export"],
      enabled: true,
      run: context.openBackstage,
    },
    {
      id: "open",
      label: "Open document",
      keywords: ["file", "import", "docx", "markdown"],
      shortcut: "Ctrl+O",
      enabled: true,
      run: context.openDocument,
    },
    {
      id: "save",
      label: "Save document",
      keywords: ["file", "write"],
      shortcut: "Ctrl+S",
      enabled: true,
      run: context.saveDocument,
    },
    {
      id: "save-as",
      label: "Save document as",
      keywords: ["export", "copy", "format"],
      shortcut: "Ctrl+Shift+S",
      enabled: true,
      run: context.saveDocumentAs,
    },
    {
      id: "print",
      label: "Print or save as PDF",
      keywords: ["pdf", "paper"],
      shortcut: "Ctrl+P",
      enabled: true,
      run: context.printDocument,
    },
    editorCommand("undo", "Undo", ["history", "back"], "Ctrl+Z", () => editor?.chain().focus().undo().run()),
    editorCommand("redo", "Redo", ["history", "forward"], "Ctrl+Y", () => editor?.chain().focus().redo().run()),
    editorCommand("bold", "Toggle bold", ["format", "strong"], "Ctrl+B", () => editor?.chain().focus().toggleBold().run()),
    editorCommand("italic", "Toggle italic", ["format", "emphasis"], "Ctrl+I", () => editor?.chain().focus().toggleItalic().run()),
    editorCommand("underline", "Toggle underline", ["format"], "Ctrl+U", () => editor?.chain().focus().toggleUnderline().run()),
    editorCommand("page-break", "Insert page break", ["insert", "page"], "Ctrl+Enter", () => editor?.chain().focus().setPageBreak().run()),
    {
      id: "find",
      label: "Find and replace",
      keywords: ["search", "replace"],
      shortcut: "Ctrl+H",
      enabled: true,
      run: context.openFindReplace,
    },
    {
      id: "page-setup",
      label: "Page setup",
      keywords: ["margins", "orientation", "paper"],
      enabled: true,
      run: context.openPageSetup,
    },
    {
      id: "navigation",
      label: "Toggle navigation pane",
      keywords: ["outline", "headings", "sidebar"],
      enabled: true,
      run: context.toggleNavigation,
    },
    {
      id: "review",
      label: "Toggle review pane",
      keywords: ["comments", "warnings", "sidebar"],
      enabled: true,
      run: context.toggleReview,
    },
  ];
}

export function searchCommands(commands: OpenWordCommand[], query: string): OpenWordCommand[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return commands;
  return commands.filter((command) =>
    [command.label, ...command.keywords].some((value) =>
      value.toLocaleLowerCase().includes(needle),
    ),
  );
}
