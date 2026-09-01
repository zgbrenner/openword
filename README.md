# OpenWord

[![CI](https://github.com/zgbrenner/openword/actions/workflows/ci.yml/badge.svg)](https://github.com/zgbrenner/openword/actions/workflows/ci.yml)
[![Latest release](https://img.shields.io/github/v/release/zgbrenner/openword?include_prereleases&label=download)](https://github.com/zgbrenner/openword/releases/latest)
[![License: Apache 2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

**A free, open-source word processor that runs on your computer.**

OpenWord is a desktop app for writing documents. It opens and saves Word
`.docx` files, formats text the way you'd expect, lays text out on real Letter
or A4 pages, and supports comments and tracked changes. There is no account to
create, nothing to subscribe to, and no server involved.

Why you might want it:

- **Nothing leaves your machine.** No account, no sign-in, no sync, no
  telemetry. The core app contains no network code at all — that's structural,
  not a setting: there is no HTTP client in the Rust shell, and the app is
  granted permission to touch local files and show dialogs, nothing else.
- **It starts fast and stays small.** The installer is a few megabytes, because
  it renders through the WebView2 runtime Windows already ships rather than
  bundling an entire browser.
- **It's genuinely free.** Apache-2.0, no paid tier, no "pro" upsell.
- **It does the normal things.** Headings, lists, tables, images, page breaks,
  find and replace, comments, track changes, `.docx` in and out.

It is early software, version 0.1. The [limitations](#what-it-doesnt-do-yet)
section below is deliberately blunt about what's missing — please read it
before trusting it with a document that matters.

## Screenshots

<!--
  TODO(screenshots): capture these from a real build before the first release
  and commit them, then replace this block with the image links:

    ![Editing a document in OpenWord](docs/images/openword-editor.png)
    ![Comments and tracked changes](docs/images/openword-review.png)

  Do not commit mockups — they should be actual screenshots of the app.
-->

> Screenshots will be added alongside the first published build.

## Download and install

### Windows

1. Open the [latest release](https://github.com/zgbrenner/openword/releases/latest).
2. Download the `-setup.exe` installer. (An `.msi` is also published, if you
   deploy software through Group Policy or Intune.)
3. Run it, then launch OpenWord from the Start menu.

Windows 10 and 11 are supported. The installer sets OpenWord up for the current
user, so you don't need administrator rights, and it fetches Microsoft's
WebView2 runtime automatically on the older Windows 10 builds that don't
already include it.

> **Windows will warn you the first time you run the installer.**
> OpenWord is not code-signed yet — a certificate is an expense the project
> hasn't taken on. SmartScreen will show *"Windows protected your PC"*. Click
> **More info**, then **Run anyway**.
>
> If that gives you pause, that's a healthy instinct. You can
> [build it yourself from source](docs/building.md) instead — it's a couple of
> commands.

### macOS and Linux

Not released yet. The codebase is cross-platform and Tauri supports both, but
nothing has been packaged or tested there, so there is nothing to download. You
can [build from source](docs/building.md) on either platform today if you don't
mind being the first person to try it.

### Web

There is no OpenWord website. A browser build exists in the repository, but it
depends on an engine that isn't shipping yet — see
[the Writer engine track](docs/building.md#the-writer-engine-track).

## What it can do

**Writing and formatting**

- Bold, italic, underline, strikethrough, superscript, subscript
- Font family and size (from the fonts installed on your system), text color,
  highlight color
- Normal text and headings 1–6
- Left, center, right and justified alignment; indent levels; line spacing
  (single, 1.15, 1.5, double)
- Bulleted and numbered lists, including nesting
- Tables, with drag-resizable columns and add/delete row and column commands
- Images inserted from local files and embedded in the document
- Hyperlinks
- Format painter — click to copy formatting once, double-click to keep painting
- Clear formatting
- Autoformat as you type: `- ` starts a bullet list, `1. ` a numbered list,
  `# ` a heading, `-- ` becomes an em dash
- Spell check, borrowed from the operating system — right-click a squiggly word
  for suggestions

**Pages**

- A real page view: Letter or A4 sheets with 1-inch margins, a ruler with a
  draggable indent marker, and a live page count
- Manual page breaks
- Zoom from 50% to 200%
- Print through the system print dialog, with a print stylesheet that strips
  the app's toolbars and panels

**Reviewing**

- Comments anchored to a range of text, with threaded replies, resolve and
  reopen, and click-to-jump from the review panel back to the text
- Track changes: turn on suggesting mode and your edits become insertions and
  deletions instead of silent changes. Accept or reject them one at a time or
  all at once, with author and timestamp on each
- Set the name that appears on your comments and changes (stored locally — this
  is not an account)

**Finding**

- Find and replace, with a match counter, next/previous navigation, and
  replace-all

**Files**

- Open and save Microsoft Word `.docx` files — with real limits, so please
  read [About `.docx` files](#about-docx-files) below
- `.owdoc`, OpenWord's own format, which stores the document plus its comment
  threads and change history without loss
- Autosave to a crash-recovery snapshot; if OpenWord or your machine goes down,
  you're offered the unsaved work on the next launch
- Double-click a `.docx` in Explorer to open it in OpenWord

## What it doesn't do yet

This is where most word processors get vague. OpenWord won't.

### About `.docx` files

OpenWord's `.docx` support is its own converter, built on the `docx` and
`jszip` packages — not Word's filters and not LibreOffice's. It handles
ordinary documents: text and character formatting, headings 1–6, lists,
tables, images, hyperlinks, comments with replies, and tracked insertions and
deletions.

It is **not** a fidelity-preserving round trip. Saving rebuilds the whole
`.docx` from scratch, so anything OpenWord doesn't understand is gone rather
than carried through:

- Headers, footers, footnotes, endnotes, and page setup (size, orientation,
  margins, columns, page numbering)
- Every style except Heading 1–6. Other styles become direct formatting or
  nothing, and body text loses the default font and size the document's Normal
  style gave it
- Fields, tables of contents, cross-references, and bookmarks
- Text boxes, shapes, charts, SmartArt, and equations
- Document properties (title, author, dates), macros, and digital signatures

Some things survive but change on the way through:

- Numbered lists come back as `1. 2. 3.` — Roman numerals and lettering aren't
  preserved
- Highlight colors snap to Word's 16 named colors; every underline style and
  double strikethrough flattens to a single underline or single strike
- Table column widths are dropped, and saved tables get plain grey borders
- Indents are rounded to quarter-inch steps
- WebP, TIFF and SVG images open fine but are dropped when you save

> **The first time you save a document you opened from `.docx`, OpenWord warns
> you** and offers to save it as `.owdoc` instead, which keeps everything above.
> If OpenWord cannot read a `.docx` at all, it tells you so and refuses to open
> it, rather than showing you a blank page you might save over.

Treat `.docx` as an exchange format: fine for drafting and sharing plain
documents, not a safe home for a heavily formatted one. Keep the original.

### Other gaps

- **No ODT.** OpenDocument files can't be opened or saved.
- **No PDF export.** Use Print → *Microsoft Print to PDF* in the meantime.
- **Pagination moves whole paragraphs, not lines.** A paragraph that won't fit
  in the rest of a page jumps to the next one instead of splitting at the
  break, and anything taller than a full page — a long table, a large image —
  overflows the page edge rather than breaking.
- **No headers, footers, page numbers, footnotes, endnotes, sections or
  columns** in the editor either. Page size is Letter or A4, margins fixed at
  1 inch.
- **Tables can gain and lose rows and columns, but cells can't be merged.**
- **No mail merge, table of contents, citations, or grammar checking.**
- **No macros**, and no plans for them.

The longer-term answer to most of the fidelity items above is a LibreOffice
Writer engine, which is partly built in this repository but not yet shippable.
See [the Writer engine track](docs/building.md#the-writer-engine-track).

## Keyboard shortcuts

On macOS, use <kbd>Cmd</kbd> wherever this table says <kbd>Ctrl</kbd>.

| Action | Shortcut |
| --- | --- |
| New / Open / Save / Save As | <kbd>Ctrl</kbd>+<kbd>N</kbd> / <kbd>O</kbd> / <kbd>S</kbd> / <kbd>Shift</kbd>+<kbd>S</kbd> |
| Print | <kbd>Ctrl</kbd>+<kbd>P</kbd> |
| Undo / Redo | <kbd>Ctrl</kbd>+<kbd>Z</kbd> / <kbd>Ctrl</kbd>+<kbd>Y</kbd> |
| Bold / Italic / Underline | <kbd>Ctrl</kbd>+<kbd>B</kbd> / <kbd>I</kbd> / <kbd>U</kbd> |
| Clear formatting | <kbd>Ctrl</kbd>+<kbd>\\</kbd> |
| Align left / center / right / justify | <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>L</kbd> / <kbd>E</kbd> / <kbd>R</kbd> / <kbd>J</kbd> |
| Bulleted list / Numbered list | <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>8</kbd> / <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>7</kbd> |
| Increase / decrease indent | <kbd>Tab</kbd> / <kbd>Shift</kbd>+<kbd>Tab</kbd> |
| Find / Find and replace | <kbd>Ctrl</kbd>+<kbd>F</kbd> / <kbd>Ctrl</kbd>+<kbd>H</kbd> |
| Insert link / comment | <kbd>Ctrl</kbd>+<kbd>K</kbd> / <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>M</kbd> |
| Page break | <kbd>Ctrl</kbd>+<kbd>Enter</kbd> |
| Line break (same paragraph) | <kbd>Shift</kbd>+<kbd>Enter</kbd> |
| Word count | <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>C</kbd> |
| Zoom in / out / reset | <kbd>Ctrl</kbd>+<kbd>+</kbd> / <kbd>Ctrl</kbd>+<kbd>-</kbd> / <kbd>Ctrl</kbd>+<kbd>0</kbd> |

## Contributing

Bug reports and pull requests are welcome. Two quick asks: open an issue before
starting anything large, and don't add features the code can't actually deliver
— an honest gap beats a menu item that does nothing.

```bash
npm install
npm run tauri dev
```

Full setup, prerequisites, test commands, packaging, and the house rules are in
**[docs/building.md](docs/building.md)**.

Anything that needs the network — cloud sync, AI assistance, real-time
collaboration — belongs in [`plugins/`](plugins/README.md) as an opt-in module,
never in the core app.

## Project documentation

- [docs/building.md](docs/building.md) — build, test, package, contribute
- [ARCHITECTURE.md](ARCHITECTURE.md) — how the editor, document model and shell fit together
- [engine/README.md](engine/README.md) — the pinned LibreOffice WebAssembly toolchain
- [docs/web-hosting.md](docs/web-hosting.md) — the planned browser deployment
- [plugins/README.md](plugins/README.md) — the core/optional boundary

## License

[Apache License 2.0](LICENSE).

OpenWord builds on ProseMirror, Svelte, Tauri, and the `docx` and `jszip`
packages, among others; each keeps its own license. The name OpenWord implies
no endorsement by Microsoft or The Document Foundation.
