import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

const slots = await import(new URL("../../src/platform/recovery_slots.js", import.meta.url));
const recoveryStore = await import(
  new URL("../../src/platform/web/web_recovery_store.js", import.meta.url)
);

// --- Saving a document anywhere on the machine -------------------------------

test("the desktop backend replaces documents through the shell, not the fs plugin", () => {
  const desktop = read("src/platform/desktop.ts");
  const replace = desktop.slice(
    desktop.indexOf("async function replaceWithStagedNativeFile"),
    desktop.indexOf("// --- Generation-safe recovery storage"),
  );
  assert.ok(replace.length > 0, "the replacement helper must still exist");

  // A staged replacement needs `<target>.openword-tmp-*` and
  // `<target>.openword-backup-*`. `tauri-plugin-dialog` grants only the exact
  // file the user picked and `tauri-plugin-fs` only what `fs:scope` lists, so
  // neither sibling is writable: staging from here made a document on a second
  // drive or a network share impossible to save at all.
  assert.doesNotMatch(replace, /writeFile\(|\brename\(|\bremove\(|\bexists\(/);
  assert.match(replace, /invoke<DocumentReplaceResult>\("replace_document_atomically"/);
  // The path rides in a header because the body carries the raw bytes.
  assert.match(replace, /headers: \{ path: encodeURIComponent\(targetPath\) \}/);
  // The contract `src/lib/fileApi.ts` and `src/writer/fileApi.ts` consume.
  assert.match(replace, /Promise<DocumentReplaceResult>/);
  assert.match(replace, /retainedBackupPath: result\.retainedBackupPath \?\? null/);
});

test("the Rust command performs the whole staged replacement itself", () => {
  const rust = read("src-tauri/src/lib.rs");
  assert.match(rust, /#\[tauri::command\]\s*\nasync fn replace_document_atomically/);
  assert.match(rust, /fn replace_file_atomically/);
  // Staged file and backup are siblings of the target, so the rename that
  // publishes the document never has to cross a volume: std::fs::rename is
  // MoveFileExW without MOVEFILE_COPY_ALLOWED and fails across volumes.
  assert.match(rust, /let staged = directory\.join\(staged_name\)/);
  assert.match(rust, /let backup = directory\.join\(backup_name\)/);
  // A retained backup is reported, never raised: the document did save.
  assert.match(rust, /Ok\(Some\(backup\.to_string_lossy\(\)\.to_string\(\)\)\)/);
  assert.match(rust, /retained_backup_path/);
  assert.match(rust, /rename_all = "camelCase"/);
  // std::fs only. The core crate must stay incapable of network access.
  assert.doesNotMatch(rust, /reqwest|hyper|ureq|TcpStream/);
});

test("the filesystem scope is not widened to cover every drive", () => {
  const capability = JSON.parse(read("src-tauri/capabilities/default.json"));
  const scope = capability.permissions.find((entry) => entry?.identifier === "fs:scope");
  assert.ok(scope, "the fs:scope entry must still exist");
  for (const { path } of scope.allow) {
    assert.match(path, /^\$[A-Z]+/, `${path} must stay anchored to a named directory`);
  }
});

// --- Documents handed to the shell before the webview exists -----------------

test("a cold-start launch document is buffered as well as emitted", () => {
  const rust = read("src-tauri/src/lib.rs");
  // setup() runs before the page loads, so the event alone reached nobody.
  assert.match(rust, /struct PendingOpenPaths\(std::sync::Mutex<Vec<String>>\)/);
  assert.match(rust, /\.manage\(PendingOpenPaths::default\(\)\)/);

  const deliver = rust.slice(
    rust.indexOf("fn deliver_open_paths"),
    rust.indexOf("// --- Atomic document replacement"),
  );
  assert.match(deliver, /buffered\.extend\(paths\.iter\(\)\.cloned\(\)\)/);
  assert.match(deliver, /window\.emit\("file:open-path", paths\)/);
  // Every delivery path goes through it, including the single-instance one
  // that already worked.
  assert.doesNotMatch(rust, /fn emit_open_paths/);
  assert.equal(rust.match(/deliver_open_paths\(/g).length, 4);
});

test("draining the buffer is an invokable command the frontend can call", () => {
  const rust = read("src-tauri/src/lib.rs");
  assert.match(rust, /#\[tauri::command\]\s*\nfn take_pending_open_paths/);
  assert.match(rust, /-> Vec<String>/);
  // Draining empties the buffer, so a path is never opened twice.
  assert.match(rust, /std::mem::take\(&mut \*buffered\)/);
  assert.match(
    rust,
    /generate_handler!\[\s*replace_document_atomically,\s*take_pending_open_paths\s*\]/,
  );
});

test("both backends expose the pending-open queue through the platform layer", () => {
  assert.match(read("src/platform/types.ts"), /takePendingOpenPaths\(\): Promise<string\[\]>/);
  assert.match(
    read("src/platform/desktop.ts"),
    /takePendingOpenPaths\(\): Promise<string\[\]> \{\s*return invoke<string\[\]>\("take_pending_open_paths"\);/,
  );
  // A browser launch arrives through the File Handling API instead.
  assert.match(
    read("src/platform/web/webPlatform.ts"),
    /async takePendingOpenPaths\(\): Promise<string\[\]> \{\s*return \[\];/,
  );
});

test("the native shell no longer claims to open ODT", () => {
  const rust = read("src-tauri/src/lib.rs");
  assert.doesNotMatch(rust, /Some\("docx" \| "odt" \| "owdoc"\)/);
  assert.match(rust, /Some\("docx" \| "owdoc"\)/);
  const associations = JSON.parse(read("src-tauri/tauri.conf.json")).bundle?.fileAssociations ?? [];
  assert.deepEqual(
    associations.flatMap((association) => association.ext ?? []).sort(),
    ["docx", "owdoc"],
  );
});

// --- One recovery slot per shell ---------------------------------------------

function fakeSlot() {
  let stored = null;
  return {
    get stored() {
      return stored;
    },
    async write(metadata, bytes) {
      stored = { metadata, bytes };
    },
    async read() {
      return stored;
    },
    async clear() {
      stored = null;
    },
  };
}

function metadata(format, generation) {
  return {
    version: 1,
    generation,
    createdAt: new Date().toISOString(),
    fileName: format === "owdoc" ? "Notes.owdoc" : `Report.${format}`,
    originalPath: null,
    format,
    documentFile: `${generation}.${format}`,
  };
}

test("a snapshot is routed to its own shell's slot by format, never by guesswork", () => {
  assert.equal(slots.recoveryShellForFormat("owdoc"), "editor");
  assert.equal(slots.recoveryShellForFormat("docx"), "writer");
  assert.equal(slots.recoveryShellForFormat("odt"), "writer");
});

test("one shell's autosave never overwrites the other shell's snapshot", async () => {
  const editor = fakeSlot();
  const writer = fakeSlot();
  const store = slots.createShellScopedRecoveryStore({ editor, writer }, () => "editor");

  await store.write(metadata("docx", "writer-1"), new Uint8Array([1]));
  await store.write(metadata("owdoc", "editor-1"), new Uint8Array([2]));

  assert.equal(writer.stored.metadata.generation, "writer-1");
  assert.equal(editor.stored.metadata.generation, "editor-1");
  // Reads resolve by the running shell, so each shell sees only its own.
  assert.equal((await store.read()).metadata.generation, "editor-1");
});

test("one shell's discard never deletes the other shell's snapshot", async () => {
  const editor = fakeSlot();
  const writer = fakeSlot();
  const asEditor = slots.createShellScopedRecoveryStore({ editor, writer }, () => "editor");
  const asWriter = slots.createShellScopedRecoveryStore({ editor, writer }, () => "writer");

  await asWriter.write(metadata("docx", "writer-1"), new Uint8Array([1]));
  await asEditor.write(metadata("owdoc", "editor-1"), new Uint8Array([2]));

  await asEditor.clear();
  assert.equal(editor.stored, null);
  assert.equal(writer.stored.metadata.generation, "writer-1");

  await asWriter.clear();
  assert.equal(writer.stored, null);
});

test("the browser backend gives each shell its own storage key", async () => {
  const backing = new Map();
  const kv = {
    async get(key) {
      return backing.get(key);
    },
    async set(key, value) {
      backing.set(key, value);
    },
    async delete(key) {
      backing.delete(key);
    },
  };

  const store = slots.createShellScopedRecoveryStore(
    {
      // The editor keeps the original key so snapshots written before the
      // slots were split are still offered back.
      editor: recoveryStore.createWebRecoveryStore(kv),
      writer: recoveryStore.createWebRecoveryStore(kv, "recovery/current/writer"),
    },
    () => "editor",
  );

  await store.write(metadata("docx", "writer-1"), new Uint8Array([1]));
  await store.write(metadata("owdoc", "editor-1"), new Uint8Array([2]));
  assert.deepEqual([...backing.keys()].sort(), ["recovery/current", "recovery/current/writer"]);

  await store.clear();
  assert.deepEqual([...backing.keys()], ["recovery/current/writer"]);
  assert.equal(await store.read(), null);
});

test("the desktop backend gives each shell its own pointer file", () => {
  const desktop = read("src/platform/desktop.ts");
  assert.match(desktop, /createRecoverySlot\("current\.json"\)/);
  assert.match(desktop, /createRecoverySlot\("current-writer\.json"\)/);
  assert.match(desktop, /createShellScopedRecoveryStore\(/);
  // Both backends resolve the running shell the same way.
  for (const path of ["src/platform/desktop.ts", "src/platform/web/webPlatform.ts"]) {
    assert.match(read(path), /import \{ resolveShellMode \} from "@\/lib\/shellMode"/);
  }
});
