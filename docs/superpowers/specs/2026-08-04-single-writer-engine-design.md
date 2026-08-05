# OpenWord Single Writer Engine Design

**Date:** 2026-08-04  
**Status:** Approved for implementation planning  
**Decision owner:** OpenWord project

## 1. Goal

Replace OpenWord's custom ProseMirror document engine with one extensible Writer-class engine based on LibreOffice Writer, delivered locally through a custom LibreOffice WebAssembly build and controlled through zetajs/UNO.

OpenWord will keep its Tauri shell and Svelte interface, but LibreOffice Writer will become the sole editable document model, layout engine, pagination engine, and format-filter engine.

The product should behave as closely as practical to Microsoft Word while retaining OpenWord's clean visual identity, local-first operation, open-source licensing, and ability to improve document fidelity in the same engine over time.

## 2. Non-negotiable decisions

1. **One engine only.** OpenWord will not ship separate lightweight and fidelity editing modes.
2. **Writer owns the document.** The canonical editable state is LibreOffice Writer's internal document model, not a ProseMirror tree or a parallel OpenWord model.
3. **ZetaOffice is a delivery bridge, not a second engine.** LOWA provides the browser/WebAssembly build of LibreOffice, while zetajs exposes UNO control to JavaScript.
4. **Microsoft Word supplies the interaction model.** LibreOffice supplies layout and file fidelity, but OpenWord's menus, ribbon, keyboard behavior, contextual tools, panes, and terminology should follow Word where the two products differ.
5. **No macro execution or arbitrary UNO extensions.** OpenWord may preserve macro and extension payloads for round-trip fidelity but must not execute or load them.
6. **Local by default.** The core editor must not require a server, CDN, account, or network connection.
7. **No silent fidelity claims.** Unsupported or normalized document content must be surfaced through tests and, where user-relevant, a document compatibility report.

## 3. Selected engine

### 3.1 LibreOffice Writer core

OpenWord will fork and pin the LibreOffice Writer code needed for:

- Writer's document model
- line layout and pagination
- page styles, sections, columns, headers, and footers
- tables, frames, anchored objects, fields, notes, references, indexes, and review data
- ODF import/export
- OOXML import/export
- legacy Word and rich-text import/export where supported by Writer
- PDF export and print-layout generation
- language, spellcheck, and hyphenation hooks

The fork will remain close to upstream LibreOffice. OpenWord-specific changes to Writer should be narrow, test-backed, and organized as a patch series or clearly separated commits so upstream updates remain feasible.

### 3.2 LOWA and zetajs host

The initial shipping host will be a local Writer-only LibreOffice WebAssembly build:

- LOWA renders the Writer UI surface into a canvas in the Tauri webview.
- Writer runs in its worker context rather than in Svelte's main UI thread.
- zetajs exposes UNO objects, dispatch commands, and status listeners to the worker-side OpenWord bridge.
- A typed message protocol connects the worker-side bridge to the Svelte application.
- All runtime assets are bundled with OpenWord. CDN loading is forbidden in production.
- The build must not enable proxy POSIX sockets or any other network transport.

A future native LibreOfficeKit host may replace WebAssembly for performance or accessibility reasons, but it must implement the same OpenWord bridge contract and must not introduce a second document engine.

## 4. High-level architecture

```text
OpenWord desktop application
├── Tauri shell
│   ├── native window and menus
│   ├── native file dialogs and filesystem access
│   ├── atomic autosave and crash recovery
│   ├── print integration
│   └── local runtime asset serving
├── Svelte application UI
│   ├── Word-style ribbon and backstage
│   ├── contextual tabs
│   ├── navigation and review panes
│   ├── dialogs and inspectors
│   └── status bar
├── OpenWord Writer bridge
│   ├── typed command API
│   ├── typed query API
│   ├── status subscriptions
│   ├── lifecycle and error protocol
│   └── file transfer protocol
└── OpenWord Writer core
    ├── LibreOffice Writer document model
    ├── Writer layout and pagination
    ├── Writer import/export filters
    ├── Writer review and field systems
    └── LOWA/zetajs runtime host
```

There is no ProseMirror editing path after migration is complete.

## 5. Repository and source organization

The application repository will contain the OpenWord shell, bridge, UI, runtime manifest, build scripts, patches, and tests. The full LibreOffice source tree will not be copied into the application repository.

```text
openword/
  engine/
    README.md
    manifest.json
    patches/
    scripts/
    licenses/
  public/writer-runtime/        # generated or downloaded pinned artifacts, ignored when appropriate
  src/writer/
    protocol.ts
    client.ts
    state.ts
    commands/
    host/
  src/components/ribbon/
  src/components/panes/
  src/components/dialogs/
  tests/
    bridge/
    integration/
    fidelity/
    fixtures/
  docs/superpowers/
```

