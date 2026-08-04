# Contributing to OpenWord

OpenWord welcomes focused bug fixes, tests, format improvements, accessibility work, and carefully scoped editor features.

## Ground rules

- Keep `.openword` as the canonical lossless model.
- Do not route document content through Markdown as an internal shortcut.
- Add a schema migration for every native-format change.
- Never silently drop content during conversion. Preserve it, simplify it with a warning, or reject it with an actionable error.
- Keep core editing and conversion offline-capable.
- Do not add telemetry, remote runtime assets, or a required cloud service.
- Do not add GitHub Actions workflows. The project uses a local verification gate.
- Prefer small modules with explicit interfaces over large components with mixed responsibilities.

## Development setup

```bash
npm install
npm run dev
```

For desktop work:

```bash
npm run tauri dev
```

## Test-first workflow

For behavior changes:

1. Add the smallest test that demonstrates the expected behavior.
2. Run it and confirm it fails for the intended reason.
3. Implement the minimal correction.
4. Run focused tests, then the complete local gate.
5. Refactor only while tests remain green.

Useful commands:

```bash
npm run check
npm run lint
npm run test
npm run build
npm run verify:frontend
npm run verify
```

`npm run verify` requires Rust and performs the frontend checks plus `cargo fmt --check` and `cargo check`.

## Pull requests

A pull request should include:

- The user-visible problem and behavior
- The architectural boundary being changed
- Test evidence
- Conversion or migration implications
- Screenshots for visible UI changes
- Any remaining limitation stated plainly

Do not describe a converter as lossless unless a fixture proves the complete round trip for the claimed structures.

## Document-model changes

Changes to `OpenWordDocument` require:

- Incrementing the schema version when persisted shape changes
- A migration from every supported older version
- Tests for malformed, older, current, and future-version input
- A note in `docs/FORMATS.md`
- A changelog entry

Unknown content should be preserved where safely possible. Unsafe or unsupported content must be normalized with a compatibility warning.

## Format-adapter changes

Import and export adapters live under `src/core/formats/`. They must return explicit warnings for unsupported constructs. Importers must sanitize or normalize untrusted content before it reaches Tiptap.

DOCX fixtures should be small, redistributable, and created specifically for this project. Do not commit confidential or copyrighted user documents.

## Accessibility

All icon-only controls need accessible names. Interactive elements must be keyboard reachable, expose visible focus states, and avoid requiring motion. Test both light and dark themes when modifying shared colors.

## Commit style

Use concise conventional prefixes where practical:

- `feat:` new behavior
- `fix:` corrected behavior
- `test:` tests only
- `docs:` documentation
- `refactor:` no intended behavior change
- `chore:` tooling or maintenance
