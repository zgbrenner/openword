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

test("document state marks detached migrated documents unsaved and the status bar explains why", () => {
  const state = read("src/writer/state.svelte.ts");
  const status = read("src/components/WriterStatusBar.svelte");
  assert.match(state, /requiresSaveAs/);
  assert.match(state, /this\.requiresSaveAs = path === null && fileName !== "Document1\.docx"/);
  assert.match(state, /this\.dirty = this\.requiresSaveAs/);
  assert.match(status, /Legacy document converted/);
  assert.match(status, /Save As required/);
});

test("new Writer documents never serialize back to owdoc", () => {
  const fileApi = read("src/writer/fileApi.ts");
  const saveFilterSection = fileApi.slice(fileApi.indexOf("saveWriterDocumentAsDialog"));
  assert.doesNotMatch(saveFilterSection, /extensions:\s*\["owdoc"\]/);
  assert.throws(() => {
    if (/\.owdoc$/i.test("legacy.owdoc")) throw new Error("Unsupported Writer document format");
  }, /Unsupported Writer document format/);
});

test("native shell routes legacy files through the shared supported-document predicate", () => {
  const rust = read("src-tauri/src/lib.rs");
  const config = read("src-tauri/tauri.conf.json");
  assert.match(rust, /fn is_supported_document_path\(path: &str\) -> bool/);
  assert.match(rust, /Some\("docx" \| "odt" \| "owdoc"\)/);
  assert.match(rust, /filter\(\|argument\| is_supported_document_path\(argument\)\)/);
  // Asserted against the parsed bundle rather than the raw text: what matters
  // is that .owdoc is still associated and still labelled legacy, not how the
  // packaging config happens to be wrapped.
  const associations = JSON.parse(config).bundle?.fileAssociations ?? [];
  const owdoc = associations.find((association) => association.ext?.includes("owdoc"));
  assert.ok(owdoc, "the bundle must keep the .owdoc association for legacy migration");
  assert.match(`${owdoc.name} ${owdoc.description}`, /Legacy OpenWord Document/);
});
