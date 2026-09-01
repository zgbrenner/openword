# Contributing to OpenWord

Thanks for looking. OpenWord is a local-first word processor: a Svelte 5 + Vite
frontend, a small Rust/Tauri v2 desktop shell, and a Cloudflare Workers build
of the same app for the browser.

## Before you write code

Read [`ARCHITECTURE.md`](../ARCHITECTURE.md). It explains the single-Writer-engine
design and why the project says no to things that look reasonable in isolation.

Two constraints are not negotiable, because the whole value proposition rests
on them:

1. **The core app makes no network requests.** `src-tauri/Cargo.toml` has no
   HTTP client and must never gain one. Cloud sync, LLM assistance, collaboration
   and anything else that talks to a server belongs in a separate crate under
   `plugins/`.
2. **Nothing pretends to work.** No placeholder menu items, no buttons that open
   a "coming soon" dialog, no commands that silently do nothing. If the Writer
   engine cannot do it yet, the control does not ship yet. This is why
   `tests/writer/native-menu-surface.test.mjs` exists.

## Setting up

```bash
npm ci
npm run dev          # frontend only, http://localhost:1420
npm run tauri dev    # the desktop app (needs a Rust toolchain)
```

Node 22 or 24, and a stable Rust toolchain for the desktop shell. Full build
instructions, including the platform prerequisites, are in
[`docs/building.md`](../docs/building.md).

The Writer WASM runtime (`soffice.wasm`, `soffice.data`) is **not** in this
repository — it is hundreds of megabytes. The desktop app builds and packages
without it; the browser build (`npm run build:web`) does not, because it starts
with `npm run engine:verify`.

## Before you open a pull request

Run what CI runs:

```bash
npm run check          # svelte-check
npm run check:worker   # tsc over worker/
npm test               # tests/writer/ + tests/editor/
npm run build

cd src-tauri
cargo fmt --all
cargo clippy --no-deps -- -D warnings
cargo test
```

`npm run tauri build` packages the desktop app end to end; CI does this on
Windows for every pull request, so you do not have to unless you changed the
packaging itself.

## Commit and pull request titles

Both follow [Conventional Commits](https://www.conventionalcommits.org/). The
`PR title` workflow enforces the type on pull request titles.

Types in use here: `build`, `chore`, `ci`, `docs`, `feat`, `fix`, `perf`,
`refactor`, `revert`, `style`, `test`, `types`.

```
feat: add a page-number field to the header editor
fix: keep the selection anchored after a track-changes reject
test: cover the Writer review command registry
build: hash the Writer page-style policy
```

Subjects are lowercase, imperative, and have no trailing period. Keep commits
small enough that the subject can be honest about all of them.

## How changes are reviewed

- **Tests first where it is a contract.** A lot of this repository's behaviour
  is pinned by tests that describe the surface before it exists (see the
  `test:`-prefixed commits). If you are adding a Writer command, a menu item, or
  a ribbon control, add the contract test in the same PR.
- **Say what you actually verified.** The PR template asks how you tested it.
  "Should work" is not a verification. If something is untested, say so.
- **Cross-platform matters.** CI compiles the Rust shell on Linux, Windows and
  macOS. Only Windows is packaged and released today.

## What tends to get rejected

- Anything that adds a network dependency to the core app.
- New document engines, or format handling that bypasses the Writer engine.
- Features that only work for a demo — half-wired menus, dialogs with no
  backing command, controls whose state does not reflect the document.
- Large dependency additions for small conveniences. The installer being a few
  megabytes is a feature.

## Reporting bugs and requesting features

Use the [issue templates](https://github.com/zgbrenner/openword/issues/new/choose).
Security problems go through [`SECURITY.md`](SECURITY.md) instead — never a
public issue.

## Licence

By contributing you agree that your contributions are licensed under the
[Apache License 2.0](../LICENSE), the same as the rest of the project.
