import assert from "node:assert/strict";
import test from "node:test";
import JSZip from "jszip";

import { DocxImportError, exportDocx, importDocx } from "./docx-test-env.mjs";

// ---------------------------------------------------------------------------
// Fixtures — built here rather than committed as binaries, so what each test
// feeds the importer is visible in the test.
// ---------------------------------------------------------------------------

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

const PACKAGE_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const NAMESPACES = [
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"',
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"',
  'xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"',
].join(" ");

/** A well-formed word/document.xml wrapping the given body children. */
const documentXml = (body) =>
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document ${NAMESPACES}><w:body>${body}</w:body></w:document>`;

const paragraph = (text) => `<w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;

/** Zips the given parts into .docx bytes, alongside the package boilerplate. */
async function docxBytes(parts) {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", CONTENT_TYPES);
  zip.file("_rels/.rels", PACKAGE_RELS);
  for (const [path, content] of Object.entries(parts)) zip.file(path, content);
  return zip.generateAsync({ type: "uint8array" });
}

const docxWithBody = (body) => docxBytes({ "word/document.xml": documentXml(body) });

const textOf = (doc) => doc.textBetween(0, doc.content.size, "\n", " ");

/**
 * Every one of these messages goes straight into an error dialog, so it has to
 * read as a sentence about the user's file rather than as parser output.
 */
