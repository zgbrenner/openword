import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

test("legacy OpenWord files are accepted only through the one-way migration importer", () => {
  const fileApi = read("src/writer/fileApi.ts");
  assert.match(fileApi, /extensions:\s*\["docx", "odt", "owdoc"\]/);
  assert.match(fileApi, /async function migrateLegacyOwDoc/);
  assert.match(fileApi, /import\("@\/editor\/document"\)/);
  assert.match(fileApi, /import\("@\/docx\/export"\)/);
  assert.match(fileApi, /openWriterDocumentBytes\(bytes, "docx"/);
});

test("migration detaches the document from the legacy path and requires Save As", () => {
  const fileApi = read("src/writer/fileApi.ts");
  assert.match(fileApi, /path:\s*null/);
  assert.match(fileApi, /format:\s*"docx"/);
  assert.match(fileApi, /migration:/);
  assert.match(fileApi, /must be saved as DOCX or ODT/);
});

test("application marks migrated documents unsaved and explains the one-way conversion", () => {
  const app = read("src/App.svelte");
  assert.match(app, /if \(result\.migration\)/);
  assert.match(app, /writerState\.dirty = true/);
  assert.match(app, /result\.migration\.message/);
  assert.match(app, /Legacy document converted/);
});

test("new Writer documents never serialize back to owdoc", () => {
  const fileApi = read("src/writer/fileApi.ts");
  const saveFilterSection = fileApi.slice(fileApi.indexOf("saveWriterDocumentAsDialog"));
  assert.doesNotMatch(saveFilterSection, /extensions:\s*\["owdoc"\]/);
  assert.throws(() => {
    if (/\.owdoc$/i.test("legacy.owdoc")) throw new Error("Unsupported Writer document format");
  }, /Unsupported Writer document format/);
});

test("native shell still routes legacy files to the migration importer", () => {
  const rust = read("src-tauri/src/lib.rs");
  const config = read("src-tauri/tauri.conf.json");
  assert.match(rust, /ends_with\("\.owdoc"\)/);
  assert.match(config, /"ext": \["owdoc"\]/);
  assert.match(config, /Legacy OpenWord Document/);
});
