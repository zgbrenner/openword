# OpenWord

A free, open-source word processor for people who feel stuck picking
between Google Docs and Microsoft Word.

The one non-negotiable: **the baseline app is genuinely lightweight** — fast
to launch, small on disk, no bundled cruft — while still covering everything
you expect from a real word processor: bold/italic/underline, fonts and
styles, headings, lists, tables, images, real reflowed page-based layout,
comments, track changes ("suggesting" mode with accept/reject), find &
replace, format painter, and Word (`.docx`) compatibility — including
comments and tracked changes round-tripping through real OOXML, not just
OpenWord's own format. It looks and works like the word processors you
already know — this isn't a redesign exercise.

Anything heavier — AI writing assistance, cloud storage sync, real-time
collaboration — is an opt-in add-on, never baked into the core. See
[ARCHITECTURE.md](./ARCHITECTURE.md) for the full reasoning and the research
that informed these choices.

## Status

Early baseline under active development. Core editing, the Word-familiar UI
shell, reflowed pagination, comments, track changes, and `.docx` import/
export (including comments and tracked changes) are all in place; see
`ARCHITECTURE.md`'s "roadmap" notes for known gaps (line-level pagination
splitting, headers/footers, unmodeled-XML passthrough, ODT support).

## Tech stack

- [Tauri 2](https://tauri.app/) (Rust) — native shell, ~30-40MB idle RAM vs.
  Electron's 100MB+, because it drives the OS's own webview instead of
  bundling a browser.
- [Svelte](https://svelte.dev/) + TypeScript + [Vite](https://vitejs.dev/) —
  frontend, chosen for near-zero runtime overhead.
- [ProseMirror](https://prosemirror.net/) — the editing engine, the same
  proven foundation more ambitious projects like SuperDoc build on.
- Apache-2.0 licensed.

## Getting started

Prerequisites: [Node.js](https://nodejs.org/) 18+, [Rust](https://rustup.rs/),
and Tauri's platform build dependencies (see the
[Tauri prerequisites guide](https://tauri.app/start/prerequisites/) — on
Linux this means `webkit2gtk`, `libappindicator3`, `librsvg2`, and friends).

```bash
npm install
npm run tauri dev    # launches the desktop app with hot reload
```

Frontend-only development (no Rust/Tauri required, useful for fast UI
iteration — Tauri-specific features like native menus and file dialogs are
feature-detected and simply no-op outside the Tauri shell):

```bash
npm run dev           # Vite dev server at http://localhost:1420
```

Checks:

```bash
npm run check          # svelte-check (TypeScript + Svelte)
cd src-tauri && cargo check   # Rust
```

Build a release bundle for your platform:

```bash
npm run tauri build
```

## Project layout

```
src/                 # frontend — the whole editing UI (Svelte + TS)
  editor/             # ProseMirror schema, commands, keymap, pagination,
                       # comments, track changes
  components/         # Toolbar, Ruler, PageCanvas, StatusBar, FindReplace,
                       # ReviewPanel (comments + track changes)
  docx/               # .docx import/export
  lib/                # editor controller, file I/O, view state
src-tauri/            # Rust shell — native menu, file I/O, window
plugins/              # NOT built by default — future opt-in modules
```

## Contributing

Issues and pull requests welcome. If you're picking a first task, the
"roadmap" callouts in `ARCHITECTURE.md` (line-level pagination splitting,
unmodeled-XML passthrough for full OOXML fidelity, headers/footers, ODT
support) are good places to start.