`engine/manifest.json` will pin exact LibreOffice, zetajs, Emscripten, and Qt source revisions plus artifact hashes. Reproducible scripts will build or fetch only those pinned revisions.

LibreOffice source modifications will live in a dedicated OpenWord Writer-core fork. The OpenWord application repository will pin that fork by exact commit and keep any integration-only patch series under `engine/patches/`.

## 6. Bridge contract

Svelte components must never scatter raw UNO service names or `.uno:*` strings throughout the interface. All engine communication passes through a typed OpenWord contract.

Representative public API:

```ts
export interface WriterClient {
  start(): Promise<void>;
  createDocument(options?: CreateDocumentOptions): Promise<DocumentSession>;
  openDocument(source: DocumentSource): Promise<DocumentSession>;
  execute(command: WriterCommand): Promise<CommandResult>;
  query<T extends WriterQuery>(query: T): Promise<WriterQueryResult<T>>;
  subscribe(listener: (event: WriterEvent) => void): () => void;
  save(target?: DocumentTarget): Promise<SaveResult>;
  exportDocument(target: ExportTarget): Promise<ExportResult>;
  close(): Promise<void>;
}
```

The bridge maps semantic OpenWord commands to UNO dispatches or direct UNO service calls. Examples:

```ts
{ type: "format.toggleBold" }
{ type: "paragraph.setAlignment", alignment: "justify" }
{ type: "layout.setColumns", count: 2 }
{ type: "header.enable", pageStyleId: "Default Page Style" }
{ type: "review.acceptChange", changeId: "..." }
{ type: "field.insertPageNumber" }
```

The bridge must also publish authoritative state for:

- selection formatting
- current paragraph and style
- active page style and section
- table, image, shape, header/footer, citation, and review context
- document dirty state
- page and word counts
- undo/redo availability
- compatibility warnings
- engine lifecycle and failure state

## 7. File model and supported formats

### 7.1 Primary formats

- `.docx` is the default format for new general-purpose documents because it best matches Microsoft Word user expectations.
- `.odt` is a first-class native format with no artificial feature restrictions.
- Existing documents retain their original format when saved unless the user explicitly chooses Save As.

### 7.2 Additional formats

OpenWord may expose other Writer-supported formats, including `.doc`, `.rtf`, `.txt`, `.html`, `.ott`, `.dotx`, and PDF export, only after fixture-based verification establishes acceptable behavior.

### 7.3 Native OpenWord format

`.owdoc` will not remain the canonical editing format. Existing `.owdoc` files will be supported through a migration importer that creates an equivalent Writer document.

Migration behavior:

1. Open the legacy ProseMirror JSON envelope with a quarantined importer.
2. Convert supported blocks, marks, tables, images, comments, and tracked changes into Writer structures.
3. Display a migration report for content that cannot be represented exactly.
4. Require the migrated document to be saved as `.docx` or `.odt`.
5. Never write new `.owdoc` files after the engine transition.

The old ProseMirror engine may remain temporarily in the source tree only to support migration tests and conversion. It must not remain reachable as an editor mode.

## 8. Pagination and page layout

Writer's layout engine replaces OpenWord's custom pagination plugin entirely.

This supplies one coherent layout calculation for:

- line-level paragraph splitting
- widow and orphan rules
- keep-with-next and keep-lines-together behavior
- page and section breaks
- first, odd, and even page styles
- multi-column sections
- multi-page tables and row splitting
- footnotes and endnotes
- floating frames and anchored objects
- text wrapping around objects
- page numbering
- print layout and PDF export

The Svelte layer does not recreate page geometry. It hosts and frames Writer's rendered canvas, overlays OpenWord interaction affordances only where necessary, and consumes page state through the bridge.

## 9. Headers, footers, sections, and page styles

OpenWord will preserve Writer's page-style model internally while presenting Word-like behavior.

Required interactions:

- Double-click the top or bottom page margin to enter header or footer editing.
- Show a contextual **Header & Footer** ribbon tab.
- Support Different First Page.
- Support Different Odd & Even Pages.
- Support Link to Previous across sections.
- Allow independent section page orientation, margins, columns, numbering, and headers/footers.
- Insert page number, page count, date, filename, document properties, fields, tables, and images in headers and footers.
- Exit header/footer editing with Escape, a close control, or double-clicking document body content.

Where Writer and Word use different internal concepts, the bridge translates the Word-facing command into the correct Writer page-style and section operations.

## 10. ODT and OOXML fidelity

### 10.1 ODT

ODT support uses Writer's native ODF model and filters. The fidelity corpus must cover:

- named and automatic styles
- master pages and page layouts
- sections and columns
- headers and footers
- fields and variables
- notes, references, indexes, and bibliographies
- tracked changes and annotations
- forms and embedded objects
- foreign namespaces and package entries

