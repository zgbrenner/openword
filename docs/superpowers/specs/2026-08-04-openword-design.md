# OpenWord product and architecture design

Date: 2026-08-04
Status: Approved by delegated product judgment

## 1. Product definition

OpenWord is a local-first, cross-platform word processor packaged with Tauri. It should feel familiar to users of Microsoft Word and Google Docs while remaining fast, private, understandable, and substantially less bloated.

OpenWord is not a Markdown editor wearing a Word-like toolbar. It uses a versioned rich-document model as its native source of truth and exposes Markdown as a first-class editing and interchange format. This prevents DOCX-only structures from being silently destroyed when a document passes through Markdown.

## 2. Product principles

1. **Local first.** Documents and autosave snapshots remain on the device unless a future synchronization provider is explicitly enabled.
2. **Fast by default.** The editor loads only the active document and uses the operating system webview through Tauri rather than bundling Chromium.
3. **Familiar without cloning bloat.** The main interface uses a compact ribbon, page canvas, navigation panel, review panel, and status bar. Advanced tools stay discoverable through tabs and a command palette rather than permanently occupying screen space.
4. **No dishonest round-trip promises.** Native `.openword` files are lossless. DOCX and Markdown conversion reports warnings when unsupported structures may change.
5. **Open formats.** The native file is versioned JSON with a documented schema. DOCX, Markdown, HTML, and plain text remain import/export formats.
6. **Offline capable.** Core editing and conversion do not depend on a server or API key.
7. **Extensible boundaries.** File formats, collaboration, AI assistance, grammar checking, citations, and templates communicate through explicit adapters rather than being embedded in the editor core.

## 3. Chosen approach

### Recommended architecture: rich native model plus format adapters

OpenWord will use a ProseMirror-compatible JSON tree, wrapped in an `OpenWordDocument` envelope that stores metadata, page setup, headers and footers, comments, document settings, and compatibility warnings.

This is preferred over two rejected alternatives:

- **Markdown as the canonical format:** exceptionally simple and portable, but incapable of representing Word sections, tracked revisions, comments, page geometry, positioned objects, or most advanced tables.
- **DOCX as the live in-memory model:** offers the best fidelity but makes every editing operation dependent on OOXML details, sharply increasing complexity and preventing a clean web editor architecture.

A future high-fidelity OOXML preservation adapter can retain unsupported DOCX package parts beside the normalized model and reapply untouched parts during export. The adapter boundary is reserved now so that this can be added without rewriting the editor.

## 4. Technology stack

- **Desktop shell:** Tauri 2 and Rust
- **Frontend:** React, TypeScript, and Vite
- **Editor engine:** Tiptap/ProseMirror open-source extensions plus OpenWord-specific nodes and marks
- **DOCX import:** Mammoth, with imported HTML sanitized before insertion
- **DOCX export:** `docx`, generated from the normalized document model
- **Markdown import/export:** Marked and Turndown with GitHub-flavored Markdown extensions
- **Native file operations:** Tauri dialog and filesystem plugins, behind a browser-compatible platform adapter
- **Testing:** Vitest and Testing Library for model, converter, command, and component behavior
- **Styling:** hand-authored CSS variables and components; no runtime design-system dependency
- **Icons:** Lucide React

All chosen core dependencies use permissive open-source licenses.

## 5. Native document model

```ts
interface OpenWordDocument {
  schemaVersion: 1;
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  author?: string;
  content: ProseMirrorJSON;
  page: {
    size: "letter" | "a4" | "legal" | "custom";
    orientation: "portrait" | "landscape";
    marginsInches: { top: number; right: number; bottom: number; left: number };
    customWidthInches?: number;
    customHeightInches?: number;
  };
  header: ProseMirrorJSON;
  footer: ProseMirrorJSON;
  comments: CommentThread[];
  settings: {
    defaultFontFamily: string;
    defaultFontSizePt: number;
    spellcheck: boolean;
    showFormattingMarks: boolean;
  };
  source?: {
    format: "openword" | "docx" | "markdown" | "html" | "text";
    path?: string;
    importedAt?: string;
  };
  compatibilityWarnings: CompatibilityWarning[];
}
```

Every schema change must use a migration. Unknown future fields are preserved where practical.

## 6. Editor capabilities in the foundation release

### File and document management

- New, open, save, save as, recent-document recovery, and autosave snapshots
- Native `.openword` read/write
- DOCX, Markdown, HTML, and TXT import
- DOCX, Markdown, HTML, TXT, and print-to-PDF export
- Browser fallback for development and hosted demos
- Conversion warning panel
- Multiple document tabs

### Writing and formatting

