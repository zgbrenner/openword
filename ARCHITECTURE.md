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
| DOCX I/O | Custom module in `src/docx/` using `JSZip` (archive layer) + the browser's native `DOMParser`/`XMLSerializer` (no extra XML dependency needed — the webview already has one) | Parse → model → edit → serialize pattern with unmodeled-node passthrough. See DOCX fidelity roadmap below. |
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
directly. Attempting to fake that in v1 would produce a half-working,
editing-breaking feature, which fails the "always works" requirement worse
than being upfront about scope.

**v1 (shipped in this baseline):** a single continuous, fully-editable
ProseMirror surface rendered as one flowing document, with **live visual
page-boundary rendering** — the canvas is measured continuously and drawn as
a stack of page-sized "paper" sheets on a gray background, with page-break
shadows/gaps at accurate page-height intervals (accounting for margins),
recalculated on every edit. Word count, page count, and page size (Letter/A4)
all work correctly. What this doesn't yet do: intelligently avoid splitting
a table row or a heading-from-its-paragraph across a page boundary.

**v2 (roadmap):** move to a reflowed multi-container layout (page N gets its
own DOM subtree, content nodes are measured and assigned to pages, with
whole-block-node overflow to the next page as an intermediate step before
full line-level reflow) — the SuperDoc-style architecture, built
independently under Apache-2.0.

## DOCX fidelity — current approach and roadmap

**v1:** `src/docx/export.ts` and `src/docx/import.ts` implement a real
parse→model→serialize pipeline for the common case (paragraphs, headings,
runs with standard character formatting, lists, tables, inline images,
hyperlinks) using JSZip + DOMParser directly against the OOXML the docx
format actually is. Unrecognized XML parts (custom XML, embedded fonts,
uncommon elements) are round-tripped: **stored verbatim and re-emitted
unchanged** rather than dropped, following the mitigation pattern every
credible fidelity-focused project uses. OpenWord's own native save format
(`.owdoc`, a JSON serialization of the ProseMirror document) is the format
with zero fidelity loss — DOCX is treated as an interchange format, same as
it is for every other word processor.

**v2 (roadmap):** expand OOXML element coverage (tracked changes, comments,
section breaks, complex numbering), track fidelity regressions with an
automated round-trip test corpus (a goal explicitly called out by our
research as release-blocking once the project matures past baseline).

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
  review panel) and round-trip through OpenWord's own `.owdoc` format.
  Real-time multi-user collaboration on either is not implemented — the
  "author" is just a locally-set display name, there's no live sync.
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
- **Format painter** isn't implemented yet.
