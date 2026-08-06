import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";

const policyUrl = new URL("../../src/writer/package_preservation_policy.js", import.meta.url);
const vaultUrl = new URL("../../src/writer/package_preservation_vault.js", import.meta.url);

function loadVault() {
  const context = { Object, Error, Uint8Array };
  runInNewContext(readFileSync(policyUrl, "utf8"), context, { filename: policyUrl.pathname });
  runInNewContext(readFileSync(vaultUrl, "utf8"), context, { filename: vaultUrl.pathname });
  return context.OPENWORD_PACKAGE_VAULT;
}

const entry = (path, value) => ({ path, bytes: new Uint8Array([value]) });
const plain = (value) => JSON.parse(JSON.stringify(value));

test("captures classified original entries without retaining unsafe paths", () => {
  const vault = loadVault();
  const snapshot = vault.capture("docx", [
    entry("word/document.xml", 1),
    entry("customXml/item1.xml", 2),
    entry("_xmlsignatures/sig1.xml", 3),
  ]);
  assert.deepEqual(
    plain(snapshot.entries.map(({ path, classification }) => ({ path, classification }))),
    [
      { path: "word/document.xml", classification: "writer-owned" },
      { path: "customXml/item1.xml", classification: "preserve-opaque" },
      { path: "_xmlsignatures/sig1.xml", classification: "drop-signature" },
    ],
  );
  assert.throws(() => vault.capture("docx", [entry("../escape.xml", 1)]), /unsafe package path/);
});

test("restores absent opaque parts while Writer wins every modeled or conflicting part", () => {
  const vault = loadVault();
  const snapshot = vault.capture("docx", [
    entry("word/document.xml", 1),
    entry("customXml/item1.xml", 2),
    entry("vendor/keep.bin", 3),
  ]);
  const merged = vault.merge(snapshot, [
    entry("word/document.xml", 9),
    entry("vendor/keep.bin", 8),
  ]);

  const byPath = new Map(merged.entries.map((item) => [item.path, item.bytes[0]]));
  assert.equal(byPath.get("word/document.xml"), 9);
  assert.equal(byPath.get("vendor/keep.bin"), 8);
  assert.equal(byPath.get("customXml/item1.xml"), 2);
  assert.deepEqual(plain(merged.report), {
    restored: ["customXml/item1.xml"],
    writerWon: ["word/document.xml", "vendor/keep.bin"],
    droppedSignatures: [],
    blockedExecutables: [],
  });
});

test("never restores invalid signatures or executable payloads", () => {
  const vault = loadVault();
  const snapshot = vault.capture("odt", [
    entry("META-INF/documentsignatures.xml", 1),
    entry("Scripts/python/run.py", 2),
    entry("Vendor/keep.xml", 3),
  ]);
  const merged = vault.merge(snapshot, []);
  assert.deepEqual(plain(merged.entries.map((item) => item.path)), ["Vendor/keep.xml"]);
  assert.deepEqual(plain(merged.report.droppedSignatures), ["META-INF/documentsignatures.xml"]);
  assert.deepEqual(plain(merged.report.blockedExecutables), ["Scripts/python/run.py"]);
});

test("filters unsafe parts even when Writer output contains them", () => {
  const vault = loadVault();
  const snapshot = vault.capture("docx", [entry("word/document.xml", 1)]);
  const merged = vault.merge(snapshot, [
    entry("word/document.xml", 9),
    entry("_xmlsignatures/sig1.xml", 2),
    entry("word/vbaProject.bin", 3),
  ]);
  assert.deepEqual(plain(merged.entries.map((item) => item.path)), ["word/document.xml"]);
  assert.deepEqual(plain(merged.report.droppedSignatures), ["_xmlsignatures/sig1.xml"]);
  assert.deepEqual(plain(merged.report.blockedExecutables), ["word/vbaProject.bin"]);
});

test("resolves relationship targets relative to their owning package part", () => {
  const vault = loadVault();
  assert.equal(
    vault.resolveRelationshipTarget("word/_rels/document.xml.rels", "../customXml/item1.xml"),
    "customXml/item1.xml",
  );
  assert.equal(
    vault.resolveRelationshipTarget("word/_rels/header1.xml.rels", "media/image1.png"),
    "word/media/image1.png",
  );
  assert.equal(vault.resolveRelationshipTarget("_rels/.rels", "docProps/core.xml"), "docProps/core.xml");
  assert.equal(vault.resolveRelationshipTarget("word/_rels/document.xml.rels", "https://example.com"), null);
  assert.throws(
    () => vault.resolveRelationshipTarget("word/_rels/document.xml.rels", "../../../escape.xml"),
    /unsafe relationship target/,
  );
});

test("freezes snapshots and reports to prevent later mutation", () => {
  const vault = loadVault();
  const snapshot = vault.capture("docx", [entry("customXml/item1.xml", 1)]);
  const merged = vault.merge(snapshot, []);
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.entries), true);
  assert.equal(Object.isFrozen(merged.report), true);
});
