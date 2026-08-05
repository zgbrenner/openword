# OpenWord Architecture

## Mission

OpenWord is a free, open-source word processor that aims to be the default
choice for people who currently feel stuck picking between Google Docs and
Microsoft Word. The single non-negotiable constraint on every decision below:
**the baseline app must be genuinely lightweight** — fast to launch, small on
disk, low memory, no bundled cruft — while still covering the full feature
set people expect from a real word processor. Anything heavier (LLM
features, cloud storage sync, real-time collaboration) is an *optional*,
separately-installed add-on, never baked into the core.

It should look and behave like the word processors people already know.
This is not a redesign exercise — familiarity is a feature.

## Why these choices (research summary)

Before writing code we researched the existing open-source landscape so we
wouldn't reinvent solved problems. Full findings live in git history /
session notes; the short version:

- **SuperDoc** (Harbour Enterprises) is the most technically impressive
  prior art — a ProseMirror-based engine that solves real DOCX fidelity and
  page-based pagination, both genuinely hard problems. However it is
  **AGPL-3.0** (commercial license available) and pre-1.0. Taking a hard
  dependency on it for OpenWord's most central piece would (a) force
  copyleft licensing on anything linked to it, and (b) tie our roadmap to a
  young, VC-less startup's product direction — TipTap's 2025 pivot to a
  paid-cloud model is a concrete precedent for exactly that risk. **We
  study its architecture, we do not depend on its code.**
- **Univer** (Apache-2.0) and **Tiptap core** (MIT) are the two genuinely
  reusable, license-compatible open-source finds.
- **AbiWord**, **OnlyOffice**, **LibreOffice**, **WebODF/Collabora** are
  either GPL/AGPL (license-incompatible for direct reuse) or architecturally
  too heavy to embed. They're useful as *reference material* for OOXML edge
  cases and lean-plugin-architecture ideas, not as dependencies.
- No existing DOCX round-trip library (JS or Rust) preserves fidelity on
  unmodified round-trips except full document-model engines like SuperDoc.
  `docx-rs` (Rust) silently drops unrecognized XML on read — disqualifying
  for a fidelity-focused product. The correct pattern (confirmed by
  research into SuperDoc and docx-editor.dev) is
  **parse → in-memory model → edit → serialize**, where every XML node the
  editor doesn't understand is preserved and re-emitted verbatim rather than
  dropped. This lives in the same layer as the editor's document model
  (JS/TS), not split into a separate Rust engine.
- **ProseMirror** (MIT) is the right editing primitive: mature, small,
  battle-tested, and exactly what SuperDoc itself builds on. We get proven
  text-editing internals (transactions, schema, undo history, collab-ready
  data structures) for free and spend our own engineering effort only on
  what's actually OpenWord-specific: the document schema, DOCX I/O, page
  layout, and the Word-familiar UI shell.
- Editor alternatives ruled out: **Slate.js** (repo archived Feb 2026, dead),
  **CKEditor5** (pagination is a paid add-on, ~400-500KB bundle even
  trimmed), **TipTap** (pagination extension is alpha/Pro, docx pipeline is
  a paid cloud service), **Lexical** (pre-1.0, no pagination story, thin
  docx plugins).

## License

