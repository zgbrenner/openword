<!--
PR titles must be conventional commits, e.g. `feat: add a page-number field`.
Allowed types: build, chore, ci, docs, feat, fix, perf, refactor, revert,
style, test, types. The `PR title` check enforces this.
-->

## What changed

<!-- One or two sentences. What does this do that the code did not do before? -->

## Why

<!-- Link the issue if there is one: Closes #123 -->

## How it was verified

<!--
Say what you actually ran, not what you intended to run. "npm test passes" is
a claim; paste the counts if it helps.
-->

- [ ] `npm run check` and `npm run check:worker`
- [ ] `npm test` (Writer contract suite + editor suite)
- [ ] `npm run build`
- [ ] `cargo clippy --no-deps -- -D warnings` in `src-tauri/` (if Rust changed)
- [ ] Ran the app and used the changed surface by hand (if UI changed)

## Scope check

- [ ] No network-capable crate was added to `src-tauri/Cargo.toml`. That crate
      is deliberately incapable of making network requests; anything that talks
      to the network belongs in `plugins/`.
- [ ] No placeholder menu items, buttons, or commands that do not do the thing
      they say they do.
- [ ] The Writer runtime contract (`engine/manifest.json`,
      `engine/runtime.lock.json`) is untouched, or the change is explained
      above.

## Notes for the reviewer

<!-- Anything you are unsure about, or deliberately left for a follow-up. -->
