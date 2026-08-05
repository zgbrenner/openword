import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

test("package adapter captures and merges DOCX/ODT archives through the tested vault", () => {
  const adapter = read("src/writer/packagePassthrough.ts");
  assert.match(adapter, /import JSZip from "jszip"/);
  assert.match(adapter, /OPENWORD_PACKAGE_VAULT\.capture/);
  assert.match(adapter, /OPENWORD_PACKAGE_VAULT\.merge/);
  assert.match(adapter, /mergeDocxContentTypes/);
  assert.match(adapter, /mergeDocxRelationships/);
  assert.match(adapter, /mergeOdtManifest/);
});

test("file open returns a preservation snapshot and same-format saves merge it before disk replacement", () => {
  const fileApi = read("src/writer/fileApi.ts");
  assert.match(fileApi, /preservation:\s*PackagePreservationSnapshot/);
  assert.match(fileApi, /capturePackage\(bytes, format\)/);
  assert.match(fileApi, /mergeWriterPackage\(bytes, format, preservation\)/);
  assert.match(fileApi, /compatibilityReport/);
});

test("recovery snapshots receive the same package-preservation treatment as user saves", () => {
  const recovery = read("src/writer/recovery.ts");
  assert.match(recovery, /preservation:\s*PackagePreservationSnapshot \| null/);
  assert.match(recovery, /mergeWriterPackage\(bytes, source\.format, source\.preservation\)/);
});

test("application carries the package snapshot across open, save, save-as, and recovery", () => {
  const app = read("src/App.svelte");
  assert.match(app, /let packagePreservation = .*PackagePreservationSnapshot/);
  assert.match(app, /packagePreservation = result\.preservation/);
  assert.match(app, /packagePreservation,/);
  assert.match(app, /compatibilityReport/);
});
