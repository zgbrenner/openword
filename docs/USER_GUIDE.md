# OpenWord user guide

## Start a document

Open **File** to create a blank document or choose a built-in template. OpenWord includes report, business letter, legal memorandum, and meeting-note structures.

Each document opens in its own tab. A dot beside the title means the document has unsaved changes.

## Open an existing file

Choose **Open** and select an `.openword`, `.docx`, `.md`, `.markdown`, `.html`, `.htm`, or `.txt` file.

When conversion cannot preserve something exactly, OpenWord records a notice in the **Review → Compatibility** pane. Those notices remain attached to the document and appear again before a potentially destructive non-native save.

## Save safely

- **Save** writes back to the current format and path when available.
- A new or browser-only document defaults to `.openword`.
- **Save as** lets you choose OpenWord, DOCX, Markdown, HTML, or text.
- **Print / PDF** opens the operating system print dialog.

Use `.openword` while actively editing a complex document. Export a delivery copy to DOCX or PDF when needed.

## Home ribbon

The Home tab contains:

- Clipboard commands
- Font family and size
- Bold, italic, underline, strikethrough, superscript, and subscript
- Text and highlight colors
- Clear formatting
- Paragraph styles and headings
- Alignment, indentation, lists, task lists, and spacing
- Find and replace

Most formatting commands apply to selected text. Paragraph controls apply to the current paragraph or selection.

## Insert ribbon

Insert supports:

- Tables
- Local images
- Hyperlinks
- Current date
- Horizontal rules
- Explicit page breaks
- Headers and footers

Images are embedded into the document rather than loaded from the internet.

## Layout ribbon

Choose paper size, orientation, and margins through **Page setup**. Print layout shows a paper-like canvas. Web layout removes fixed page geometry for a continuous writing surface.

The current release treats the canvas as a continuous page-like surface with explicit page-break markers. Automatic section-aware pagination is planned.

## Review ribbon

Select text, then add a comment. The Review pane supports replies, resolve, reopen, and delete.

The Compatibility section explains content that an importer simplified or a non-native exporter may not preserve.

## View ribbon

Use View to toggle:

- Navigation pane
- Review pane
- Print or web layout
- Formatting marks
- Native spellcheck
- Dark mode
- Focus mode
- Zoom from 50 to 200 percent

The navigation pane lists headings and jumps to them in the document.

## Find and replace

Open find and replace with `Ctrl+H` or `Cmd+H`. OpenWord supports case-sensitive and whole-word matching, next-result navigation, replace one, and replace all.

## Command palette

Press `Ctrl+K` or `Cmd+K` to search application commands by name or keyword. For example, searching `margins` finds Page setup.

## Recovery

OpenWord saves best-effort recovery snapshots after edits. If the application closes unexpectedly, valid unsaved snapshots are restored as dirty tabs on the next launch.

Recovery is not a backup system or version history. Save important documents normally and maintain independent backups.