**Apache-2.0** for the OpenWord codebase itself — permissive (so anyone can
build on it, including future optional plugins that might have different
licensing needs), with an explicit patent grant (relevant since OOXML
implementation touches Microsoft's Open Specification Promise territory),
and compatible with the two reusable projects identified above (Univer,
Tiptap-core) should we ever want to pull in a specific permissively-licensed
utility.

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Shell | **Tauri 2.x** (Rust) | Native OS webview, not a bundled browser — multi-MB installers and ~30-40MB idle RAM vs Electron's 100MB+. |
| Frontend build | **Vite + TypeScript** | Fast, minimal, no framework tax. |
| UI framework | **Svelte** | Compiles away — near-zero runtime overhead, no virtual DOM, far lighter than React/Vue for a UI this size, and scales better than hand-rolled vanilla DOM as the app grows (dialogs, style galleries, comment panels). |
| Editor engine | **ProseMirror** (schema/state/view/transform/commands/keymap/history) | MIT, mature, the proven foundation SuperDoc itself uses. We own our schema and rendering. |
| Rich-text extras | `prosemirror-tables`, `prosemirror-schema-list`, `prosemirror-inputrules`, `prosemirror-dropcursor`, `prosemirror-gapcursor` | Community-maintained, MIT, no need to hand-roll table editing or list logic. |
| Track changes | `@handlewithcare/prosemirror-suggest-changes` | MIT, actively maintained, built for our exact ProseMirror peer deps. Researched rather than hand-rolled — correctly intercepting every insert/delete so deletions become marks instead of real removals is easy to get subtly wrong. See "Comments and track changes" below. |
| DOCX I/O | Custom module in `src/docx/` using `JSZip` (archive layer) + the browser's native `DOMParser`/`XMLSerializer` (no extra XML dependency needed — the webview already has one) | Parse → model → edit → serialize pattern. See DOCX fidelity roadmap below — unmodeled-node passthrough is not yet implemented. |
| Native shell / file I/O | Rust, `tauri-plugin-fs`, `tauri-plugin-dialog`, `tauri-plugin-single-instance` | Native dialogs, file associations, atomic writes for autosave. |
| Icons | Fluent UI System Icons (MIT) — Office-familiar toolbar iconography | Permissive, matches the Word/Office visual language users expect. |

## Project layout

```
openword/
  src/                    # frontend (Svelte + TS) — the whole editing UI
    editor/               # ProseMirror schema, commands, keymap, pagination
    components/           # MenuBar, Toolbar, Ruler, PageCanvas, StatusBar
    docx/                 # docx import/export (parse -> model -> serialize)
    lib/                  # Tauri API wrappers (file I/O, dialogs)
  src-tauri/              # Rust core
    src/
      main.rs             # app bootstrap
      menu.rs             # native menu bar + menu event routing
    Cargo.toml             # NOTE: intentionally has zero network deps
  plugins/                 # NOT built by default — future opt-in modules
    README.md              # documents the plugin boundary
```

## The core/optional boundary (this is the part that must never erode)

The single most important architectural rule, straight from the Tauri
research: **the core crate (`src-tauri`) must be structurally incapable of
making network requests.** Not feature-flagged off — actually absent as a
dependency. No `reqwest`, no `http`, nothing that talks to a network, ever,
in the core. This is what guarantees "lightweight by default, heavy by
choice" stays true five years from now instead of eroding one "just this
one API call" PR at a time.

Future features live in `plugins/` as separate crates/frontend chunks, each
with its own Tauri capability file granting only the permissions it needs:

- `plugins/llm-assist/` — optional AI writing assistance
- `plugins/cloud-sync/` — Google Drive / OneDrive integration
- `plugins/collab/` — real-time multiplayer editing (would pull in a CRDT
  like Yjs — deliberately not in the baseline app)

None of these exist yet. The baseline app ships with zero network code.

## Pagination — current approach and roadmap

True Word-style pagination (content reflowing across discrete, independently
laid-out pages, with per-page headers/footers, without ever splitting a
table row awkwardly) is a genuinely hard rendering problem — it's the reason
SuperDoc built a custom DOM painter instead of rendering ProseMirror's DOM
directly. A full multi-container rewrite (page N gets its own DOM subtree)
is a multi-week v3 project we're deliberately not taking on yet (see below).

**v1 (superseded):** a single continuous ProseMirror surface with a
*decorative* dashed line drawn at each page-break height. It never reserved
real vertical space, so a paragraph could visually straddle a page boundary
with no actual gap — cosmetically page-like, not actually paginated.

**v2 (shipped, this change): real reflow on one ProseMirror document.**
We kept the single-contenteditable / single-document-model architecture
(still no multi-container rewrite) but made the page break *real* using a
measure → decorate → (browser re-lays-out) technique instead of a second
rendering pass:

- `src/editor/paginationPlugin.ts` is a ProseMirror plugin whose `view()`
  hook, after every doc-changing update (throttled to one pass per
  `requestAnimationFrame`, plus a `ResizeObserver` on the editor's DOM to
  also catch async image loads/font swaps that change layout without a
  transaction), measures the actual rendered top offset and height of every
  **top-level block node** — `view.nodeDOM(pos)` for each child of
  `state.doc`, which is robust to extra sibling elements ProseMirror or
  other plugins (gapCursor) may inject, unlike indexing `view.dom.children`
  directly.
- Using `geometryFor()` from `pagination.ts`, it walks the blocks in one
  forward pass accumulating natural (undecorated) height against each
  page's content budget. A block that would cross the budget gets a
  `Decoration.node(pos, endPos, {style: 'margin-top: Npx'})` sized to land
  it exactly at the next page's content-area top — pure visual decoration,
  never touching document positions, so selection, click-to-position,
  gapCursor/dropCursor and prosemirror-tables all keep working unmodified.
  Because margin-top decorations from a prior pass are still baked into the
  live DOM when the next pass runs, that prior pass's contribution is read
  back off each block's own inline `style.marginTop` and subtracted out
  before recomputing — this is what keeps the whole thing a **single
  measure-and-decorate pass** per doc change (a small, bounded number in
  practice) instead of an iterative remeasure loop that could run away.
- An explicit `page_break` node (`Insert > Page break`) always forces the
  block *after* it onto a new page, in addition to ordinary overflow-based
  breaks — matching Word, where the break itself just sits inline and
  everything after it jumps to the next page.
- A single block taller than one full page (a huge image or table) is never
  split — it's pushed to the top of a page and then allowed to overflow
  past the following page boundary/gap. This is a deliberate, documented
  limitation (see "Known v2 gaps" below), not a bug.
- `PageCanvas.svelte` renders the page background as a stack of *separate*
  white page rectangles (`.ow-page-sheet`, one per `PaginationState.pageCount`)
  on the gray canvas background, with a real gap between them (bottom
  margin of page N + top margin of page N+1) — genuine "stack of separate
  sheets," not one continuous white column. The single ProseMirror
  content element is layered on top; because the plugin above pushes
  content out of the gap regions, no text renders in them.
- Page size (Letter/A4) and zoom changes are plain Svelte state, not
  ProseMirror transactions, so `PageCanvas.svelte` explicitly calls
  `EditorController.setPaginationGeometry()` whenever either changes,
  which re-triggers a measurement pass with the new geometry.
  `EditorController` owns a small `PaginationRuntime` control-channel
  object (not itself ProseMirror state) that survives `loadDocument()`
  rebuilding the plugin instance (e.g. File > Open), so geometry updates
  keep reaching whichever plugin instance is currently mounted.
- `PaginationState.pageCount` (read by `StatusBar.svelte`) is still the
  single source of truth for the displayed page count; it's now kept in
  sync by the plugin's own measurement pass instead of the old
  `computeBreaks()`-on-`ResizeObserver` path. `computeBreaks()` itself
  is kept in `pagination.ts` as a small, independently-correct pure-math
  helper, but is no longer used for the live render.

**Known v2 gaps**, tracked rather than silent:

- A block taller than one page (large image/table) overflows past a page
  boundary instead of being clipped or split (see above).
- No intelligent avoidance of splitting a table row, or separating a
  heading from the paragraph that follows it, across a page boundary —
  those are whole top-level blocks like any other, and only whole-block
  overflow is handled.
- The block immediately after an oversized, page-spanning block is always
  forced onto a fresh page (rather than computed exactly), since knowing
  precisely where the oversized block's bottom visually lands relative to
  the page-sheet stack would require the same line-level measurement v3
  is for.

**v3 (roadmap): true line-level splitting**, matching Word's behavior for
normal body text — a paragraph that doesn't fit in the remaining space on a
page has its *lines* split across the boundary (some lines rendered as part
of page N, the rest as part of page N+1), rather than the whole paragraph
jumping to the next page. This needs actual per-page DOM regions (page N's
lines rendered into page N's own container, not one flowing element), i.e.
the multi-region rendering SuperDoc built a custom painter for — the same
architectural line called out at the top of this section. Doing that
without breaking ProseMirror's single-document editing model (transactions,
selection, undo, collab-readiness) is the multi-week v3 project; v2's
measure-and-decorate technique intentionally stays within ProseMirror's
normal single-DOM rendering so it could be built incrementally instead.

## DOCX fidelity — current approach and roadmap

**v1 (shipped):** `src/docx/export.ts` and `src/docx/import.ts` implement a
real parse→model→serialize pipeline for the common case (paragraphs,
headings, runs with standard character formatting, lists, tables, inline
images, hyperlinks) using JSZip + DOMParser directly against the OOXML the
docx format actually is. OpenWord's own native save format (`.owdoc`, a
JSON serialization of the ProseMirror document plus the comments/
track-changes side-stores — see below) is the format with zero fidelity
loss; DOCX is treated as an interchange format, same as it is for every
other word processor.

