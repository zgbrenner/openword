# Building OpenWord from source

This is the contributor guide. If you just want to use OpenWord, grab an
installer from the [Releases page](https://github.com/zgbrenner/openword/releases)
instead — see the [README](../README.md).

## Prerequisites

- **Node.js 22 or newer**, with npm.
- **Rust** (stable), installed via [rustup](https://rustup.rs).
- **Tauri v2 platform dependencies.** Follow
  [Tauri's prerequisites guide](https://v2.tauri.app/start/prerequisites/)
  for your OS. In short:
  - **Windows** — Microsoft C++ Build Tools (the "Desktop development with
    C++" workload) and the WebView2 runtime, which is already present on
    Windows 10 21H2 and later.
  - **macOS** — Xcode Command Line Tools (`xcode-select --install`).
  - **Linux** — `libwebkit2gtk-4.1-dev`, `libappindicator3-dev`,
    `librsvg2-dev`, `patchelf`, `libssl-dev`, `libgtk-3-dev`. The exact apt
    list CI uses is in [`.github/workflows/ci.yml`](../.github/workflows/ci.yml).

You do **not** need the LibreOffice Writer WebAssembly runtime to build or run
the app. That is a separate, optional track — see
[The Writer engine track](#the-writer-engine-track) below.

## Run it

```bash
npm install
npm run tauri dev
```

That builds the Svelte frontend, compiles the Rust shell, and opens the app
with hot reload on the frontend.

To iterate on the UI alone in a plain browser tab, without waiting for Rust to
compile:

```bash
npm run dev   # http://localhost:1420
```

The editor itself is fully functional there — storage routes through
`src/platform/`, which falls back to the browser's File System Access API or
the Origin Private File System. What you don't get is the native OS menu bar,
native file dialogs, or file associations.

## Checks and tests

```bash
npm run check     # svelte-check + TypeScript across the frontend
npm test          # test suites
```

And for the Rust shell:

```bash
cd src-tauri
cargo check
cargo clippy --no-deps -- -D warnings
cargo test
```

CI runs the same commands on every pull request. See
[`.github/workflows/ci.yml`](../.github/workflows/ci.yml).

## Build installers

```bash
npm run tauri build
```

Artifacts land in `src-tauri/target/release/bundle/`. On Windows that is an
NSIS installer under `nsis/` and an MSI under `msi/`. Tauri does not
cross-compile — each platform's installers must be built on that platform,
which is why releases are produced by CI runners rather than one machine.

`bundle.targets` in `src-tauri/tauri.conf.json` is currently pinned to
`["nsis", "msi"]`, matching the Windows-only first release. On macOS or Linux,
`npm run tauri dev` and `npm run tauri build` still compile and run the app,
but you'll need to widen that list (or pass `--bundles`) to get a native
installer out of it.

Release builds are currently **unsigned**. Code signing certificates for
Windows and Apple notarization are open items; until they are in place,
installers trigger an OS warning on first run.

## Repository layout

| Path | What's in it |
| --- | --- |
| `src/editor/` | Document schema, editing commands, keymap, pagination, track changes, comments |
| `src/docx/` | `.docx` import and export (built on the `docx` and `jszip` npm packages) |
| `src/lib/` | Editor controller, file I/O, find & replace, menu definition, view state |
| `src/components/` | Svelte UI — toolbar, ruler, page canvas, status bar, find bar, review panel |
| `src/platform/` | Thin abstraction over desktop (Tauri) vs. browser storage backends |
| `src-tauri/` | Rust shell: window, native menus, file associations, permissions |
| `tests/` | Test suites |
| `engine/` | Pinned LibreOffice WebAssembly toolchain (optional track, see below) |
| `src/writer/` | Typed bridge to the LibreOffice Writer engine (optional track) |
| `worker/`, `wrangler.toml` | Cloudflare Workers deployment for the web build |
| `plugins/` | Opt-in modules for anything that needs the network — empty by design |
| `docs/` | This guide, plus web hosting notes and design specs |

## House rules

A few constraints are structural rather than stylistic, and pull requests that
break them will be sent back:

- **The core app makes no network requests.** `src-tauri/Cargo.toml` has no
  HTTP client and must never gain one; the Tauri capability file grants local
  file I/O and dialogs only. Anything that needs the network — cloud sync, AI
  assistance, real-time collaboration — belongs in `plugins/` as an opt-in
  module. See [`plugins/README.md`](../plugins/README.md).
- **Keep the baseline light.** New runtime dependencies in the core need a
  reason that a user would recognize as worth the download size.
- **Don't claim features that aren't implemented.** Menu items that do
  nothing, or toolbar buttons that open placeholder dialogs, are worse than
  their absence.

## The Writer engine track

OpenWord contains a second, unshipped document engine: a Writer-only
LibreOffice WebAssembly build (LOWA), driven through zetajs and a typed UNO
bridge in `src/writer/`. The intent is to eventually get LibreOffice-grade
DOCX and ODT fidelity, page styles, headers and footers, footnotes, fields and
PDF export without rebuilding decades of document-engine work.

It is not part of the shipping app, for one blunt reason: the runtime is not
in the repository and cannot practically be built by most contributors. The
reproducible build targets Linux x86_64 and LibreOffice's own WebAssembly
documentation warns that linking needs roughly 64 GiB of RAM, so the wrapper
script refuses hosts below a ~60 GiB baseline rather than failing hours into a
link step.

If you do have such a machine:

```bash
npm run engine:lock      # refresh engine/runtime.lock.json (review every commit change)
npm run engine:build     # build the runtime into public/writer-runtime/
npm run engine:verify    # check provenance, byte sizes, and SHA-256 hashes
npm run build:desktop:engine   # frontend build gated on a verified runtime
```

The generated runtime lands in `public/writer-runtime/` and is deliberately
gitignored. See [`engine/README.md`](../engine/README.md) for the full build
contract and [`ARCHITECTURE.md`](../ARCHITECTURE.md) for the design.

Both shells live in the same build and the choice is made at runtime, so a
packaged app that never loads the runtime costs nothing extra. Append
`?shell=writer` to the URL to mount the Writer shell (the choice is remembered,
since the desktop window has no address bar); `?shell=editor` clears it again.
See `src/lib/shellMode.ts`.

The **web build** (`npm run build:web`, deployed via `worker/index.ts`) also
depends on that runtime, which is why there is no live OpenWord website yet.
[`docs/web-hosting.md`](./web-hosting.md) documents the intended Cloudflare
Workers + R2 deployment for when there is.

## Licensing

OpenWord is [Apache-2.0](../LICENSE). Contributions are accepted under the
same license.
