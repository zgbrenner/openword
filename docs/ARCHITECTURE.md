# OpenWord architecture

## Purpose

OpenWord is structured around one rule: editing, persistence, and conversion are separate concerns. The editor should not understand filesystem APIs, converters should not mutate workspace state, and the desktop shell should not own document semantics.

## System overview

```text
┌──────────────────────────────────────────────────────────────┐
│ React application shell                                     │
│ title bar · ribbon · tabs · sidebars · dialogs · status bar │
└───────────────────────────┬──────────────────────────────────┘
                            │ typed commands and selectors
┌───────────────────────────▼──────────────────────────────────┐
│ Tiptap editor and Zustand workspace                          │
│ active rich tree · open tabs · dirty state · UI preferences │
└──────────────┬───────────────────────────────┬───────────────┘
               │                               │
┌──────────────▼──────────────┐   ┌────────────▼───────────────┐
│ Versioned document services │   │ Platform adapter            │
│ model · migrations · stats │   │ browser picker/download     │
│ comments · recovery         │   │ Tauri dialog/filesystem     │
└──────────────┬──────────────┘   └────────────┬───────────────┘
               │                               │
┌──────────────▼───────────────────────────────▼───────────────┐
│ Format adapters                                             │
│ OpenWord · DOCX · Markdown · HTML · text · print/PDF        │
└──────────────────────────────────────────────────────────────┘
```

## Native model

`OpenWordDocument` is defined in `src/core/document/model.ts`. It wraps a ProseMirror-compatible JSON tree with:

- Schema version and stable document ID
- Title, author, and timestamps
- Body, header, and footer rich-content trees
- Page size, orientation, and margins
- Comment threads
- Document settings
- Source-format metadata
- Compatibility warnings

A document entering the application through `.openword` or recovery storage is passed through `migrateDocument()`. Migration validates the envelope, upgrades older shapes, normalizes body/header/footer content, and reports simplification. The editor never receives arbitrary native JSON directly.

## Editor boundary

`DocumentEditor.tsx` owns the Tiptap lifecycle. It receives one active tab, creates the editor using `createEditorExtensions()`, and emits normalized JSON updates to the store.

Custom extensions provide:

- `pageBreak`, an explicit block node
- `comment`, an inline mark linked to a thread ID
- Paragraph layout attributes for styles, indentation, and spacing
- A local-data image node with width and height

The editor does not open or save files. It only reads and writes the native rich-content tree.

## Workspace state

`workspaceStore.ts` manages:

- Open tabs and active selection
- Dirty and saved state
- File descriptors
- Recent files
- Ribbon, sidebar, theme, layout, focus, and zoom preferences
- Page settings and comment-thread mutations
- Debounced recovery snapshots

Store actions are intentionally document-oriented. Components should not reach into nested state and mutate a document directly.

## File platform

`src/core/platform/files.ts` selects one of two implementations at runtime:

- Tauri dialogs plus filesystem APIs in the desktop application
- Browser file inputs plus downloads during web development

This keeps the interface testable and allows the frontend to run without a native shell. Browser mode cannot reopen an absolute recent path or reveal a file in its operating-system folder.

## Conversion pipeline

All adapters return either an `ImportResult` or `ExportResult`.

```text
untrusted bytes or text
        │
        ▼
format-specific parser
        │
        ▼
sanitize / normalize / migrate
        │
        ▼
OpenWordDocument + warnings
```

Export is the reverse:

```text
OpenWordDocument
        │
        ▼
format adapter
        │
        ├── bytes or text
        └── format warnings

prior import warnings + new format warnings
        │
        ▼
explicit user confirmation before non-native overwrite
```

### DOCX

DOCX import uses Mammoth for semantic OOXML conversion, embeds supported images as data URLs, disables external-file access, sanitizes generated HTML, and records both a baseline semantic-import warning and converter messages.

DOCX export maps the normalized tree into `docx` objects. It handles common paragraphs, headings, inline marks, hyperlinks, lists, task items, tables, images, page breaks, page geometry, headers, footers, and page numbers. Unsupported nodes and OpenWord-native comment threads produce warnings.

### Markdown and HTML

Markdown is parsed to HTML, sanitized, then converted to the native tree. Export passes the native tree through HTML and Turndown with custom page-break, comment-anchor, underline, and highlight rules.

HTML import and export share the same native conversion functions. Remote images are removed during import so opening a document cannot contact a tracking server.

## Recovery

Dirty documents are serialized to local recovery storage after a debounce. Recovery is best-effort and must never interrupt editing. Startup restores valid snapshots as dirty tabs and ignores malformed records. Explicit save and confirmed close remove the corresponding snapshot.

Recovery is not version history. It stores only a bounded set of recent unsaved snapshots.

## Security model

The trust boundary sits before the native model:

- HTML is sanitized with an allowlist
- Native nodes, marks, links, image sources, and CSS-like values are normalized
- DOCX external-file access is disabled
- Remote images are not loaded on import
- Tauri capabilities grant only required file, dialog, and opener operations
- The content security policy blocks remote runtime assets and embedded objects

See `SECURITY.md` for reporting and scope.

## Performance principles

- Only the active document has a live Tiptap editor instance
- Inactive documents remain JSON in the store
- Recovery is debounced
- Expensive derived structures, such as command lists and heading outlines, are computed only when editor state changes
- Heavy format conversion happens only when a user imports or exports
- Third-party editor and conversion packages are isolated from ordinary shell components

## Extension points

Future providers should attach through explicit interfaces:

- OOXML preservation metadata in the native envelope
- Collaboration and synchronization providers
- Grammar and language services
- Citation and bibliography engines
- Template packs
- Optional local or API-based writing assistance

None should require replacing the editor, workspace store, or file adapter.
