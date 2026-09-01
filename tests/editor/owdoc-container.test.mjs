import assert from "node:assert/strict";
import test from "node:test";

const container = await import(new URL("../../src/editor/document_file.js", import.meta.url));

const DOC = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Hello" }] }] };
const COMMENTS = [
  {
    id: "comment-1",
    resolved: false,
    entries: [{ id: "entry-1", author: "Ada", text: "Check this", createdAt: 1 }],
  },
];
const SUGGESTION_META = { 3: { author: "Ada", date: 2 } };

// --- The .owdoc envelope -----------------------------------------------------

test("an .owdoc file round-trips the document and both side-stores", () => {
  const parsed = container.parseOwDocFile(
    container.serializeOwDocFile(DOC, COMMENTS, SUGGESTION_META),
  );
  assert.deepEqual(parsed.doc, DOC);
  assert.deepEqual(parsed.comments, COMMENTS);
  assert.deepEqual(parsed.suggestionMeta, SUGGESTION_META);
});

test("the serialized envelope declares the current format version", () => {
  const raw = JSON.parse(container.serializeOwDocFile(DOC, [], {}));
  assert.equal(container.OWDOC_VERSION, 2);
  assert.equal(raw.version, container.OWDOC_VERSION);
  assert.deepEqual(raw.doc, DOC);
});

test("version 1 files — a bare document from before comments existed — still open", () => {
  const parsed = container.parseOwDocFile(JSON.stringify(DOC));
  assert.deepEqual(parsed.doc, DOC);
  assert.deepEqual(parsed.comments, []);
  assert.deepEqual(parsed.suggestionMeta, {});
});

test("side-stores of the wrong shape are normalized instead of taking the document down", () => {
  const parsed = container.parseOwDocFile(
    JSON.stringify({ version: 2, doc: DOC, comments: "not-a-list", suggestionMeta: [] }),
  );
  assert.deepEqual(parsed.doc, DOC);
  assert.deepEqual(parsed.comments, []);
  assert.deepEqual(parsed.suggestionMeta, {});
});

test("a file carrying no document content is rejected rather than opening empty", () => {
  assert.throws(() => container.parseOwDocFile(JSON.stringify({ version: 2, comments: [] })));
  assert.throws(() => container.parseOwDocFile(JSON.stringify({ version: 2, doc: "text" })));
  assert.throws(() => container.parseOwDocFile(JSON.stringify([DOC])));
  assert.throws(() => container.parseOwDocFile("null"));
  assert.throws(() => container.parseOwDocFile("not json at all"));
});

// --- Path derivation shared by the file dialogs ------------------------------

test("the document format follows the extension on every platform's path shape", () => {
  assert.equal(container.documentFormatForPath("C:\\Users\\me\\Quarterly Report.DOCX"), "docx");
  assert.equal(container.documentFormatForPath("/home/me/Quarterly Report.docx"), "docx");
  assert.equal(container.documentFormatForPath("openword-web://opfs/Documents/A.docx"), "docx");
  assert.equal(container.documentFormatForPath("/home/me/Notes.owdoc"), "owdoc");
  // Anything without a Word extension is OpenWord's own format, so a target
  // the user typed without an extension still round-trips.
  assert.equal(container.documentFormatForPath("Untitled"), "owdoc");
});

test("Save As seeds its name field from the base name", () => {
  assert.equal(container.documentBaseName("Quarterly Report.docx"), "Quarterly Report");
  assert.equal(container.documentBaseName("Notes.owdoc"), "Notes");
  assert.equal(container.documentBaseName("Untitled document"), "Untitled document");
  assert.equal(container.documentBaseName("archive.tar.gz"), "archive.tar");
});
