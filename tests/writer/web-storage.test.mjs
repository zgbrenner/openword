import assert from "node:assert/strict";
import test from "node:test";

const webPaths = await import(new URL("../../src/platform/web/web_paths.js", import.meta.url));
const recoveryStore = await import(
  new URL("../../src/platform/web/web_recovery_store.js", import.meta.url)
);
const opfs = await import(new URL("../../src/platform/web/opfs_files.js", import.meta.url));

// --- Web document path tokens ------------------------------------------------

test("web document paths behave like desktop paths for name and format derivation", () => {
  const path = webPaths.opfsWebPath(["Documents"], "Quarterly Report.docx");
  // The application derives the file name with split(/[\\/]/).pop() and the
  // format with a lowercase extension suffix check; both must keep working.
  assert.equal(path.split(/[\\/]/).pop(), "Quarterly Report.docx");
  assert.ok(path.toLowerCase().endsWith(".docx"));
  assert.equal(webPaths.webDocumentFileName(path), "Quarterly Report.docx");
});

test("web document paths round-trip through the parser", () => {
  assert.deepEqual(webPaths.parseWebDocumentPath(webPaths.handleWebPath("abc42", "Notes.odt")), {
    scheme: "handle",
    handleId: "abc42",
    fileName: "Notes.odt",
  });
  assert.deepEqual(webPaths.parseWebDocumentPath(webPaths.downloadWebPath("Out.pdf")), {
    scheme: "download",
    fileName: "Out.pdf",
  });
  assert.deepEqual(webPaths.parseWebDocumentPath(webPaths.opfsWebPath(["Documents"], "A.docx")), {
    scheme: "opfs",
    segments: ["Documents", "A.docx"],
    fileName: "A.docx",
  });
});

test("malformed tokens and hostile names are rejected", () => {
  assert.equal(webPaths.parseWebDocumentPath("/home/user/plain.docx"), null);
  assert.equal(webPaths.parseWebDocumentPath("openword-web://handle/only-an-id"), null);
  assert.equal(webPaths.parseWebDocumentPath("openword-web://opfs//gap.docx"), null);
  assert.equal(webPaths.parseWebDocumentPath("openword-web://unknown/x.docx"), null);
  for (const name of ["", "  ", "..", "a/b.docx", "a\\b.docx"]) {
    assert.throws(() => webPaths.sanitizeWebFileName(name));
  }
  assert.equal(webPaths.sanitizeWebFileName("My Report.docx"), "My Report.docx");
});

// --- Recovery store over an atomic key-value backend -------------------------

function memoryKv() {
  const backing = new Map();
  const calls = { set: 0 };
  return {
    calls,
    async get(key) {
      return backing.get(key);
    },
    async set(key, value) {
      calls.set += 1;
      backing.set(key, value);
    },
    async delete(key) {
      backing.delete(key);
    },
  };
}

function metadata(overrides = {}) {
  return {
    version: 1,
    generation: "gen-1",
    createdAt: new Date().toISOString(),
    fileName: "Report.docx",
    originalPath: null,
    format: "docx",
    documentFile: "gen-1.docx",
    ...overrides,
  };
}

test("web recovery snapshots round-trip and clear", async () => {
  const kv = memoryKv();
  const store = recoveryStore.createWebRecoveryStore(kv);
  const bytes = new Uint8Array([1, 2, 3]);

  await store.write(metadata(), bytes);
  const snapshot = await store.read();
  assert.equal(snapshot.metadata.fileName, "Report.docx");
  assert.deepEqual(snapshot.bytes, bytes);

  await store.clear();
  assert.equal(await store.read(), null);
});

test("each web recovery generation is committed as one atomic write", async () => {
  const kv = memoryKv();
  const store = recoveryStore.createWebRecoveryStore(kv);
  await store.write(metadata(), new Uint8Array([1]));
  await store.write(metadata({ generation: "gen-2", documentFile: "gen-2.docx" }), new Uint8Array([2]));
  // Metadata and bytes must never be written separately: a crash between two
  // writes would strand a torn snapshot.
  assert.equal(kv.calls.set, 2);
  const snapshot = await store.read();
  assert.equal(snapshot.metadata.generation, "gen-2");
});

