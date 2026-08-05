# Writer Engine Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the live ProseMirror editing surface with a runnable LibreOffice Writer WebAssembly vertical slice that opens and saves DOCX/ODT files, exposes typed formatting commands and state, and fails closed when the Writer runtime is absent.

**Architecture:** Bundle a pinned local LOWA Writer runtime and zetajs bridge, host Writer's canvas in the existing Tauri webview, and communicate through a typed request/response/event protocol. Writer is the only editor presented by `App.svelte`; existing ProseMirror code remains temporarily unreferenced solely for later `.owdoc` migration work.

**Tech Stack:** Tauri 2, Svelte 5, TypeScript 5.9, Vite 6, Vitest, LibreOffice Writer/LOWA, zetajs/UNO, Emscripten FS.

## Global Constraints

- OpenWord ships one editable document engine: LibreOffice Writer.
- Production runtime assets are local and never loaded from a CDN.
- Production LOWA builds must not enable proxy POSIX sockets or other network transports.
- Svelte components must not contain raw UNO service names or `.uno:*` command strings.
- Macros and arbitrary UNO extensions remain disabled.
- The original file is never overwritten until a staged save has completed successfully.
- New general-purpose documents default to DOCX; ODT is first-class.
- Do not add GitHub Actions or consume GitHub Actions minutes.
- Every task ends in a locally runnable or statically verifiable state.

---

## File map

### New engine and build files

- `engine/README.md`: source, build, licensing, and runtime installation instructions.
- `engine/manifest.json`: pinned source refs, runtime filenames, and SHA-256 hashes.
- `engine/scripts/resolve-runtime.mjs`: resolves exact upstream commits and writes a lock file.
- `engine/scripts/verify-runtime.mjs`: verifies all required local runtime files and hashes.
- `engine/runtime.lock.json`: generated exact source revisions committed after resolution.
- `engine/licenses/NOTICE.md`: distribution and source-availability notices.
- `public/writer-runtime/openword_writer_thread.js`: worker-side UNO bridge loaded by LOWA.
- `public/writer-runtime/.gitkeep`: preserves the runtime directory without committing large binaries.

### New frontend engine files

- `src/writer/protocol.ts`: discriminated request, response, event, command, query, and error types.
- `src/writer/protocol.test.ts`: protocol guards and message-shape tests.
- `src/writer/runtimeHost.ts`: LOWA script loading, Emscripten module setup, canvas binding, and FS access.
- `src/writer/runtimeHost.test.ts`: pure runtime URL and required-file tests.
- `src/writer/client.ts`: request correlation, timeouts, events, file transfer, and semantic commands.
- `src/writer/client.test.ts`: mocked MessagePort tests.
- `src/writer/state.svelte.ts`: authoritative Svelte state derived from Writer events.
- `src/writer/fileApi.ts`: Tauri dialogs and atomic DOCX/ODT read/write operations.
- `src/writer/globals.d.ts`: LOWA `Module`, Emscripten `FS`, and zetajs bridge globals.

### New interface files

- `src/components/WriterCanvas.svelte`: required `qtcanvas`, runtime loading, resize, focus, and error UI.
- `src/components/WriterHomeBar.svelte`: basic Word-style Home controls backed by semantic commands.
- `src/components/WriterStatusBar.svelte`: engine, dirty, page, word-count, and zoom state.
- `src/components/WriterEngineFailure.svelte`: retry and diagnostics surface when runtime startup fails.

### Existing files modified

- `package.json`: Vitest and engine scripts.
- `package-lock.json`: dependency lock update.
- `.gitignore`: ignore generated LOWA binaries while retaining the worker bridge and directory marker.
- `src/App.svelte`: switch the live application to Writer-only composition.
- `src/styles/app.css`: clean Writer shell variables and canvas layout.
- `src-tauri/src/lib.rs`: recognize `.odt`, `.doc`, and `.rtf` open-with paths.
- `src-tauri/tauri.conf.json`: file associations, runtime resources, and restrictive CSP.
- `README.md`: state the new engine architecture and runtime bootstrap command.
- `ARCHITECTURE.md`: replace the ProseMirror-as-core description with the single Writer-engine architecture.

---

### Task 1: Add the test harness and pinned runtime manifest

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `.gitignore`
- Create: `engine/manifest.json`
- Create: `engine/scripts/resolve-runtime.mjs`
- Create: `engine/scripts/verify-runtime.mjs`
- Create: `engine/README.md`
- Create: `engine/licenses/NOTICE.md`
- Create: `public/writer-runtime/.gitkeep`

**Interfaces:**
- Produces: `npm run test:run`, `npm run engine:resolve`, and `npm run engine:verify`.
- Produces: `engine/manifest.json` with `sources`, `runtimeFiles`, and `security` keys.
- Consumes: no earlier task.

- [ ] **Step 1: Add the failing verification fixture**

Create `engine/manifest.json`:

