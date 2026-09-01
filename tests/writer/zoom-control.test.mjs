import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

test("status bar exposes zoom out, reset, and zoom in controls driven by onzoom and state.zoomPercent", () => {
  const status = read("src/components/WriterStatusBar.svelte");
  assert.match(status, /export let onzoom: \(percent: number\) => void = \(\) => \{\}/);
  assert.match(status, /aria-label="Zoom out"/);
  assert.match(status, /aria-label="Zoom in"/);
  assert.match(status, /aria-label="Reset zoom to 100%"/);
  assert.match(status, /onzoom\(100\)/);
  assert.match(status, /state\.zoomPercent/);
  assert.match(status, /\[25, 50, 75, 90, 100, 125, 150, 200, 300, 400\]/);
  assert.match(status, /disabled=\{!state\.ready \|\| zoomOutTarget === null\}/);
  assert.match(status, /disabled=\{!state\.ready \|\| zoomInTarget === null\}/);
});

test("UNO worker sets zoom by value with the 25-400 clamp and posts the authoritative view.zoom event", () => {
  const worker = read("public/writer-runtime/openword_writer_thread.js");
  assert.match(worker, /function setViewZoom\(percent\)/);
  assert.match(worker, /value < 25 \|\| value > 400/);
  assert.match(worker, /setPropertyValue\("ZoomType", ZOOM_BY_VALUE\)/);
  assert.match(worker, /setPropertyValue\("ZoomValue", value\)/);
  assert.match(worker, /postEvent\("view\.zoom", \{ percent: value \}\)/);
});

test("UNO worker reports the current zoom when a document model activates", () => {
  const worker = read("public/writer-runtime/openword_writer_thread.js");
  assert.match(worker, /function emitViewZoom\(\)/);
  const activation = worker.slice(worker.indexOf("function activateModel"));
  assert.notEqual(activation, "");
  assert.match(activation, /emitViewZoom\(\);/);
});

test("protocol declares the view.setZoom command and the view.zoom event", () => {
  const protocol = read("src/writer/protocol.ts");
  assert.match(protocol, /type: "view\.setZoom"; percent: number/);
  assert.match(protocol, /event: "view\.zoom"; payload: \{ percent: number \}/);
});

test("WriterState applies view.zoom events to zoomPercent", () => {
  const state = read("src/writer/state.svelte.ts");
  assert.match(state, /zoomPercent = \$state\(100\)/);
  assert.match(state, /case "view\.zoom":/);
  assert.match(state, /this\.zoomPercent = event\.payload\.percent/);
});