- Undo and redo
- Normal text, title, subtitle, headings 1–6, blockquote, and code block styles
- Bold, italic, underline, strikethrough, inline code, superscript, and subscript
- Font family, font size, text color, and highlight color
- Alignment, indentation, line height, and paragraph spacing
- Bulleted, numbered, and task lists
- Links, horizontal rules, hard breaks, and page breaks
- Tables with row/column insertion and deletion, cell merge/split, and header-row controls
- Images from local files and clipboard-compatible data URLs
- Keyboard shortcuts and command palette

### Navigation, review, and productivity

- Heading outline
- Word, character, paragraph, and reading-time statistics
- Find and replace
- Inline comments with a review sidebar
- Document properties and page setup
- Zoom, print layout, web layout, focus mode, and dark mode
- Formatting-mark display
- Built-in templates for blank documents, reports, letters, legal memoranda, and meeting notes

### Accessibility

- Keyboard-operable controls
- Visible focus states
- Labels and tooltips for icon-only controls
- Semantic status messages
- Reduced-motion support
- Native spellcheck where the platform webview provides it

## 7. UI structure

1. **Title bar and quick access:** document name, dirty state, save, undo, redo, search, and window drag region.
2. **Ribbon:** File, Home, Insert, Layout, Review, and View tabs. Each tab contains compact command groups.
3. **Document tabs:** switch between open files and create a new one.
4. **Workspace:** optional navigation sidebar, centered page canvas, optional review/sidebar inspector.
5. **Status bar:** page approximation, language, word count, save state, layout mode, and zoom.
6. **Backstage:** new/open/recent/templates/export/document information.
7. **Command palette:** searchable access to all commands without requiring permanent toolbar space.

The interface should be professional and calm rather than a visual replica of Microsoft Word. It may borrow established interaction conventions but must maintain its own identity.

## 8. Data and command flow

- UI commands call a typed command registry.
- Formatting commands operate only through the editor abstraction.
- File commands operate through the platform adapter.
- Converters accept and return the versioned native model.
- Autosave serializes the native model after a debounce and never mutates the user’s source file silently.
- Explicit save writes the selected target format and surfaces conversion warnings before destructive export.

## 9. Error handling

- User-facing failures appear as actionable notices, not raw exceptions.
- Conversion failures preserve the current document and include the source file name.
- Imported HTML is sanitized and external file access is disabled.
- Large or malformed DOCX files are rejected with a size-aware message rather than freezing indefinitely where feasible.
- Save operations use a temporary in-memory representation and update the active path only after a successful write.
- Unsaved tabs require confirmation before closing.
- Autosave failures do not block editing and are reflected in the save-state indicator.

## 10. Security and privacy

- No analytics or telemetry in the foundation release.
- No remote fonts, scripts, or runtime CDN assets.
- Imported HTML is sanitized with an explicit allowlist.
- Tauri capabilities grant only the file and dialog access needed by the application.
- Links use safe protocols and open through the operating system handler.
- DOCX import disables external-file access.
- Application state stores recent paths and recovery snapshots, not document contents beyond the local recovery cache.

## 11. Testing and release gates

A release is blocked unless all applicable checks pass locally:

- TypeScript type checking
- ESLint
- Vitest unit and component tests
- Vite production build
- Rust formatting and `cargo check`
- Manual smoke test of new, edit, save, reopen, DOCX import/export, Markdown import/export, comments, tables, images, search, and print

GitHub Actions are intentionally not configured. `npm run verify` provides the reproducible local gate.

## 12. Scope boundaries and staged fidelity

A single implementation cannot instantly equal decades of Microsoft Word development. The foundation release delivers a complete, useful professional editor and reserves stable boundaries for the most difficult capabilities.

The following are subsequent compatibility milestones rather than foundation-release promises:

1. Direct preservation of unsupported OOXML package parts during DOCX round trips
2. True section-aware pagination, widow/orphan control, and anchored floating objects
3. Full tracked-change semantics and change comparison
4. Footnotes, endnotes, citations, bibliography fields, cross-references, and mail merge
5. Real-time coauthoring and remote version history through optional providers
6. Accessibility conformance audit and platform-specific installer signing

These features must extend the native model through migrations and adapters rather than bypassing it.

## 13. Success criteria for the first shipped repository state

- The app launches in browser development mode and through Tauri.
- A user can create a document, apply professional formatting, insert tables/images/page breaks, add comments, search and replace, and switch layout modes.
- A user can import DOCX/Markdown/HTML/TXT and export DOCX/Markdown/HTML/TXT/PDF through the system print dialog.
- Recovery snapshots protect unsaved work.
- The code is modular, typed, tested, documented, and contains no GitHub Actions workflow.
- The README accurately distinguishes implemented behavior from planned high-fidelity Word compatibility.
