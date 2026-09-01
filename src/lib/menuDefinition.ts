// Shared application menu definition for the web build. Ids, labels, and
// accelerators mirror the native menu in src-tauri/src/menu.rs verbatim — a
// contract test parses that file and requires the two to stay in sync.

export interface AppMenuItem {
  id: string;
  label: string;
  accelerator?: string;
}

export type AppMenuEntry = AppMenuItem | { separator: true };

export interface AppMenu {
  label: string;
  entries: AppMenuEntry[];
}

export function isSeparator(entry: AppMenuEntry): entry is { separator: true } {
  return "separator" in entry;
}

export const APP_MENUS: readonly AppMenu[] = [
  {
    label: "File",
    entries: [
      { id: "file_new", label: "New", accelerator: "CmdOrCtrl+N" },
      { id: "file_open", label: "Open...", accelerator: "CmdOrCtrl+O" },
      { separator: true },
      { id: "file_save", label: "Save", accelerator: "CmdOrCtrl+S" },
      { id: "file_save_as", label: "Save As...", accelerator: "CmdOrCtrl+Shift+S" },
      { id: "file_export_pdf", label: "Export as PDF..." },
    ],
  },
  {
    // The native Edit menu also carries OS-predefined Cut/Copy/Paste/Select All.
    // Those are OS affordances; on the web the browser and the embedded Writer
    // engine own the clipboard, so they are intentionally absent here.
    label: "Edit",
    entries: [
      { id: "edit_undo", label: "Undo", accelerator: "CmdOrCtrl+Z" },
      { id: "edit_redo", label: "Redo", accelerator: "CmdOrCtrl+Shift+Z" },
    ],
  },
  {
    label: "Insert",
    entries: [{ id: "insert_page_break", label: "Page Break", accelerator: "CmdOrCtrl+Return" }],
  },
  {
    label: "Format",
    entries: [
      { id: "format_bold", label: "Bold", accelerator: "CmdOrCtrl+B" },
      { id: "format_italic", label: "Italic", accelerator: "CmdOrCtrl+I" },
      { id: "format_underline", label: "Underline", accelerator: "CmdOrCtrl+U" },
      { separator: true },
      { id: "format_align_left", label: "Align Left", accelerator: "CmdOrCtrl+Shift+L" },
      { id: "format_align_center", label: "Center", accelerator: "CmdOrCtrl+Shift+E" },
      { id: "format_align_right", label: "Align Right", accelerator: "CmdOrCtrl+Shift+R" },
      { id: "format_align_justify", label: "Justify", accelerator: "CmdOrCtrl+Shift+J" },
      { separator: true },
      { id: "format_bullet_list", label: "Bulleted List", accelerator: "CmdOrCtrl+Shift+8" },
      { id: "format_ordered_list", label: "Numbered List", accelerator: "CmdOrCtrl+Shift+7" },
    ],
  },
  {
    label: "Tools",
    entries: [{ id: "tools_word_count", label: "Word Count", accelerator: "CmdOrCtrl+Shift+C" }],
  },
  {
    label: "Help",
    entries: [{ id: "help_about", label: "About OpenWord" }],
  },
];