### 10.2 DOCX

DOCX support uses Writer's OOXML filters. The fidelity corpus must cover:

- styles and numbering inheritance
- sections and page settings
- headers and footers
- fields and content controls
- comments and tracked changes
- tables, floating objects, shapes, text boxes, and drawing relationships
- footnotes, endnotes, references, captions, and indexes
- embedded and linked objects
- custom XML and vendor extensions

### 10.3 Unmodeled XML and package passthrough

Unknown package data must be preserved inside the same Writer engine and filter pipeline, not in a second editor model.

Implementation direction:

1. Reuse Writer's existing interoperability metadata channels where they preserve foreign attributes and structures.
2. Extend import filters to attach unsupported XML fragments, relationships, and package parts to stable Writer document objects or document-level interoperability storage.
3. Extend export filters to reinsert preserved content when its anchor still exists.
4. Preserve unknown ZIP entries and relationships that remain untouched by an edit.
5. Detect anchor deletion or structural conflicts and record a compatibility warning rather than silently dropping data.
6. Keep opaque macro and script payloads disabled and non-executable while allowing byte-preserving round trips where safe.

The engine must classify round-trip outcomes as:

- preserved unchanged
- understood and rewritten
- normalized by Writer
- conflicted and not safely reattached

## 11. Microsoft Word-style interface

### 11.1 Main ribbon

The primary tabs are:

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

The first implementation does not need every control visible at once. Controls are grouped and disclosed using Word's hierarchy, with overflow handling for narrow windows.

### 11.2 Contextual tabs

Contextual tabs appear only when relevant:

- Table Design
- Table Layout
- Picture Format
- Shape Format
- Header & Footer
- Chart Design
- Equation

### 11.3 Core interaction decisions

- Quick Access Toolbar contains Save, Undo, and Redo by default.
- The File tab opens a backstage screen for New, Open, Save, Save As, Export, Print, document information, and recovery.
- A Navigation pane supports headings, pages, and search.
- Review uses margin balloons and a review pane rather than LibreOffice's default sidebar.
- Status bar shows page, word count, language, review state, view mode, and zoom.
- Keyboard shortcuts follow Microsoft Word where practical and do not conflict with operating-system conventions.
- Terminology shown to users follows Word unless doing so would be misleading about behavior.
- Advanced options use focused dialogs or contextual panes, not a permanently crowded interface.

### 11.4 Beautification direction

The visual pass must remain restrained:

- neutral application chrome
- white pages on a subtle gray canvas
- consistent Fluent-style iconography
- compact controls with clear focus states
- minimal separators and borders
- no gradients or decorative cards
- no imitation of LibreOffice's toolbar or sidebar appearance
- responsive ribbon collapse rather than uncontrolled wrapping
- accessible contrast, keyboard navigation, and visible focus

## 12. Security boundary

The Writer runtime is powerful and must be treated as untrusted document-processing code.

Required controls:

- Production LOWA build excludes proxy socket support and network features.
- Tauri content security policy blocks remote scripts, frames, fonts, and network requests by default.
- Basic, Python, Java, JavaScript, and other document macro execution is disabled.
- Arbitrary UNO extension installation and loading is disabled.
- Embedded scripts may be preserved only as inert package payloads.
- External links, remote images, and linked objects are not fetched automatically.
- Password prompts and protected-document handling occur through explicit OpenWord dialogs.
- File parsing and conversion run outside the Svelte main thread.
- Engine crashes or hangs must not corrupt the original file.
- Autosave uses atomic temporary files and generation-stamped recovery snapshots.
- Importers enforce package-entry, expanded-size, nesting, and resource limits to reduce ZIP-bomb and malformed-file risk.

## 13. Error handling and recovery

### 13.1 Engine startup failure

OpenWord displays a blocking recovery screen with:

- failure category
- retry action
- diagnostic log export
- safe restart action
- access to recovery documents

It must not fall back to a different editor engine.

### 13.2 Document open failure

The original file remains untouched. OpenWord offers:

- retry
- open read-only when Writer permits
- export diagnostic information
- open a recovered autosave when available

### 13.3 Save failure

Saving uses a staging file followed by atomic replacement. On failure:

- the original file remains intact
- the staged file is retained for recovery
- the document stays dirty
- the user receives an actionable error with Save As and diagnostic options

### 13.4 Engine crash

Tauri detects worker/runtime termination, preserves the latest recovery generation, restarts the Writer runtime, and offers to reopen the recovered document. OpenWord never reports a successful save until the final target has been written and verified.

## 14. Licensing and distribution

