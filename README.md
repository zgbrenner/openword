# OpenWord

OpenWord is a local-first, open-source word processor built around one document engine: **LibreOffice Writer**.

LibreOffice supplies the document model, line layout, pagination, ODT support, Microsoft Word filters, page styles, headers and footers, fields, tables, notes, review data, and print layout. OpenWord replaces the surrounding interface with a cleaner Microsoft Word-style desktop experience built with Tauri and Svelte.

OpenWord does not execute document macros or load arbitrary UNO extensions. The baseline editor requires no account, cloud service, CDN, or document server.

## Current status

The repository is undergoing an engine transition from its original ProseMirror prototype to a Writer-only architecture.

Implemented on the Writer foundation branch:

- A local threaded LibreOffice WebAssembly host using LOWA and zetajs
- A typed semantic command and state bridge instead of scattered raw UNO calls
- Writer-native line-level pagination and page layout
- DOCX and ODT open, save, Save As, autosave, and generation-safe recovery plumbing
- Header and footer enablement, current-region editing, Different First Page, and Different Odd & Even behavior through Writer page styles
- Bold, italic, underline, paragraph alignment, bullets, numbering, undo, redo, and page breaks
- Conservative package passthrough for opaque DOCX and ODT ZIP parts
- DOCX relationship/content-type and ODT manifest repair for restored or removed parts
- Compatibility reporting for restored data, Writer conflicts, invalidated signatures, blocked executable payloads, and cross-format omissions
- One-way migration of legacy `.owdoc` files into Writer, requiring Save As to DOCX or ODT
- A restrained Svelte shell and status UI

Still incomplete:

- The large Writer WASM runtime has not been committed to Git. It must be built from the pinned source lock on a suitable machine.
- Full end-to-end desktop compilation and runtime testing remain required after installing that runtime.
- Unknown foreign elements embedded inside Writer-owned XML are not yet fully preserved. The current passthrough layer preserves opaque package parts and repairs package metadata; deeper filter-level interoperability work remains.
- The Word-style ribbon, navigation pane, review interface, references, mail merge, print integration, accessibility validation, and full fidelity corpus remain under development.

This branch should not be described as release-ready until the pinned Writer runtime builds, the desktop application compiles, and the fidelity fixtures pass.

## Parallel website version

The same application also runs as a pure-browser website with no server component. One build serves both: the shell feature-detects the Tauri bridge at runtime and selects the matching storage backend behind a typed platform layer.

- The interface, ribbon, Writer engine, document lifecycle, and package-fidelity behavior are identical to the desktop version. The website adds an in-app menu bar and keyboard accelerators that mirror the native menus.
- Documents persist to browser storage: File System Access handles save in place on Chromium; other browsers keep documents in the Origin Private File System with download-based export.
- Autosave and crash recovery use the same generation-safe snapshot flow, stored atomically in IndexedDB.
- A service worker caches the app shell and the Writer runtime with the browser Cache API, so the site works fully offline after the first visit, and injects the cross-origin-isolation headers on static hosts that cannot set them.

```bash
npm run build:web    # builds dist-web/ (requires the Writer runtime)
npm run preview:web  # serves the built site locally
```

See [`docs/web-hosting.md`](./docs/web-hosting.md) for deployment headers, offline behavior, browser support, and privacy details.

## Architecture

```text
OpenWord
├── Tauri native shell
├── Svelte Microsoft Word-style interface
├── Typed OpenWord Writer bridge
└── LibreOffice Writer
    ├── document model
    ├── line layout and pagination
    ├── ODF and OOXML filters
    ├── page styles and headers/footers
    └── local LOWA/zetajs WebAssembly host
```

There is no second editing engine. The original ProseMirror code remains temporarily only for the quarantined one-way `.owdoc` migration importer and will be reduced further after migration fixtures are complete.

See [ARCHITECTURE.md](./ARCHITECTURE.md) and the approved design in [`docs/superpowers/specs/2026-08-04-single-writer-engine-design.md`](./docs/superpowers/specs/2026-08-04-single-writer-engine-design.md).

## Runtime requirements

The Writer runtime is generated from exact source revisions recorded in:

- `engine/manifest.json`
- `engine/runtime.lock.json`

The reproducible build currently targets Linux x86_64. LibreOffice WebAssembly linking requires a high-memory builder; the repository wrapper enforces a 64 GiB-class host rather than failing late during the link.

```bash
npm install
npm run engine:build
npm run engine:verify
```

The generated runtime is installed under `public/writer-runtime/` and is intentionally ignored by Git. Runtime verification checks source provenance, byte sizes, and SHA-256 hashes before desktop packaging.

See [`engine/README.md`](./engine/README.md) for the complete build contract.

## Development

Prerequisites for the application shell:

- Node.js
- Rust
- Tauri platform dependencies
- A verified local Writer runtime

```bash
npm install
npm run test:writer
npm run check
cd src-tauri && cargo check
npm run tauri dev
```

Desktop packaging is deliberately gated:

```bash
npm run tauri build
```

Before Tauri builds, OpenWord verifies the Writer runtime provenance, runs Writer contract tests, and compiles the Svelte application.

## Project layout

```text
engine/                         pinned Writer toolchain, scripts, notices
public/writer-runtime/          generated LOWA assets + committed bridge policy
src/writer/                     typed bridge, state, file, recovery, fidelity layers
src/components/                 OpenWord interface around the Writer canvas
src/editor/ and src/docx/       legacy migration-only code during transition
src-tauri/                      native shell, menus, associations, permissions
tests/writer/                   bridge, page-style, migration, and fidelity contracts
docs/superpowers/               approved design and implementation plans
```

## Security boundary

- No remote Writer runtime or CDN assets
- No proxy POSIX sockets or runtime network transport
- No macro execution
- No arbitrary UNO extension loading
- External document resources are not fetched automatically
- Invalidated signatures are removed from rewritten packages
- Executable package payloads are quarantined
- Saves use staged files and rollback backups
- Recovery snapshots use generation-stamped documents and atomic pointer replacement

## Licensing

- OpenWord-authored shell, bridge, and interface code: Apache License 2.0
- zetajs: MIT License
- LibreOffice Writer and covered modifications: applicable LibreOffice and MPL 2.0 terms
- Bundled toolchain, fonts, dictionaries, and libraries: their respective upstream licenses

OpenWord branding does not imply endorsement by The Document Foundation, LibreOffice, Allotropia, or Microsoft.