**v2 (shipped):** comments and tracked changes now round-trip through real
OOXML — `w:commentRangeStart/End` + `w:commentReference` + `word/comments.xml`
(with reply threading via `word/commentsExtended.xml`) for comments,
`w:ins`/`w:del` (with `w:delText`) for tracked insertions/deletions, author
and date carried correctly in both directions. List numbering is now
resolved through `word/styles.xml` inheritance (a paragraph's style chain,
walking `w:basedOn`) when a paragraph has no direct `w:numPr` of its own,
not just direct paragraph-level numbering.

**v3 (roadmap, not yet done):**
- **Unmodeled-node passthrough** — unrecognized XML (custom XML parts,
  embedded fonts, uncommon elements, section breaks, headers/footers) is
  still **dropped on import**, not preserved and re-emitted. This is the
  single biggest remaining fidelity gap: a document round-tripped through
  OpenWord today will lose anything outside the elements listed above.
  Doing this properly needs a place to carry the opaque bytes across the
  import→edit→export boundary (a new field on `OwDocFile`/`LoadedDocument`,
  or schema-level attributes) — a real design task, not a quick add.
- Section breaks and headers/footers are unsupported on both import and
  export (headers/footers specifically need their own schema-level design
  first, since ProseMirror's linear doc model has no native concept of
  content that repeats per page — see Pagination above for the same
  "needs its own subsystem" shape of problem).