```json
{
  "schemaVersion": 1,
  "sources": {
    "libreoffice": {
      "repository": "https://github.com/LibreOffice/core.git",
      "ref": "refs/heads/distro/allotropia/zeta-24-2"
    },
    "zetajs": {
      "repository": "https://github.com/allotropia/zetajs.git",
      "ref": "refs/tags/v1.2.0"
    },
    "emscripten": {
      "repository": "https://github.com/allotropia/emscripten.git",
      "ref": "refs/heads/fixed-3.1.65"
    },
    "qt5": {
      "repository": "https://github.com/allotropia/qt5.git",
      "ref": "refs/heads/5.15.2+wasm"
    }
  },
  "runtimeDirectory": "public/writer-runtime",
  "runtimeFiles": [
    "soffice.js",
    "soffice.wasm",
    "soffice.data",
    "soffice.data.js.metadata",
    "zeta.js",
    "openword_writer_thread.js"
  ],
  "security": {
    "allowNetwork": false,
    "allowMacros": false,
    "allowExtensions": false,
    "allowProxySockets": false
  }
}
```

- [ ] **Step 2: Add scripts and run verification to prove it fails**

Add to `package.json`:

```json
{
  "scripts": {
    "test": "vitest",
    "test:run": "vitest run",
    "engine:resolve": "node engine/scripts/resolve-runtime.mjs",
    "engine:verify": "node engine/scripts/verify-runtime.mjs"
  },
  "devDependencies": {
    "vitest": "^3.2.4"
  }
}
```

Run:

```bash
npm install
npm run engine:verify
```

Expected: non-zero exit with a list containing `soffice.js`, `soffice.wasm`, `soffice.data`, `soffice.data.js.metadata`, and `zeta.js`. The committed `openword_writer_thread.js` is added in Task 5.

- [ ] **Step 3: Implement exact revision resolution**

Create `engine/scripts/resolve-runtime.mjs`:

```js
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync(new URL("../manifest.json", import.meta.url), "utf8"));
const resolvedAt = new Date().toISOString();
const sources = {};

for (const [name, source] of Object.entries(manifest.sources)) {
  const output = execFileSync("git", ["ls-remote", source.repository, source.ref], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  }).trim();
  const commit = output.split(/\s+/)[0];
  if (!/^[a-f0-9]{40}$/.test(commit)) {
    throw new Error(`Could not resolve ${name} ${source.ref}`);
  }
  sources[name] = { ...source, commit };
}

writeFileSync(
  new URL("../runtime.lock.json", import.meta.url),
  `${JSON.stringify({ schemaVersion: 1, resolvedAt, sources }, null, 2)}\n`,
);
```

- [ ] **Step 4: Implement runtime verification**

Create `engine/scripts/verify-runtime.mjs`:

```js
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(new URL("../..", import.meta.url).pathname);
const manifest = JSON.parse(readFileSync(resolve(root, "engine/manifest.json"), "utf8"));
const lockPath = resolve(root, "engine/runtime.lock.json");
const missing = [];

for (const name of manifest.runtimeFiles) {
  const path = resolve(root, manifest.runtimeDirectory, name);
  if (!existsSync(path)) missing.push(name);
}

if (!existsSync(lockPath)) missing.push("engine/runtime.lock.json");
if (missing.length) {
  console.error(`Writer runtime is incomplete:\n${missing.map((name) => `- ${name}`).join("\n")}`);
  process.exit(1);
}

const lock = JSON.parse(readFileSync(lockPath, "utf8"));
for (const [name, source] of Object.entries(lock.sources)) {
  if (!/^[a-f0-9]{40}$/.test(source.commit)) {
    throw new Error(`Invalid commit lock for ${name}`);
  }
}

for (const file of manifest.runtimeFiles) {
  const bytes = readFileSync(resolve(root, manifest.runtimeDirectory, file));
  console.log(`${createHash("sha256").update(bytes).digest("hex")}  ${file}`);
}
```

- [ ] **Step 5: Document build and license boundaries**

`engine/README.md` must state:

- the runtime is a Writer-only LOWA build
- production must use local assets
- `git ls-remote` resolution creates `runtime.lock.json`
- runtime binaries are generated and not hand-edited
- LibreOffice modifications are published under applicable MPL 2.0 terms
- zetajs remains MIT licensed
- macros, arbitrary extensions, and proxy sockets are disabled

`engine/licenses/NOTICE.md` must list OpenWord Apache-2.0, zetajs MIT, LibreOffice MPL 2.0, and the release source-location requirement.

- [ ] **Step 6: Update ignore rules**

Add:

```gitignore
/public/writer-runtime/soffice.js
/public/writer-runtime/soffice.wasm
/public/writer-runtime/soffice.data
/public/writer-runtime/soffice.data.js.metadata
/public/writer-runtime/zeta.js
/engine/runtime.lock.json.tmp
```

Do not ignore `openword_writer_thread.js`, `.gitkeep`, `manifest.json`, or the committed lock file.

