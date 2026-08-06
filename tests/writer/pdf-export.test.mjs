import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

test("bridge exposes a dedicated PDF export request", () => {
  assert.match(read("src/writer/protocol.ts"), /"document\.exportPdf"/);
  assert.match(read("src/writer/client.ts"), /exportPdfPath\(path: string\)/);
});

test("UNO worker exports through LibreOffice's Writer PDF filter without marking the document clean", () => {
  const worker = read("public/writer-runtime/openword_writer_thread.js");
  assert.match(worker, /function exportPdf\(path\)/);
  assert.match(worker, /FilterName", Value: "writer_pdf_Export"/);
  assert.match(worker, /case "document\.exportPdf"/);
  assert.doesNotMatch(worker, /function exportPdf\(path\)[\s\S]*setModified\(false\)/);
});

test("file API writes PDF bytes atomically and the native File menu exposes the workflow", () => {
  const fileApi = read("src/writer/fileApi.ts");
  const app = read("src/App.svelte");
  const menu = read("src-tauri/src/menu.rs");
  assert.match(fileApi, /exportWriterPdfDialog/);
  assert.match(fileApi, /extensions:\s*\["pdf"\]/);
  assert.match(fileApi, /client\.exportPdfPath/);
  assert.match(fileApi, /replaceWithStagedFile\(targetPath, bytes\)/);
  assert.match(app, /case "file_export_pdf": return doExportPdf\(\)/);
  assert.match(menu, /"file_export_pdf", "Export as PDF\.\.\."/);
  assert.doesNotMatch(app, /case "file_export_pdf": return unavailable/);
});