- OpenWord-authored shell, bridge, and UI code remains Apache-2.0.
- zetajs is consumed under MIT terms.
- LibreOffice code and OpenWord modifications to covered LibreOffice files are distributed under the applicable LibreOffice/MPL 2.0 terms.
- The installer and About screen include all required notices and licenses.
- Source for distributed modified LibreOffice components is made available in the manner required by the applicable licenses.
- Runtime manifests record the exact source revisions used for every release.
- OpenWord branding must not imply endorsement by The Document Foundation, LibreOffice, Allotropia, or Microsoft.

## 15. Testing and fidelity program

Full Writer parity is defined by measurable fixtures, not feature labels.

### 15.1 Test layers

1. **Bridge unit tests** verify semantic commands, payload validation, state mapping, and error mapping.
2. **Engine integration tests** open documents, issue commands, save, reopen, and inspect resulting Writer state.
3. **Package round-trip tests** compare ZIP entries, relationships, XML, binary payloads, and compatibility classifications.
4. **Visual layout tests** export reference PDFs and compare page count, page geometry, text placement, and rendered differences.
5. **Cross-application tests** exercise LibreOffice to OpenWord to LibreOffice and Word to OpenWord to Word workflows.
6. **Migration tests** convert every supported legacy `.owdoc` structure and verify the compatibility report.
7. **Security tests** verify macro refusal, extension refusal, blocked network access, malformed archive limits, and recovery behavior.
8. **Performance tests** record cold start, warm start, document open, save, idle memory, and large-document editing behavior.

### 15.2 Fixture categories

The committed corpus must include:

- paragraphs with complex scripts and mixed fonts
- long paragraphs split across pages
- widow/orphan and keep rules
- nested lists and numbering restarts
- tables crossing pages
- sections, columns, and page-style transitions
- first/odd/even headers and footers
- footnotes, endnotes, citations, indexes, and cross-references
- comments and every tracked-change category
- images, shapes, text boxes, frames, and wrapping
- fields, content controls, forms, and document properties
- embedded and opaque package parts
- malformed and adversarial files

### 15.3 Release gates

The old ProseMirror editor can be removed only after all of these are true:

- Writer canvas opens and edits new documents.
- `.docx` and `.odt` open, save, and reopen through Writer.
- Save, Save As, autosave, crash recovery, print, and PDF export work through the single engine.
- Core Home, Insert, Layout, Review, and View commands are wired through the typed bridge.
- Legacy `.owdoc` migration is tested.
- Macro execution and extension loading are blocked.
- Fidelity fixtures identify regressions without relying on manual inspection.

No release may regress accepted fidelity fixtures or worsen the previous accepted cold-start, open, save, or idle-memory baseline by more than 15 percent without an explicit documented exception.

## 16. Migration sequence

The engine replacement will be delivered as vertical, runnable milestones:

1. Reproducible pinned Writer-only LOWA build and license bundle.
2. Embedded Writer canvas in Tauri with engine lifecycle reporting.
3. Typed command, query, and status bridge with basic editing.
4. Native open/save/autosave/recovery for DOCX and ODT.
5. Word-style Home ribbon and status bar driven by Writer state.
6. Insert, Layout, View, and contextual editing surfaces.
7. Headers, footers, sections, page styles, and Navigation pane.
8. Review, references, fields, mail merge, and advanced object surfaces.
9. Filter-level unmodeled package preservation and compatibility report.
10. Legacy `.owdoc` migration and removal of the ProseMirror editor.
11. Restrained full-interface beautification and accessibility pass.
12. Fidelity, security, and performance release gate.

Each milestone must leave the branch runnable and independently testable.

## 17. Success criteria

The design succeeds when:

- users edit every document through one Writer engine
- line-level pagination and page layout come from Writer rather than OpenWord CSS approximations
- ODT is native and DOCX uses Writer's mature OOXML filters
- headers, footers, sections, fields, review data, tables, notes, and anchored objects remain part of one document model
- unsupported XML and package data are preserved or explicitly classified instead of silently discarded
- the interface feels familiar to Microsoft Word users without copying Word branding
- macros and UNO extensions cannot execute
- OpenWord works fully offline after installation
- engine source revisions and distributed modifications are reproducible and license-compliant
- fidelity claims are backed by committed, automated fixtures

## 18. Research basis

Primary references used for this design:

- zetajs repository and documentation: https://github.com/allotropia/zetajs
- zetajs standalone Writer example: https://github.com/allotropia/zetajs/tree/main/examples/standalone
- zetajs web-office example: https://github.com/allotropia/zetajs/tree/main/examples/web-office
- LibreOffice WebAssembly build documentation: https://git.libreoffice.org/core/+/refs/heads/master/static/README.wasm.md
- LibreOffice licensing: https://www.libreoffice.org/licenses/
- LibreOffice UNO API documentation: https://api.libreoffice.org/
- Microsoft Word support documentation for sections, headers, footers, ribbon behavior, and review workflows: https://support.microsoft.com/word
