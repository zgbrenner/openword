# OpenWord

OpenWord is a local-first, open-source word processor built with Tauri, React, TypeScript, and Tiptap. It combines a familiar ribbon workspace with a small desktop shell, professional document tools, and honest format conversion.

The native `.openword` format is the lossless source of truth. DOCX, Markdown, HTML, and text are import and export formats. OpenWord reports compatibility risks before a non-native save rather than pretending every Word feature can survive conversion.

## Current status

OpenWord 0.1 is a substantial foundation release candidate, not a claim of complete Microsoft Word parity. The application code includes a professional editing workspace and broad format support. True section-aware pagination, perfect OOXML round trips, tracked changes, citations, and real-time coauthoring remain later milestones.

### Implemented

- Tauri 2 desktop shell with a browser development fallback
- Compact ribbon with File, Home, Insert, Layout, Review, and View surfaces
- Multiple open documents with tabs, dirty-state tracking, recent files, and crash recovery
- Rich text editing with undo and redo
- Paragraph styles, title, subtitle, headings 1 through 6, quotes, and code blocks
- Bold, italic, underline, strikethrough, inline code, superscript, and subscript
- Font family, font size, text color, highlight color, alignment, indentation, line spacing, and paragraph spacing
- Bulleted, numbered, nested, and task lists
- Tables with row and column operations, merge and split, and header cells
- Local images from the file picker, paste, and drag and drop
- Links, dates, horizontal rules, hard breaks, and page breaks
- Letter, A4, legal, custom paper, orientation, and margin controls
- Text headers and footers with DOCX export
- Heading navigation, find and replace, command palette, word statistics, zoom, focus mode, dark mode, and formatting marks
- Inline comment anchors, threaded replies, resolve and reopen controls, and a review sidebar
- Built-in templates for reports, letters, legal memoranda, meeting notes, and blank documents
- Native `.openword` import and export
- DOCX import and export
- Markdown, HTML, and plain-text import and export
- Print and operating-system PDF output
- Conversion warnings that combine import losses with export limitations before overwriting a non-native format
- Sanitization of imported HTML and native document content
- No telemetry, cloud dependency, remote runtime assets, or GitHub Actions workflows

### Deliberately not claimed yet

- Pixel-perfect preservation of every DOCX package part
- True automatic page pagination inside the editor
- Per-section headers, footers, columns, page numbering rules, and mixed page geometry
- Floating text boxes, WordArt, SmartArt, embedded objects, macros, and arbitrary OOXML fields
- Native Word comment threads and tracked-change semantics
- Footnotes, endnotes, citations, bibliography management, cross-references, and mail merge
- Live multi-user editing, cloud sync, or remote version history
- Signed installers or automatic updates

See [the roadmap](docs/ROADMAP.md) for the planned fidelity and collaboration work.

## Why `.openword` exists

Markdown cannot represent all of a professional word-processing document, and editing raw OOXML directly makes ordinary editing far more fragile. OpenWord therefore stores a versioned rich-document tree plus page settings, headers, footers, comments, source metadata, and compatibility warnings.

This provides three practical guarantees:

1. Saving as `.openword` preserves everything OpenWord currently understands.
2. Importers normalize untrusted content before it reaches the editor.
3. Exporters warn when the destination format cannot preserve something.

The format is documented in [docs/FORMATS.md](docs/FORMATS.md).

## Quick start

### Prerequisites

- A current Node.js LTS release
- npm
- The current stable Rust toolchain
- Platform prerequisites required by Tauri 2

### Browser development

```bash
npm install
npm run dev
```

The browser build uses standard file pickers and downloads. Desktop-only behaviors such as reopening a recent absolute path and revealing a file in its folder are disabled in browser mode.

### Desktop development

```bash
npm install
npm run tauri dev
```

### Build installers

```bash
npm install
npm run tauri build
```

Tauri writes platform bundles under `src-tauri/target/release/bundle/`.

## Verification

Frontend checks:

```bash
npm run verify:frontend
```

Full frontend and Tauri checks:

```bash
npm run verify
```

The full gate runs TypeScript checking, ESLint, Vitest, the production frontend build, Rust formatting, and `cargo check`. It fails rather than reporting success when Rust is unavailable.

GitHub Actions are intentionally absent. Contributors must run the local gate before opening or merging a pull request.

## Keyboard shortcuts

| Action | Windows and Linux | macOS |
|---|---:|---:|
| Open | `Ctrl+O` | `Cmd+O` |
| Save | `Ctrl+S` | `Cmd+S` |
| Save as | `Ctrl+Shift+S` | `Cmd+Shift+S` |
| Print or PDF | `Ctrl+P` | `Cmd+P` |
| Command palette | `Ctrl+K` | `Cmd+K` |
| Find and replace | `Ctrl+H` | `Cmd+H` |
| Bold | `Ctrl+B` | `Cmd+B` |
| Italic | `Ctrl+I` | `Cmd+I` |
| Underline | `Ctrl+U` | `Cmd+U` |
| Page break | `Ctrl+Enter` | `Cmd+Enter` |
| Undo | `Ctrl+Z` | `Cmd+Z` |
| Redo | `Ctrl+Y` | `Cmd+Shift+Z` |

## Repository structure

```text
src/app/                 Application composition and shortcuts
src/components/          Ribbon, editor, shell, sidebars, dialogs, and status UI
src/core/document/       Native model, migrations, templates, comments, and utilities
src/core/formats/        OpenWord, DOCX, Markdown, HTML, and text adapters
src/core/platform/       Browser and Tauri file operations
src/core/security/       Import sanitization
src/core/storage/        Recovery snapshots
src/store/               Multi-document workspace state
src/styles/              Design tokens, application chrome, editor, dialogs, and print
src-tauri/               Rust desktop shell, capabilities, configuration, and icons
docs/                    Architecture, formats, roadmap, and user documentation
```

Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) before changing the document model or conversion pipeline.

## Privacy and security

OpenWord has no analytics or telemetry. Core editing and conversion run locally. Imported HTML is sanitized, DOCX external-file access is disabled, remote images are removed on import, native files are normalized through an allowlist, and Tauri permissions are limited to the file, dialog, and opener capabilities the application uses.

Security reports should follow [SECURITY.md](SECURITY.md).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). The project favors focused modules, explicit migrations, test-first changes, and honest compatibility reporting.

## License

OpenWord is licensed under the [MIT License](LICENSE).
