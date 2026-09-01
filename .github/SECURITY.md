# Security policy

## Supported versions

OpenWord is pre-1.0. Only the latest release is supported; fixes land on `main`
and go out in the next release rather than being backported.

| Version | Supported |
| --- | --- |
| Latest release | Yes |
| Anything older | No |

## Reporting a vulnerability

**Please do not open a public issue for a security problem.**

Report it privately through GitHub:

1. Go to <https://github.com/zgbrenner/openword/security/advisories/new>.
2. Describe what you found, how to reproduce it, and what an attacker gets out
   of it.

If that page is not available to you, open a regular issue that says only "I
would like to report a security issue, please enable private reporting" — with
no details — and a maintainer will follow up.

Include, if you can:

- The OpenWord version (Help → About OpenWord) and your operating system.
- Whether it affects the desktop app, the browser build, or both.
- A minimal reproduction. If a crafted document triggers it, attach the
  smallest file that still does.
- What you think the impact is.

You should get an acknowledgement within a week. This is a small project, so
please be patient with fix timelines; you will be credited in the advisory
unless you ask not to be.

## Scope

### In scope

- Anything that lets a document read, write, or execute outside the files the
  user explicitly opened.
- Sandbox or content-security-policy escapes in the desktop shell or the
  browser build.
- Any way to make the core application send data over the network. The desktop
  crate is designed to be structurally incapable of this — no HTTP client is a
  dependency of `src-tauri/` — so a working network request from the core app
  is a bug of the highest severity, not a feature.
- Tampering with the Writer runtime supply chain: anything that gets a modified
  `soffice.wasm`, `soffice.data`, or bridge script past the hash and source-lock
  verification in `engine/scripts/verify-runtime.mjs`.
- Vulnerabilities in the release pipeline that could put an unofficial
  installer on the releases page.

### Out of scope

- Missing Authenticode signing on the Windows installers. This is a known,
  documented gap — see the README. Verify downloads with the published
  SHA-256 checksums in the meantime.
- Advisories in build-time-only dependencies with no path to a shipped
  artifact. These are tracked by the scheduled `Dependency audit` workflow and
  by Dependabot.
- The `unmaintained` RustSec advisories on the GTK3 bindings that the whole
  Tauri v2 Linux stack depends on. There is nothing to upgrade to; they are
  reported as warnings by design.
- Anything requiring an attacker who already has code execution as the user.
- Social engineering, or issues in third-party plugins under `plugins/`.

## What OpenWord guarantees

- The core desktop application makes no network requests. There is no
  telemetry, no update check, no account, and no sync.
- Every Writer runtime artifact is pinned by commit and verified by SHA-256
  against `engine/runtime.lock.json` before it can be bundled or served.
- Release installers are built by the `Release (Windows)` GitHub Actions
  workflow from a tagged commit, and each installer is published with a
  SHA-256 checksum file beside it.