- Tracked-changes `modification` marks (formatting changes tracked as
  suggestions, e.g. "font size changed from 12 to 14") export as already
  applied rather than as a reviewable suggestion — OOXML's `w:rPrChange` is
  real but deep; simplified for now.
- An inserted/deleted *image* round-trips as a plain image — OOXML's
  `w:ins`/`w:del` wrap text runs, not drawings, and the `docx` library's
  insertion/deletion run types don't cover that case.
- An automated round-trip test corpus (a goal explicitly called out by our
  research as release-blocking once the project matures past baseline) still
  doesn't exist.

## Comments and track changes

Both follow the same principle as everything else here: don't reinvent a
solved problem, and don't let the document model carry data it doesn't need
to.

**Track changes** ("suggesting mode") is built on
[`@handlewithcare/prosemirror-suggest-changes`](https://www.npmjs.com/package/@handlewithcare/prosemirror-suggest-changes)
(MIT), not hand-rolled. We researched this rather than guessing: correctly
intercepting every insert/delete/paste/cut so deletions become marks instead
of real removals — while keeping selection and undo/redo sane — is exactly
the kind of thing that's easy to get subtly wrong, and a well-maintained
option existed (actively committed to, built against our exact ProseMirror
peer dependencies, genuinely embeddable as a plugin + a `dispatchTransaction`
wrapper). The library owns `insertion`/`deletion`/`modification` marks and
the transaction-rewriting logic; it only tracks a bare suggestion id, with no
concept of *who* made a change. We layer that on top ourselves in
`src/editor/trackChanges.ts`: a side-store (`SuggestionMetaStore`, keyed by
suggestion id) reconciled against the live document after every transaction,
recording `{author, date}` for ids as they first appear and pruning ids that
no longer exist (accepted, rejected, or otherwise removed) — the same
"metadata lives outside the document model" pattern used for comments below,
so the schema itself never needs to know about authorship.

**Comments** are a `comment` mark (attrs: `{id}`, `excludes: ""` so
overlapping threads with different ids can coexist on the same text — marks
of the same name exclude each other by default, which would otherwise break
overlapping comments) anchoring a text range to a `CommentThread`
(`src/editor/comments.ts`). The thread's actual content — author, text,
replies, resolved state — lives entirely outside the document, in the same
kind of side-store as track-changes metadata. A comment mark just answers
"which thread(s) does this range belong to"; nothing about *what the comment
says* is recoverable from the document alone, by design.

Both side-stores now travel with the document: `.owdoc` files are a
versioned envelope (`{version: 2, doc, comments, suggestionMeta}` — see
`src/editor/document.ts`) rather than a bare ProseMirror doc, and older
plain-doc `.owdoc` files still open correctly (detected by the absence of
the envelope). The UI is a single docked review panel
(`src/components/ReviewPanel.svelte`, toggled from the status bar) with
Comments and Changes tabs, rather than Google-Docs-style inline margin
cards — deliberately: margin cards need pixel-accurate vertical alignment
with their anchor, which depends on page layout details that are still
evolving (see Pagination above), while a panel that jumps the selection to
an anchor on click sidesteps that coupling entirely and is just as
legitimate a review UX.

## ODT support

Deferred. No existing open-source ODF library is trustworthy for round-trip
fidelity (WebODF is dormant, Rust ODF crates are immature). A one-way
"export to ODT" is a reasonable v2 target; import comes later.

## Known v1 gaps (tracked, not silent)

Being upfront about what the baseline doesn't do yet, rather than leaving a
dead button or a surprising failure:

- **Comments and track changes** work natively (add/reply/resolve comments,
  suggesting-mode insertions/deletions with accept/reject, both in a docked
  review panel) and round-trip through both OpenWord's own `.owdoc` format
  and real DOCX (`w:comment`/`w:ins`/`w:del`). Real-time multi-user
  collaboration on either is not implemented — the "author" is just a
  locally-set display name, there's no live sync.
- **Spellcheck** relies entirely on the OS/webview's native spellchecker
  (the ProseMirror content area sets `spellcheck="true"`) rather than a
  bundled dictionary/grammar engine — deliberately, to avoid bundling a
  dictionary library in the lightweight core. A real grammar checker is
  exactly the kind of heavier feature that should eventually be an optional
  plugin, not baseline weight.
- **Ruler margin dragging** (resizing page margins by dragging the ruler's
  shaded regions) isn't implemented; the ruler currently shows accurate
  geometry and supports dragging the indent marker, but margins are fixed
  at 1 inch pending Page Setup UI.
- **Reflowed pagination (v2)** doesn't split a single block (paragraph,
  table) across a page boundary — an oversized block is pushed whole to a
  page top and allowed to overflow rather than being torn mid-content. True
  line-level splitting matching Word's behavior for ordinary body text is a
  v3 item (see Pagination above).
- **Headers, footers, and section breaks** aren't implemented in the editor
  or in DOCX import/export — a repeating per-page content model needs its
  own schema-level design (see Pagination and DOCX fidelity above).