- [ ] **Step 7: Verify and commit**

Run:

```bash
npm run test:run
npm run engine:verify
```

Expected: tests have no failures; `engine:verify` still fails only because the large runtime binaries and resolved lock have not yet been installed. Record this expected bootstrap failure in the commit body, not as a passing verification claim.

Commit:

```bash
git add package.json package-lock.json .gitignore engine public/writer-runtime/.gitkeep
git commit -m "build: add pinned Writer runtime manifest"
```

---

### Task 2: Define and test the typed Writer protocol

**Files:**
- Create: `src/writer/protocol.ts`
- Create: `src/writer/protocol.test.ts`

**Interfaces:**
- Produces: `WriterRequest`, `WriterResponse`, `WriterEvent`, `WriterCommand`, `WriterError`, `isWriterResponse`, and `isWriterEvent`.
- Consumes: Vitest from Task 1.

- [ ] **Step 1: Write failing protocol tests**

Create `src/writer/protocol.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isWriterEvent, isWriterResponse } from "./protocol";

describe("writer protocol guards", () => {
  it("accepts a successful response", () => {
    expect(isWriterResponse({ kind: "response", id: "1", ok: true, result: { ready: true } })).toBe(true);
  });

  it("rejects a response without correlation id", () => {
    expect(isWriterResponse({ kind: "response", ok: true })).toBe(false);
  });

  it("accepts an engine-ready event", () => {
    expect(isWriterEvent({ kind: "event", event: "engine.ready", payload: { version: "test" } })).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test and confirm failure**

Run:

```bash
npm run test:run -- src/writer/protocol.test.ts
```

Expected: FAIL because `src/writer/protocol.ts` does not exist.

- [ ] **Step 3: Implement the protocol**

Create `src/writer/protocol.ts` with these public unions:

```ts
export type WriterFormat = "docx" | "odt";

export type WriterCommand =
  | { type: "format.toggleBold" }
  | { type: "format.toggleItalic" }
  | { type: "format.toggleUnderline" }
  | { type: "history.undo" }
  | { type: "history.redo" };

export type WriterRequestMethod =
  | "engine.ping"
  | "document.new"
  | "document.open"
  | "document.save"
  | "command.execute";

export interface WriterRequest {
  kind: "request";
  id: string;
  method: WriterRequestMethod;
  params?: unknown;
}

export interface WriterError {
  code: "ENGINE_UNAVAILABLE" | "TIMEOUT" | "INVALID_REQUEST" | "OPEN_FAILED" | "SAVE_FAILED" | "COMMAND_FAILED";
  message: string;
  detail?: string;
}

export type WriterResponse =
  | { kind: "response"; id: string; ok: true; result?: unknown }
  | { kind: "response"; id: string; ok: false; error: WriterError };

export type WriterEvent =
  | { kind: "event"; event: "engine.ready"; payload: { version: string } }
  | { kind: "event"; event: "document.changed"; payload: { dirty: boolean } }
  | {
      kind: "event";
      event: "selection.formatting";
      payload: { bold: boolean; italic: boolean; underline: boolean };
    }
  | { kind: "event"; event: "engine.failure"; payload: WriterError };

export function isWriterResponse(value: unknown): value is WriterResponse {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return candidate.kind === "response" && typeof candidate.id === "string" && typeof candidate.ok === "boolean";
}

export function isWriterEvent(value: unknown): value is WriterEvent {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return candidate.kind === "event" && typeof candidate.event === "string" && "payload" in candidate;
}
```

- [ ] **Step 4: Run tests and commit**

Run:

```bash
npm run test:run -- src/writer/protocol.test.ts
```

Expected: PASS, 3 tests.

Commit:

```bash
git add src/writer/protocol.ts src/writer/protocol.test.ts
git commit -m "feat: define typed Writer protocol"
```

---

### Task 3: Implement request correlation and Writer client state

**Files:**
- Create: `src/writer/client.ts`
- Create: `src/writer/client.test.ts`
- Create: `src/writer/state.svelte.ts`

**Interfaces:**
- Consumes: protocol types from Task 2.
- Produces: `WriterClient`, `WriterTransport`, `WriterState`, `execute`, `newDocument`, `openPath`, `savePath`, and event subscriptions.

- [ ] **Step 1: Write failing client tests**

Create `src/writer/client.test.ts` with a fake transport:

```ts
import { describe, expect, it } from "vitest";
import { WriterClient, type WriterTransport } from "./client";

class FakeTransport implements WriterTransport {
  sent: unknown[] = [];
  listener: ((message: unknown) => void) | null = null;
  post(message: unknown) { this.sent.push(message); }
  onMessage(listener: (message: unknown) => void) { this.listener = listener; return () => { this.listener = null; }; }
}