test("the web recovery store refuses malformed snapshots and ignores corrupt storage", async () => {
  const kv = memoryKv();
  const store = recoveryStore.createWebRecoveryStore(kv);

  await assert.rejects(store.write(metadata({ format: "rtf" }), new Uint8Array([1])));
  await assert.rejects(store.write(metadata(), new Uint8Array(0)));
  await assert.rejects(store.write({ garbage: true }, new Uint8Array([1])));

  await kv.set("recovery/current", { metadata: { version: 2 }, bytes: new Uint8Array([1]) });
  assert.equal(await store.read(), null);
  await kv.set("recovery/current", { metadata: metadata(), bytes: "not-bytes" });
  assert.equal(await store.read(), null);
});

// --- OPFS operations against an in-memory directory fake ---------------------

function fakeDirectory() {
  const directories = new Map();
  const files = new Map();
  return {
    files,
    async getDirectoryHandle(name, options = {}) {
      if (!directories.has(name)) {
        if (!options.create) throw new Error(`NotFoundError: ${name}`);
        directories.set(name, fakeDirectory());
      }
      return directories.get(name);
    },
    async getFileHandle(name, options = {}) {
      if (!files.has(name) && !options.create) throw new Error(`NotFoundError: ${name}`);
      if (!files.has(name)) files.set(name, { bytes: new Uint8Array(0), aborted: 0 });
      const record = files.get(name);
      return {
        async getFile() {
          return { async arrayBuffer() { return record.bytes.slice().buffer; } };
        },
        async createWritable() {
          let staged = null;
          return {
            async write(bytes) {
              if (bytes.failWrite) throw new Error("disk full");
              staged = Uint8Array.from(bytes);
            },
            // The visible file changes only when the stream closes.
            async close() {
              if (staged) record.bytes = staged;
            },
            async abort() {
              record.aborted += 1;
              staged = null;
            },
          };
        },
      };
    },
    async removeEntry(name) {
      if (!files.delete(name) && !directories.delete(name)) {
        throw new Error(`NotFoundError: ${name}`);
      }
    },
  };
}

test("OPFS writes create nested directories and read back byte-identical", async () => {
  const root = fakeDirectory();
  const bytes = new Uint8Array([10, 20, 30]);
  await opfs.writeOpfsFileAtomic(root, ["Documents", "Reports", "Q3.docx"], bytes);
  assert.deepEqual(await opfs.readOpfsFile(root, ["Documents", "Reports", "Q3.docx"]), bytes);
  assert.equal(await opfs.opfsFileExists(root, ["Documents", "Reports", "Q3.docx"]), true);
  assert.equal(await opfs.opfsFileExists(root, ["Documents", "Missing.docx"]), false);
});

test("a failed OPFS write aborts the stream and preserves the previous bytes", async () => {
  const root = fakeDirectory();
  await opfs.writeOpfsFileAtomic(root, ["Doc.docx"], new Uint8Array([1]));
  const poisoned = new Uint8Array([9]);
  poisoned.failWrite = true;
  await assert.rejects(opfs.writeOpfsFileAtomic(root, ["Doc.docx"], poisoned));
  assert.deepEqual(await opfs.readOpfsFile(root, ["Doc.docx"]), new Uint8Array([1]));
  assert.equal(root.files.get("Doc.docx").aborted, 1);
});

test("OPFS removal is best-effort and never throws for missing files", async () => {
  const root = fakeDirectory();
  await opfs.removeOpfsFile(root, ["Missing.docx"]);
  await opfs.writeOpfsFileAtomic(root, ["Doc.docx"], new Uint8Array([1]));
  await opfs.removeOpfsFile(root, ["Doc.docx"]);
  assert.equal(await opfs.opfsFileExists(root, ["Doc.docx"]), false);
});
