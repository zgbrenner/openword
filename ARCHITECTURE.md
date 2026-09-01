# OpenWord Architecture

## Mission

OpenWord is a local-first, open-source word processor intended to provide the document fidelity and professional capabilities people expect from Microsoft Word without inheriting LibreOffice's interface complexity or requiring a cloud service.

The project has two non-negotiable product principles:

1. **One document engine.** LibreOffice Writer is the sole editable document model, layout engine, pagination engine, and format-filter engine.
2. **Familiar, restrained interaction.** OpenWord presents Writer through a clean Microsoft Word-style interface rather than exposing LibreOffice menus, toolbars, sidebars, or terminology directly.

The original promise of an extremely small editor engine was incompatible with Writer-level document fidelity. OpenWord still keeps its Tauri and Svelte shell disciplined, local, and modular, but it does not misrepresent a full Writer runtime as tiny.

## Architecture decision

OpenWord embeds a Writer-only LibreOffice WebAssembly build, commonly called LOWA, in the Tauri webview. `zetajs` exposes LibreOffice's UNO APIs to a worker-side OpenWord bridge. The Svelte application communicates with that bridge through a typed semantic protocol.

```text
OpenWord desktop application
├── Tauri shell
│   ├── native windows and menus
│   ├── native file dialogs and associations
│   ├── staged filesystem writes
│   ├── crash-recovery storage
│   └── local security headers and permissions
├── Svelte interface
│   ├── Word-style commands and contextual controls
│   ├── Writer canvas host
│   ├── compatibility and recovery status
│   └── future panes and dialogs
├── Typed Writer bridge
│   ├── semantic commands
│   ├── authoritative selection state
│   ├── page-style state
│   ├── document lifecycle
│   └── virtual-file transfer
└── LibreOffice Writer
    ├── document model
    ├── line layout and pagination
    ├── ODF and OOXML filters
    ├── page styles, sections, headers, and footers
    ├── review, fields, notes, references, and indexes
    └── PDF and print-layout systems
```

There is no fallback editing engine. Startup failure produces an explicit recovery screen rather than silently opening the document in a lower-fidelity mode.

## Why Writer rather than extending ProseMirror

The initial OpenWord prototype used ProseMirror with a custom schema, custom DOCX import/export, and a measure-and-decoration pagination system. That prototype proved the shell and interaction model, but it also exposed hard architectural limits:

- Paragraphs could move only as whole blocks rather than split at rendered lines.
- Tables, footnotes, frames, fields, sections, and anchored objects required a second layout system.
- Headers and footers do not naturally belong in a single linear rich-text tree.
- High-fidelity DOCX and ODT round trips require mature import/export filters and interoperability metadata.
- Recreating Writer's feature surface would mean rebuilding decades of document-engine work.

The ProseMirror editor is therefore retired. Its code remains temporarily only for the one-way `.owdoc` migration importer. It must not be referenced by new editing features.

## Runtime hosting

### LOWA and zetajs

The initial host uses a threaded LibreOffice WebAssembly build with Qt rendering into `#qtcanvas`.

- LibreOffice runs in its worker context.
- `zetajs` maps UNO types and objects into JavaScript.
- OpenWord worker scripts receive semantic messages and call UNO dispatches or direct services.
- Svelte never receives or mutates Writer's internal document tree.
- Generated runtime assets are loaded from the packaged application only.

A future native LibreOfficeKit host may replace WebAssembly for performance or accessibility reasons, but it must implement the same OpenWord protocol and continue using the same Writer document engine.

### Cross-origin isolation

Threaded WebAssembly requires `SharedArrayBuffer`. Both Vite development responses and packaged Tauri assets set:

- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Embedder-Policy: require-corp`
- `Cross-Origin-Resource-Policy: same-origin`

The runtime host refuses to start when the webview is not cross-origin isolated.

### Source and artifact locking

`engine/manifest.json` identifies the supported source lines. `engine/runtime.lock.json` records exact commits for LibreOffice, zetajs, emsdk, the Allotropia Emscripten fork, Qt, and qtbase.

The generated runtime manifest records:

- source revisions
- artifact filenames
- byte lengths
- SHA-256 hashes

Desktop packaging fails unless source provenance and runtime hashes match.

## Platform backends

Everything below the Writer bridge is pure browser code. The only native
surface is where documents, dialogs, and recovery snapshots live, and that
surface is isolated behind one typed platform layer in `src/platform/`:

- **Desktop** (`src/platform/desktop.ts`): Tauri dialogs and filesystem
  plugins, staged sibling-file writes with backup/rename replacement, and
  generation-safe recovery files under the app-data directory.
- **Web** (`src/platform/web/`): the same application persisted to browser
  storage. File System Access handles save picked files in place (Chromium);
  browsers without a save picker keep documents in the Origin Private File
  System and hand the user downloaded copies. Recovery snapshots commit
  metadata and bytes in a single IndexedDB transaction, which provides the
  same either-old-or-new crash guarantee as the desktop pointer swap.
  Writable streams (`createWritable`) stage into a swap file and replace the
  target only on close, mirroring the desktop staged write.

Selection is a runtime feature-detect (`isTauri()`), so one build serves the
packaged desktop application and the website. The website adds an in-app
menu bar, accelerator handling, `beforeunload` close protection, PWA file
handling, and a service worker (`public/openword-sw.js`) that caches the
shell and runtime for offline use and injects the cross-origin-isolation
headers on hosts that cannot send them. Hosting requirements live in
`docs/web-hosting.md`.

The desktop principle "no CDN or remote runtime" carries over unchanged in
spirit: the website serves only its own same-origin assets, the runtime host
still refuses remote runtime URLs, and after the first load the Cache API
makes the site fully local. Documents never leave the browser.

## Typed bridge

Svelte components must not contain raw `.uno:*` strings or UNO service names.

Representative semantic commands:

```ts
{ type: "format.toggleBold" }
{ type: "paragraph.alignJustify" }
{ type: "list.toggleNumbering" }
{ type: "insert.pageBreak" }
{ type: "header.edit" }
{ type: "pageStyle.setDifferentFirstPage", enabled: true }
```

The worker maps dispatchable commands through the immutable `openword_writer_commands.js` policy. Direct page-style behavior uses the separately tested `openword_writer_page_styles.js` policy.

The bridge publishes authoritative events for:

- engine readiness and failure
- document dirty state
- character formatting
- paragraph alignment and list state
- active page style
- header and footer state
- future table, image, field, review, and section contexts

Request IDs, timeouts, error codes, and teardown behavior are centralized in `WriterClient`.

## Writer-native layout

OpenWord does not calculate page geometry in Svelte.

Writer owns:

- line-level paragraph splitting
- widow and orphan rules
- keep-with-next and keep-lines-together behavior
- page and section breaks
- columns
- page styles
- multi-page tables
- footnotes and endnotes
- frames and anchored objects
- text wrapping
- page numbering
- print layout

The canvas host only sizes the rendering surface and transfers input to Writer.

## Headers, footers, and page styles

Writer stores headers and footers on page styles. OpenWord exposes Word-facing interactions and translates them into Writer properties.

Current mappings include:

- Header enabled → `HeaderIsOn`
- Footer enabled → `FooterIsOn`
- Different First Page → inverse of `FirstIsShared`
- Different Odd & Even → inverse of `HeaderIsShared` and `FooterIsShared`

The current page style is resolved from the Writer view cursor's `PageStyleName`, then looked up in the `PageStyles` family.

`Edit Header` and `Edit Footer` first enable the missing region if necessary, then dispatch Writer's `JumpToHeader` or `JumpToFooter`. Writer therefore resolves the correct first, left, or right page variant rather than OpenWord guessing from page position.

Section-specific Word behavior remains a translation problem. New implementation must preserve Writer's real page-style and section semantics rather than storing duplicate OpenWord state.

## File lifecycle

### Supported editable formats

- DOCX is the default for new general-purpose documents.
- ODT is a first-class native format.
- Existing documents retain their format on Save.
- Save As may convert between DOCX and ODT.

Additional Writer formats are not exposed until reopen and fidelity fixtures prove acceptable behavior.

### Legacy `.owdoc`

`.owdoc` is not an editable Writer format.

The quarantined migration importer:

1. Parses the old versioned ProseMirror envelope.
2. Uses the old custom exporter once to create DOCX bytes.
3. Opens those bytes in Writer.
4. Detaches the document from the original `.owdoc` path.
5. Marks the document unsaved and requires Save As to DOCX or ODT.

OpenWord never writes new `.owdoc` files.

### Native writes

User saves follow this sequence:

1. Writer exports complete bytes into a unique Emscripten virtual path.
2. OpenWord reads the virtual bytes and removes the temporary virtual file.
3. The package-fidelity layer processes the archive.
4. OpenWord writes a unique staged file beside the target.
5. The prior target is renamed to a unique backup.
6. The staged file replaces the target.
7. The backup is removed when possible, or its path is reported to the user.

A failed replacement attempts to restore the prior target and deliberately leaves recoverable staged bytes intact.

### Recovery

Autosave uses Writer's `storeToURL` snapshot operation without changing Writer's document identity or clearing its modified state.

Each recovery generation has:

- a unique DOCX or ODT file
- immutable metadata
- an atomic current-generation pointer

The pointer is changed only after the complete recovery document exists. The prior generation is removed only after the new pointer is committed.

## Package fidelity

### Current passthrough layer

Writer remains responsible for modeled document content. OpenWord wraps Writer's exported ZIP package with a conservative preservation vault.

The vault classifies entries as:

- `writer-owned`
- `preserve-opaque`
- `drop-signature`
- `blocked-executable`

On same-format save:

- Writer's version wins for modeled or conflicting parts.
- Safe opaque parts missing from Writer output are restored byte-for-byte.
- DOCX content types and relationships are repaired for restored parts.
- ODT manifest entries are repaired for restored parts.
- Metadata references to removed signatures or executable payloads are scrubbed.
- Every outcome is recorded in an immutable compatibility report.

On cross-format Save As:

- Writer performs the conversion.
- Opaque source-format package parts are not blindly copied into the new format.
- The report identifies parts not carried across the format boundary.

### Security-sensitive package data

Rewriting a document invalidates package signatures. Signature parts and references are removed rather than falsely retained.

Executable or macro-bearing package parts are quarantined and removed from the rewritten package. OpenWord does not execute macros or arbitrary extensions.

### Remaining unmodeled-XML work

The current layer preserves opaque ZIP entries. It does not yet guarantee preservation of every unknown element or attribute embedded inside a Writer-owned XML part such as `word/document.xml` or `content.xml`.

LibreOffice already exposes document-, paragraph-, character-, style-, frame-, table-, row-, and cell-level interoperability grab bags. Deeper fidelity work should extend the import/export filters to attach unknown structures to stable Writer objects and re-emit them when their anchors survive.

Until those filter patches and fixtures pass, OpenWord must describe the feature precisely as opaque-package passthrough, not complete arbitrary-XML losslessness.

## Microsoft Word-style interface

LibreOffice supplies behavior and fidelity. Microsoft Word supplies the primary interaction model where practical.

Planned top-level organization:

- File
- Home
- Insert
- Draw
- Design
- Layout
- References
- Mailings
- Review
- View
- Help

Contextual surfaces appear only for relevant selections, such as:

- Table Design and Layout
- Picture Format
- Shape Format
- Header & Footer
- Equation
- Review

OpenWord does not expose inert controls merely to resemble a ribbon. A control appears only after its semantic command and state behavior are implemented and tested.

Visual direction:

- neutral application chrome
- white Writer pages on a subtle gray canvas
- compact controls
- consistent iconography
- minimal separators
- visible keyboard focus
- responsive overflow rather than uncontrolled wrapping
- no decorative gradients, oversized cards, or imitation of LibreOffice's toolbar styling

## Security boundary

Required properties:

- no CDN or remote runtime
- no proxy POSIX sockets
- no document macro execution
- no arbitrary UNO extension loading
- no automatic remote image or linked-object fetching
- local CSP that blocks remote scripts, frames, fonts, and connections
- strict virtual path confinement to `/tmp/openword/`
- archive path normalization
- malformed internal relationship removal
- staged saves and generation-safe recovery
- explicit diagnostics rather than silent fallback

A document parser and office engine remain large attack surfaces. The eventual release process must include malformed-package limits, fuzz-derived fixtures, runtime crash tests, and upstream LibreOffice security updates.

## Testing strategy

### Contract tests

The current `tests/writer/` suite verifies:

- semantic command registry
- runtime script ordering and provenance
- visible command surface
- page-style translation
- page-style UNO integration
- header and footer editing
- package classification
- deterministic archive vault behavior
- package passthrough wiring
- legacy migration behavior

### Required higher-level tests

Before release, add:

- real DOCX and ODT open-edit-save-reopen fixtures
- page-render PDF comparisons
- line splitting and widow/orphan fixtures
- headers and footers across sections and page variants
- table, frame, shape, footnote, field, and reference fixtures
- custom XML and foreign namespace fixtures
- macro refusal and signature invalidation fixtures
- crash and recovery tests
- large-document performance tests
- Word → OpenWord → Word workflows
- LibreOffice → OpenWord → LibreOffice workflows

Feature parity is defined by passing fixtures, not by menu labels.

## Repository boundaries

```text
engine/                         pinned source lock and runtime build system
public/writer-runtime/          generated LOWA files and committed policies
src/platform/                   desktop (Tauri) and web (browser-storage) backends
src/writer/                     bridge, lifecycle, package fidelity, recovery
src/components/                 OpenWord interface around Writer
src/editor/ and src/docx/       temporary legacy migration-only implementation
src-tauri/                      native shell and local security boundary
tests/writer/                   Writer contracts and fidelity tests
docs/superpowers/               approved specifications and plans
```

New editing behavior belongs in `src/writer/`, the Writer worker policies, or the pinned Writer-core fork. It must not extend the retired ProseMirror editor.

## Licensing

- OpenWord-authored shell, bridge, interface, and integration code: Apache License 2.0
- zetajs: MIT License
- LibreOffice and modifications to covered files: applicable LibreOffice and MPL 2.0 terms
- Qt, Emscripten, fonts, dictionaries, and bundled libraries: their upstream licenses

Every release includes exact source revisions, required notices, and a stable source location for distributed modified LibreOffice components. OpenWord branding must not imply endorsement by The Document Foundation, LibreOffice, Allotropia, or Microsoft.