describe("WriterClient", () => {
  it("correlates a response with its request", async () => {
    const transport = new FakeTransport();
    const client = new WriterClient(transport, { timeoutMs: 100 });
    const pending = client.ping();
    const request = transport.sent[0] as { id: string };
    transport.listener?.({ kind: "response", id: request.id, ok: true, result: { ready: true } });
    await expect(pending).resolves.toEqual({ ready: true });
  });

  it("publishes engine events", () => {
    const transport = new FakeTransport();
    const client = new WriterClient(transport);
    const events: unknown[] = [];
    client.subscribe((event) => events.push(event));
    transport.listener?.({ kind: "event", event: "engine.ready", payload: { version: "test" } });
    expect(events).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run:

```bash
npm run test:run -- src/writer/client.test.ts
```

Expected: FAIL because `WriterClient` is undefined.

- [ ] **Step 3: Implement `WriterClient`**

`src/writer/client.ts` must:

- generate request IDs with `crypto.randomUUID()` and a deterministic fallback
- maintain `Map<string, PendingRequest>`
- reject timed-out requests with `WriterError.code === "TIMEOUT"`
- route valid events to subscribers
- ignore malformed messages
- expose semantic wrappers:

```ts
ping(): Promise<{ ready: boolean }>;
newDocument(format?: WriterFormat): Promise<void>;
openPath(path: string): Promise<void>;
savePath(path: string, format: WriterFormat): Promise<void>;
execute(command: WriterCommand): Promise<void>;
subscribe(listener: (event: WriterEvent) => void): () => void;
destroy(): void;
```

Use this transport interface:

```ts
export interface WriterTransport {
  post(message: WriterRequest): void;
  onMessage(listener: (message: unknown) => void): () => void;
}
```

- [ ] **Step 4: Implement Svelte state**

Create `src/writer/state.svelte.ts`:

```ts
import type { WriterEvent } from "./protocol";

export class WriterState {
  ready = $state(false);
  dirty = $state(false);
  failure = $state<string | null>(null);
  bold = $state(false);
  italic = $state(false);
  underline = $state(false);
  fileName = $state("Document1.docx");
  filePath = $state<string | null>(null);
  format = $state<"docx" | "odt">("docx");

  apply(event: WriterEvent) {
    if (event.event === "engine.ready") this.ready = true;
    if (event.event === "document.changed") this.dirty = event.payload.dirty;
    if (event.event === "selection.formatting") Object.assign(this, event.payload);
    if (event.event === "engine.failure") this.failure = event.payload.message;
  }
}
```

- [ ] **Step 5: Verify and commit**

Run:

```bash
npm run test:run -- src/writer/client.test.ts src/writer/protocol.test.ts
npm run check
```

Expected: PASS and zero Svelte/TypeScript errors.

Commit:

```bash
git add src/writer/client.ts src/writer/client.test.ts src/writer/state.svelte.ts
git commit -m "feat: add Writer client and state"
```

---

### Task 4: Load the local LOWA runtime without a network fallback

**Files:**
- Create: `src/writer/globals.d.ts`
- Create: `src/writer/runtimeHost.ts`
- Create: `src/writer/runtimeHost.test.ts`

**Interfaces:**
- Consumes: `WriterTransport` from Task 3.
- Produces: `WriterRuntimeHost`, `WriterRuntimeOptions`, `runtimeAssetUrl`, and `start(canvas)`.

- [ ] **Step 1: Write failing URL and required-file tests**

Create `src/writer/runtimeHost.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { REQUIRED_RUNTIME_FILES, runtimeAssetUrl } from "./runtimeHost";

describe("Writer runtime host", () => {
  it("uses a local relative asset URL", () => {
    expect(runtimeAssetUrl("soffice.js", "./writer-runtime/")).toBe("./writer-runtime/soffice.js");
  });

  it("requires the Writer bridge script", () => {
    expect(REQUIRED_RUNTIME_FILES).toContain("openword_writer_thread.js");
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run:

```bash
npm run test:run -- src/writer/runtimeHost.test.ts
```

Expected: FAIL because `runtimeHost.ts` does not exist.

- [ ] **Step 3: Add global declarations**

Create `src/writer/globals.d.ts` declaring:

```ts
interface EmscriptenFileSystem {
  mkdir(path: string): void;
  writeFile(path: string, data: Uint8Array): void;
  readFile(path: string): Uint8Array;
  unlink(path: string): void;
}

interface Window {
  Module?: Record<string, unknown> & { uno_main?: Promise<MessagePort> };
  FS?: EmscriptenFileSystem;
}
```

- [ ] **Step 4: Implement `WriterRuntimeHost`**

The host must:

- accept only a relative `baseUrl` defaulting to `./writer-runtime/`
- reject `http:`, `https:`, protocol-relative, and `data:` URLs
- assign `window.Module` before loading `soffice.js`
- set `Module.canvas`
- set `Module.uno_scripts` to local `zeta.js` and `openword_writer_thread.js`
- set `Module.locateFile`
- append one script element for `soffice.js`
- await `Module.uno_main`
- expose a `WriterTransport` over the returned `MessagePort`
- expose `writeVirtualFile`, `readVirtualFile`, and `removeVirtualFile`
- remove the script and close the port on `destroy()`

Core URL function:

```ts
export function runtimeAssetUrl(file: string, baseUrl = "./writer-runtime/"): string {
  if (/^(?:https?:|data:|\/\/)/i.test(baseUrl)) throw new Error("Remote Writer runtimes are forbidden");
  return `${baseUrl.replace(/\/?$/, "/")}${file}`;
}
```

- [ ] **Step 5: Verify and commit**

Run:

```bash
npm run test:run -- src/writer/runtimeHost.test.ts
npm run check
```

Expected: PASS and zero type errors.

Commit:

```bash
git add src/writer/globals.d.ts src/writer/runtimeHost.ts src/writer/runtimeHost.test.ts
git commit -m "feat: load local Writer runtime"
```

---

### Task 5: Add the worker-side UNO bridge and basic formatting status

**Files:**
- Create: `public/writer-runtime/openword_writer_thread.js`
- Create: `engine/scripts/check-worker-bridge.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: request and event names from Task 2.
- Produces: request handlers for `engine.ping`, `document.new`, `document.open`, `document.save`, and `command.execute`.
- Produces: `engine.ready`, `document.changed`, `selection.formatting`, and `engine.failure` events.

- [ ] **Step 1: Add a failing bridge static check**

Create `engine/scripts/check-worker-bridge.mjs`:

```js
import { readFileSync } from "node:fs";
const source = readFileSync("public/writer-runtime/openword_writer_thread.js", "utf8");
for (const required of [
  "engine.ping",
  "document.new",
  "document.open",
  "document.save",
  "command.execute",
  ".uno:Bold",
  ".uno:Italic",
  ".uno:Underline",
]) {
  if (!source.includes(required)) throw new Error(`Worker bridge missing ${required}`);
}
```

Add `"engine:check-bridge": "node engine/scripts/check-worker-bridge.mjs"` to package scripts.

Run:

```bash
npm run engine:check-bridge
```

Expected: FAIL because `openword_writer_thread.js` does not exist.

- [ ] **Step 2: Implement worker initialization**

Base the worker on the zetajs standalone example, but remove demo globals and expose only OpenWord protocol handling.

Required initialization:

```js
let zetajs;
let css;
let context;
let desktop;
let model;
let controller;
let dirty = false;

Module.zetajs.then((value) => {
  zetajs = value;
  css = zetajs.uno.com.sun.star;
  context = zetajs.getUnoComponentContext();
  desktop = css.frame.Desktop.create(context);
  configureUi();
  bindRequests();
  postEvent("engine.ready", { version: "writer-lowa" });
});
```

`configureUi()` must hide LibreOffice toolbars, menubar, and sidebar using Writer configuration and layout-manager operations from the zetajs standalone example.

- [ ] **Step 3: Implement request/response helpers**

Use:

```js
function respond(id, result) {
  zetajs.mainPort.postMessage({ kind: "response", id, ok: true, result });
}

function fail(id, code, error) {
  zetajs.mainPort.postMessage({
    kind: "response",
    id,
    ok: false,
    error: { code, message: error instanceof Error ? error.message : String(error) },
  });
}

function postEvent(event, payload) {
  zetajs.mainPort.postMessage({ kind: "event", event, payload });
}
```

Wrap each request handler in `try/catch` and map failures to the exact error codes in `protocol.ts`.

- [ ] **Step 4: Implement document lifecycle**

- `document.new`: load `private:factory/swriter`, get controller, hide native chrome, attach status listeners, return success.
- `document.open`: call `desktop.loadComponentFromURL(fileUrl, "_default", 0, [])` for a virtual FS path.
- `document.save`: query the storable interface and call `storeAsURL` with `Overwrite: true` and filter name `Office Open XML Text` for DOCX or `writer8` for ODT.
- dispose the previous model before replacing it.
- post `{ dirty: false }` after successful open or save.

- [ ] **Step 5: Implement commands and status listeners**

Map semantic command names in one object:

```js
const commandUrls = {
  "format.toggleBold": ".uno:Bold",
  "format.toggleItalic": ".uno:Italic",
  "format.toggleUnderline": ".uno:Underline",
  "history.undo": ".uno:Undo",
  "history.redo": ".uno:Redo",
};
```

Register `XStatusListener` listeners for Bold, Italic, and Underline. Publish all three values together through `selection.formatting` whenever one changes.

- [ ] **Step 6: Verify and commit**

Run:

```bash
npm run engine:check-bridge
npm run test:run
npm run check
```

Expected: all static and TypeScript tests pass. Runtime behavior remains gated on Task 10's installed LOWA artifacts.

Commit:

```bash
git add public/writer-runtime/openword_writer_thread.js engine/scripts/check-worker-bridge.mjs package.json package-lock.json
git commit -m "feat: add Writer UNO worker bridge"
```

---

### Task 6: Add native DOCX/ODT file transfer and atomic saving

**Files:**
- Create: `src/writer/fileApi.ts`
- Create: `src/writer/fileApi.test.ts`

**Interfaces:**
- Consumes: `WriterRuntimeHost` and `WriterClient`.
- Produces: `openWriterDocument`, `saveWriterDocument`, `saveWriterDocumentAs`, and `WriterOpenResult`.

- [ ] **Step 1: Write failing format-detection tests**

```ts
import { describe, expect, it } from "vitest";
import { formatFromPath } from "./fileApi";

describe("formatFromPath", () => {
  it("detects DOCX", () => expect(formatFromPath("Report.DOCX")).toBe("docx"));
  it("detects ODT", () => expect(formatFromPath("Report.odt")).toBe("odt"));
  it("rejects unsupported output", () => expect(() => formatFromPath("Report.pdf")).toThrow());
});
```

- [ ] **Step 2: Run and confirm failure**

Run:

```bash
npm run test:run -- src/writer/fileApi.test.ts
```

Expected: FAIL because `fileApi.ts` does not exist.

- [ ] **Step 3: Implement safe file open**

`openWriterDocument` must:

1. use Tauri's open dialog with DOCX and ODT filters
2. read bytes with `readFile`
3. create `/tmp/openword` in Emscripten FS if absent
4. write bytes to `/tmp/openword/current.<ext>`
5. call `client.openPath("file:///tmp/openword/current.<ext>")`
6. update the caller only after Writer reports successful open

- [ ] **Step 4: Implement staged save**

`saveWriterDocument` must:

1. choose `/tmp/openword/staged.<ext>`
2. call `client.savePath("file:///tmp/openword/staged.<ext>", format)`
3. read staged bytes from Emscripten FS
4. write `${target}.openword-tmp` with Tauri FS
5. rename temporary file over the target only after the write completes
6. retain the temporary bytes and error details if rename fails
7. remove the virtual staged file after success

The function returns:

```ts
export interface SaveResult {
  path: string;
  format: "docx" | "odt";
  bytesWritten: number;
}
```

- [ ] **Step 5: Verify and commit**

Run:

```bash
npm run test:run -- src/writer/fileApi.test.ts
npm run check
```

Expected: PASS and zero type errors.

Commit:

```bash
git add src/writer/fileApi.ts src/writer/fileApi.test.ts
git commit -m "feat: add Writer DOCX and ODT file I/O"
```

---

### Task 7: Add Writer canvas, Home controls, and failure UI

**Files:**
- Create: `src/components/WriterCanvas.svelte`
- Create: `src/components/WriterHomeBar.svelte`
- Create: `src/components/WriterStatusBar.svelte`
- Create: `src/components/WriterEngineFailure.svelte`
- Modify: `src/styles/app.css`

**Interfaces:**
- Consumes: `WriterRuntimeHost`, `WriterClient`, and `WriterState`.
- Produces: a canvas host with `onready(client, host)`, `onfailure(error)`, and visible semantic controls.

- [ ] **Step 1: Implement failure-first canvas shell**

`WriterCanvas.svelte` must initially display a centered loading state, create the runtime host on mount, and show `WriterEngineFailure` if `soffice.js`, WASM, data files, or the worker port cannot initialize.

The canvas must be exactly:

```svelte
<canvas
  bind:this={canvas}
  id="qtcanvas"
  contenteditable="true"
  class="ow-writer-canvas"
  aria-label="Document editor"
></canvas>
```

Do not add border or padding to the canvas because LOWA mouse coordinates depend on the canvas content box.

- [ ] **Step 2: Implement Word-style basic controls**

`WriterHomeBar.svelte` must contain:

- Save
- Undo
- Redo
- Bold
- Italic
- Underline

Buttons consume `WriterState` and call only semantic `WriterClient` methods. They must set `aria-pressed` for formatting toggles and preserve focus by returning focus to the Writer canvas after execution.

- [ ] **Step 3: Implement restrained layout**

Use:

- a compact 40px Home bar
- neutral chrome
- 1px bottom border
- no gradients
- grouped controls with 6px gaps
- a gray application canvas behind Writer
- visible keyboard focus
- a loading panel that does not resemble a marketing card

- [ ] **Step 4: Implement status bar**

The initial status bar displays:

- engine state: Loading, Ready, or Failed
- current filename
- unsaved indicator
- DOCX or ODT format

Page count, word count, language, view mode, and zoom are added when corresponding Writer status queries are implemented in a later plan.

- [ ] **Step 5: Verify and commit**

Run:

```bash
npm run check
npm run build
```

Expected: zero Svelte errors and a successful Vite build when runtime binaries are not required at build time.

Commit:

```bash
git add src/components/WriterCanvas.svelte src/components/WriterHomeBar.svelte src/components/WriterStatusBar.svelte src/components/WriterEngineFailure.svelte src/styles/app.css
git commit -m "feat: add Writer canvas and Home shell"
```

---

### Task 8: Switch the application to Writer-only editing

**Files:**
- Modify: `src/App.svelte`

**Interfaces:**
- Consumes: all frontend interfaces from Tasks 3 through 7.
- Produces: one live Writer editor application with no ProseMirror fallback.

- [ ] **Step 1: Replace ProseMirror imports and contexts**

Remove imports of:

- `prosemirror-tables`
- `Toolbar`
- `Ruler`
- `PageCanvas`
- `FindReplace`
- `ReviewPanel`
- `EditorController`
- `PaginationState`
- `ReviewPanelState`
- legacy `fileApi`

Instantiate:

```ts
const writerState = new WriterState();
let client = $state<WriterClient | null>(null);
let runtimeHost = $state<WriterRuntimeHost | null>(null);
```

- [ ] **Step 2: Wire Writer events and title state**

When the canvas reports ready:

1. assign the client and host
2. subscribe `writerState.apply`
3. create a new DOCX document
4. update window title from `writerState.fileName` and `writerState.dirty`

No fallback editor is rendered if startup fails.

- [ ] **Step 3: Rewire menu actions**

Map current Tauri menu events to Writer operations:

- New
- Open
- Save
- Save As
- Print remains disabled with an explicit notification until Writer print integration lands
- Undo
- Redo
- Bold
- Italic
- Underline

Unsupported legacy menu actions must return a clear `Not available in this migration build` notification rather than invoking hidden ProseMirror controls.

- [ ] **Step 4: Rewire close protection and recovery boundary**

Keep dirty-document close protection. Do not reuse ProseMirror recovery serialization. Until Writer autosave is implemented in the next plan, close protection must state that recovery is not yet available in this migration build.

- [ ] **Step 5: Verify no live ProseMirror imports**

Run:

```bash
rg "prosemirror|EditorController|PageCanvas" src/App.svelte src/components/Writer*.svelte src/writer
npm run test:run
npm run check
npm run build
```

Expected:

- `rg` exits with no matches in the Writer application paths
- all tests pass
- build succeeds

- [ ] **Step 6: Commit**

```bash
git add src/App.svelte
git commit -m "feat: switch OpenWord to Writer-only editing"
```

---

### Task 9: Update native file associations, CSP, and bundled resources

**Files:**
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/tauri.conf.json`

**Interfaces:**
- Consumes: local Writer runtime directory and DOCX/ODT file API.
- Produces: OS open-with support and local-only runtime permissions.

- [ ] **Step 1: Add Rust path-filter tests**

Move extension detection into:

```rust
fn is_supported_document_path(path: &str) -> bool {
    matches!(
        std::path::Path::new(path)
            .extension()
            .and_then(|ext| ext.to_str())
            .map(|ext| ext.to_ascii_lowercase())
            .as_deref(),
        Some("docx" | "odt" | "doc" | "rtf" | "owdoc")
    )
}
```

Add unit tests for uppercase DOCX, ODT, unsupported PDF, and a path without an extension.

- [ ] **Step 2: Run Rust tests and confirm initial failure**

Run:

```bash
cd src-tauri
cargo test is_supported_document_path
```

Expected: FAIL until the helper and tests are added.

- [ ] **Step 3: Update Tauri configuration**

Add DOCX and ODT file associations. Include the Writer runtime directory as packaged resources. Configure CSP so production permits only:

- self-hosted scripts and workers
- local WASM execution required by LOWA
- local images, styles, and fonts
- no `http:`, `https:`, `ws:`, or `wss:` connections

Do not use `dangerousDisableAssetCspModification` as a shortcut.

- [ ] **Step 4: Verify and commit**

Run:

```bash
cd src-tauri
cargo fmt --check
cargo test
cargo check
```

Expected: all commands exit zero.

Commit:

```bash
git add src-tauri/src/lib.rs src-tauri/tauri.conf.json
git commit -m "feat: register Writer formats and local runtime"
```

---

### Task 10: Install and smoke-test the pinned Writer runtime

**Files:**
- Create: `engine/runtime.lock.json`
- Add generated local files, not committed unless release policy explicitly permits:
  - `public/writer-runtime/soffice.js`
  - `public/writer-runtime/soffice.wasm`
  - `public/writer-runtime/soffice.data`
  - `public/writer-runtime/soffice.data.js.metadata`
  - `public/writer-runtime/zeta.js`
- Create: `tests/fidelity/fixtures/basic.docx`
- Create: `tests/fidelity/fixtures/basic.odt`
- Create: `tests/fidelity/README.md`

**Interfaces:**
- Consumes: manifest, bridge, runtime host, Writer application, and file I/O.
- Produces: the first runnable single-engine OpenWord vertical slice.

- [ ] **Step 1: Resolve exact source revisions**

Run:

```bash
npm run engine:resolve
```

Review `engine/runtime.lock.json` and commit it only after each source has a 40-character commit hash.

- [ ] **Step 2: Build or obtain the matching local LOWA artifacts**

Build from the exact locked LibreOffice, Emscripten, Qt, and zetajs revisions. The build configuration must:

- include Writer
- include DOCX and ODT filters
- include PDF export dependencies needed by Writer
- disable proxy POSIX sockets
- disable macro runtimes and extension installation
- exclude Calc, Impress, Base, and Draw user interfaces unless a Writer dependency requires code from those modules

Copy the resulting runtime files to `public/writer-runtime/`.

- [ ] **Step 3: Verify runtime completeness**

Run:

```bash
npm run engine:verify
npm run engine:check-bridge
```

Expected: both exit zero and print SHA-256 hashes for all runtime files.

- [ ] **Step 4: Run the interactive smoke test**

Run:

```bash
npm run tauri dev
```

Verify this exact sequence:

1. Writer canvas becomes visible.
2. New document accepts keyboard input.
3. Bold, Italic, and Underline buttons update Writer and reflect selection state.
4. Save As DOCX writes a file.
5. Close and reopen the DOCX.
6. Save As ODT writes a file.
7. Close and reopen the ODT.
8. With network disabled, repeat steps 1 through 7.
9. Remove `soffice.wasm`; restart and verify the explicit engine failure screen appears without a ProseMirror fallback.

- [ ] **Step 5: Add the first fixtures**

Create `basic.docx` and `basic.odt` containing:

- one normal paragraph
- bold, italic, and underlined runs
- a second paragraph long enough to wrap

`tests/fidelity/README.md` records the generating application and exact manual smoke-test sequence.

- [ ] **Step 6: Run full verification**

Run:

```bash
npm run test:run
npm run check
npm run build
npm run engine:verify
npm run engine:check-bridge
cd src-tauri && cargo fmt --check && cargo test && cargo check
```

Expected: every command exits zero.

- [ ] **Step 7: Commit the lock and fixtures**

Do not commit generated LOWA binaries to normal Git history unless the release-distribution policy explicitly chooses Git LFS or release assets.

```bash
git add engine/runtime.lock.json tests/fidelity

git commit -m "test: verify Writer runtime vertical slice"
```

---

### Task 11: Update project documentation and open the migration PR

**Files:**
- Modify: `README.md`
- Modify: `ARCHITECTURE.md`
- Create: `docs/writer-runtime.md`

**Interfaces:**
- Consumes: verified behavior from Task 10.
- Produces: accurate contributor setup instructions and migration status.

- [ ] **Step 1: Update README**

Document:

- LibreOffice Writer is the only live document engine
- `npm run engine:resolve`
- how to install/build runtime assets
- `npm run engine:verify`
- DOCX and ODT support status
- the absence of macro execution and network requirements

- [ ] **Step 2: Rewrite architecture sections**

Remove claims that ProseMirror is OpenWord's editing core. Preserve a clearly labeled legacy section explaining that old files remain in the tree temporarily for `.owdoc` migration only.

- [ ] **Step 3: Add runtime troubleshooting**

`docs/writer-runtime.md` must cover:

- missing runtime files
- hash mismatch
- canvas remains hidden
- worker does not reach `engine.ready`
- save fails in Emscripten FS
- CSP blocks local worker or WASM
- diagnostic information to collect

- [ ] **Step 4: Final self-review**

Check:

- no production CDN URL
- no live ProseMirror fallback
- no raw UNO strings in Svelte components
- no GitHub Actions added
- macro and extension restrictions documented
- runtime source revisions reproducible
- DOCX and ODT smoke tests recorded

- [ ] **Step 5: Final verification and PR**

Run the complete verification command from Task 10 immediately before opening the PR. Include exact command output and known gaps in the PR body.

Commit:

```bash
git add README.md ARCHITECTURE.md docs/writer-runtime.md
git commit -m "docs: document Writer engine migration"
```

Open a PR titled:

```text
Replace OpenWord editor with LibreOffice Writer foundation
```

The PR must remain unmerged until the runtime smoke test, DOCX reopen test, ODT reopen test, and no-network test have all been performed on a real Tauri build.

---

## Plan self-review

- **Spec coverage:** This foundation plan covers engine pinning, single-engine hosting, typed communication, local runtime security, basic Writer editing, DOCX/ODT file I/O, native file associations, and removal of the live ProseMirror path. Header/footer UI, sections, advanced Word ribbon tabs, `.owdoc` migration, unmodeled XML preservation, mail merge, references, and broad fidelity fixtures intentionally require separate implementation plans after this vertical slice runs.
- **Placeholder scan:** The plan contains no TBD, TODO, or unspecified implementation steps. Dynamic source commits are resolved by a deterministic command and committed in `runtime.lock.json`.
- **Type consistency:** `WriterClient`, `WriterTransport`, `WriterState`, protocol message names, command names, and format unions are consistent across Tasks 2 through 8.