function assertReadableForAUser(message) {
  assert.ok(typeof message === "string" && message.length > 40, `too terse to explain anything: ${message}`);
  assert.match(message, /Word (document|file)/, `should say what kind of file it is: ${message}`);
  assert.doesNotMatch(message, /parsererror|\[object |undefined|NaN/, `leaks internals: ${message}`);
}

/** Asserts that `run()` rejects with a DocxImportError whose message matches. */
async function assertImportRefused(bytes, pattern) {
  await assert.rejects(
    () => importDocx(bytes),
    (error) => {
      assert.ok(error instanceof DocxImportError, `expected a DocxImportError, got ${error}`);
      assert.match(error.message, pattern);
      assertReadableForAUser(error.message);
      return true;
    },
  );
}

// ---------------------------------------------------------------------------
// (a) Files we cannot read must fail loudly.
//
// Each of these used to resolve with an empty document. The caller then set
// the file path and marked the document clean, so the user saw a blank page
// under their file's name and the next save wrote that blank page over the
// original — with the staged-write backup deleted on success.
// ---------------------------------------------------------------------------

test("a file that is not a zip at all is refused instead of opening blank", async () => {
  const notAZip = new TextEncoder().encode("%PDF-1.7\nThis is emphatically not a .docx file.\n");
  await assertImportRefused(notAZip, /not a readable Word document/i);
});

test("a truncated zip is refused instead of opening blank", async () => {
  const whole = await docxWithBody(paragraph("Hello"));
  await assertImportRefused(whole.slice(0, Math.floor(whole.length / 2)), /not a readable Word document/i);
});

test("a .docx with no word/document.xml is refused instead of opening blank", async () => {
  const bytes = await docxBytes({ "docProps/app.xml": "<Properties/>" });
  await assertImportRefused(bytes, /missing the part that holds its text/i);
});

test("a .docx whose document.xml is malformed XML is refused instead of opening blank", async () => {
  // </w:body> is missing, so the document element closes over an open body.
  const malformed = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document ${NAMESPACES}><w:body>${paragraph("Hello")}</w:document>`;
  await assertImportRefused(await docxBytes({ "word/document.xml": malformed }), /not valid XML/i);
});

test("a .docx whose document.xml has no <w:body> is refused instead of opening blank", async () => {
  const noBody = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document ${NAMESPACES}><w:background w:color="FFFFFF"/></w:document>`;
  await assertImportRefused(await docxBytes({ "word/document.xml": noBody }), /no document body/i);
});

test("every refusal is a distinct explanation, not one catch-all message", async () => {
  const notAZip = new TextEncoder().encode("not a zip");
  const noPart = await docxBytes({ "docProps/app.xml": "<Properties/>" });
  const malformed = await docxBytes({
    "word/document.xml": `<w:document ${NAMESPACES}><w:body>${paragraph("Hi")}</w:document>`,
  });
  const noBody = await docxBytes({ "word/document.xml": `<w:document ${NAMESPACES}/>` });

  const messages = [];
  for (const bytes of [notAZip, noPart, malformed, noBody]) {
    const error = await importDocx(bytes).then(
      () => assert.fail("importDocx resolved for a file it cannot read"),
      (err) => err,
    );
    messages.push(error.message);
  }
  assert.equal(new Set(messages).size, messages.length, `messages repeat: ${JSON.stringify(messages, null, 2)}`);
});

test("importDocx never resolves with an empty document for an unreadable file", async () => {
  // The specific failure the blocker described: a silent empty result.
  for (const bytes of [
    new TextEncoder().encode("not a zip"),
    await docxBytes({}),
    await docxBytes({ "word/document.xml": "<w:document><w:body>" }),
    await docxBytes({ "word/document.xml": `<w:document ${NAMESPACES}/>` }),
  ]) {
    const result = await importDocx(bytes).then(
      (loaded) => loaded,
      () => null,
    );
    assert.equal(result, null, "an unreadable file must reject, never resolve");
  }
});

// ---------------------------------------------------------------------------
// (b) Valid files must keep opening — including ones full of things this
// importer does not model. Over-throwing here would make the app refuse real
// Word documents, which is its own kind of failure.
// ---------------------------------------------------------------------------

test("a minimal valid .docx still imports, with its text intact", async () => {
  const bytes = await docxWithBody(`${paragraph("Hello world")}${paragraph("Second paragraph")}`);
  const loaded = await importDocx(bytes);

  assert.equal(loaded.doc.type.name, "doc");
  assert.equal(loaded.doc.childCount, 2);
  assert.equal(textOf(loaded.doc), "Hello world\nSecond paragraph");
  assert.deepEqual(loaded.comments, []);
  assert.deepEqual(loaded.suggestionMeta, {});
});

test("a valid .docx with an empty body opens as an empty document rather than failing", async () => {
  const loaded = await importDocx(await docxWithBody("<w:sectPr/>"));
  assert.equal(loaded.doc.childCount, 1);
  assert.equal(textOf(loaded.doc), "");
});

test("features this importer does not model are dropped, not treated as damage", async () => {
  const exotic = [
    '<w:bookmarkStart w:id="0" w:name="_GoBack"/>',
    "<w:p>",
    '<w:proofErr w:type="spellStart"/>',
    '<w:r><w:t xml:space="preserve">Text with </w:t></w:r>',
    // A field, a shape and a footnote reference: all unmodelled.
    '<w:fldSimple w:instr=" PAGE "><w:r><w:t>1</w:t></w:r></w:fldSimple>',
    '<w:r><w:pict><v:shape id="s1"/></w:pict></w:r>',
    '<w:r><w:footnoteReference w:id="2"/></w:r>',
    '<w:r><w:t xml:space="preserve"> survives</w:t></w:r>',
    "</w:p>",
    '<w:bookmarkEnd w:id="0"/>',
    '<w:sectPr><w:pgSz w:w="12240" w:h="15840"/></w:sectPr>',
  ].join("");

  const loaded = await importDocx(await docxWithBody(exotic));
  assert.match(textOf(loaded.doc), /Text with .*survives/);
});

test("a damaged side part costs only what that part carried, never the text", async () => {
  // numbering.xml, styles.xml, comments.xml and the relationships part are all
  // unreadable here. None of them holds body text, so the document opens.
  const bytes = await docxBytes({
    "word/document.xml": documentXml(paragraph("The text is still here")),
    "word/numbering.xml": "<w:numbering><not-closed>",
    "word/styles.xml": "}{ not xml at all",
    "word/comments.xml": "<w:comments><w:comment>",
    "word/_rels/document.xml.rels": "<Relationships",
  });

  const loaded = await importDocx(bytes);
  assert.equal(textOf(loaded.doc), "The text is still here");
  assert.deepEqual(loaded.comments, []);
});

test("wrappers that only carry metadata keep the text nested inside them", async () => {
  const wrapped = [
    "<w:customXml><w:p><w:r><w:t>inside custom XML</w:t></w:r></w:p></w:customXml>",
    "<w:p><w:smartTag><w:r><w:t xml:space=\"preserve\"> and a smart tag</w:t></w:r></w:smartTag></w:p>",
    '<w:p><w:moveTo w:id="1" w:author="Ada" w:date="2026-01-01T00:00:00Z"><w:r><w:t>moved text</w:t></w:r></w:moveTo></w:p>',
  ].join("");

  const loaded = await importDocx(await docxWithBody(wrapped));
  const text = textOf(loaded.doc);
  assert.match(text, /inside custom XML/);
  assert.match(text, /and a smart tag/);
  assert.match(text, /moved text/);
});

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

test("a valid .docx survives import -> export -> import", async () => {
  const original = await docxWithBody(
    [
      '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>A heading</w:t></w:r></w:p>',
      '<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Bold body text</w:t></w:r></w:p>',
    ].join(""),
  );

  const loaded = await importDocx(original);
  const blob = await exportDocx(loaded.doc, loaded.comments, loaded.suggestionMeta);
  const written = new Uint8Array(await blob.arrayBuffer());

  assert.ok(written.length > 0, "an exported .docx must never be empty");
  assert.deepEqual([...written.slice(0, 4)], [0x50, 0x4b, 0x03, 0x04], "an exported .docx must be a zip");

  const reloaded = await importDocx(written);
  assert.equal(textOf(reloaded.doc), "A heading\nBold body text");
  assert.equal(reloaded.doc.child(0).type.name, "heading");
  assert.ok(reloaded.doc.child(1).child(0).marks.some((mark) => mark.type.name === "bold"));
});

test("exporting an empty document produces a real .docx, not a zero-byte file", async () => {
  const empty = (await importDocx(await docxWithBody(""))).doc;
  const blob = await exportDocx(empty, [], {});
  const written = new Uint8Array(await blob.arrayBuffer());
  assert.ok(written.length > 0);
  assert.deepEqual([...written.slice(0, 4)], [0x50, 0x4b, 0x03, 0x04]);
});
