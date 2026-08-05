import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";

const sourceUrl = new URL("../../src/writer/package_preservation_policy.js", import.meta.url);

function loadPolicy() {
  const context = { Object, Error };
  runInNewContext(readFileSync(sourceUrl, "utf8"), context, { filename: sourceUrl.pathname });
  return context.OPENWORD_PACKAGE_PRESERVATION;
}

test("classifies Writer-owned DOCX parts separately from opaque package data", () => {
  const policy = loadPolicy();
  assert.equal(policy.classify("docx", "word/document.xml"), "writer-owned");
  assert.equal(policy.classify("docx", "word/_rels/document.xml.rels"), "writer-owned");
  assert.equal(policy.classify("docx", "customXml/item1.xml"), "preserve-opaque");
  assert.equal(policy.classify("docx", "word/embeddings/oleObject1.bin"), "preserve-opaque");
  assert.equal(policy.classify("docx", "vendor/acme-extension.xml"), "preserve-opaque");
});

test("drops invalidated signatures and quarantines executable payloads", () => {
  const policy = loadPolicy();
  assert.equal(policy.classify("docx", "_xmlsignatures/sig1.xml"), "drop-signature");
  assert.equal(policy.classify("docx", "word/vbaProject.bin"), "blocked-executable");
  assert.equal(policy.classify("odt", "META-INF/documentsignatures.xml"), "drop-signature");
  assert.equal(policy.classify("odt", "Scripts/python/evil.py"), "blocked-executable");
  assert.equal(policy.classify("odt", "Basic/Standard/Module1.xml"), "blocked-executable");
});

test("recognizes Writer-owned ODT package files while preserving vendor extensions", () => {
  const policy = loadPolicy();
  for (const path of ["content.xml", "styles.xml", "settings.xml", "meta.xml", "META-INF/manifest.xml"])
    assert.equal(policy.classify("odt", path), "writer-owned");
  assert.equal(policy.classify("odt", "Configurations2/accelerator/current.xml"), "preserve-opaque");
  assert.equal(policy.classify("odt", "Vendor/acme.xml"), "preserve-opaque");
});

test("restores only absent safe opaque parts and reports every other outcome", () => {
  const policy = loadPolicy();
  assert.equal(policy.action("preserve-opaque", false), "restore");
  assert.equal(policy.action("preserve-opaque", true), "writer-won");
  assert.equal(policy.action("writer-owned", false), "writer-won");
  assert.equal(policy.action("drop-signature", false), "drop-signature");
  assert.equal(policy.action("blocked-executable", false), "block-executable");
});

test("normalizes hostile paths and rejects unsupported package formats", () => {
  const policy = loadPolicy();
  assert.equal(policy.normalize("/customXml\\item1.xml"), "customXml/item1.xml");
  assert.throws(() => policy.normalize("../outside.xml"), /unsafe package path/);
  assert.throws(() => policy.classify("pdf", "x"), /unsupported package format/);
  assert.equal(Object.isFrozen(policy), true);
});
