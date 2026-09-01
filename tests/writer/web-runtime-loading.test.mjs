import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

test("the service worker invalidates the runtime cache when the manifest body changes", () => {
  const worker = read("public/openword-sw.js");
  // A dedicated manifest handler compares the fresh body against the cached copy.
  assert.match(worker, /function manifestNetworkFirst/);
  assert.match(worker, /cachedText !== freshText/);
  // A stale manifest drops the ENTIRE runtime cache so assets re-fetch.
  assert.match(worker, /caches\.delete\(RUNTIME_CACHE\)/);
  // A non-empty runtime cache with no cached manifest is also treated as stale.
  assert.match(worker, /keys\.length > 0/);
  // The invariant is documented where the handler lives.
  assert.match(worker, /cached runtime must always be the one described by the[\s*]+cached manifest/);
  // Offline fallback survives: network failure still serves the cached manifest.
  const handler = worker.slice(
    worker.indexOf("function manifestNetworkFirst"),
    worker.indexOf("download progress"),
  );
  assert.match(handler, /catch/);
  assert.match(handler, /caches\.match\(request\)/);
});

test("the service worker reports first-visit download progress over a broadcast channel", () => {
  const worker = read("public/openword-sw.js");
  assert.match(worker, /"openword-runtime-progress"/);
  assert.match(worker, /new BroadcastChannel\(PROGRESS_CHANNEL_NAME\)/);
  // Feature-guarded: environments without BroadcastChannel keep working.
  assert.match(worker, /typeof BroadcastChannel [!=]== "function"/);
  // Progress only makes sense with a parseable Content-Length.
  assert.match(worker, /content-length/i);
  // Messages are throttled per file (~250ms) and end with a "done" message.
  assert.match(worker, /PROGRESS_INTERVAL_MS = 250/);
  assert.match(worker, /kind: "progress"/);
  assert.match(worker, /kind: "done"/);
  // Reporting must never break serving: the wrap is inside try/catch.
  const wrap = worker.slice(
    worker.indexOf("function withDownloadProgress"),
    worker.indexOf("function cacheFirst"),
  );
  assert.match(wrap, /try/);
  assert.match(wrap, /return response;/);
});

test("the cache stores untouched bytes: the cache clone happens before the progress wrap", () => {
  const worker = read("public/openword-sw.js");
  const body = worker.slice(
    worker.indexOf("function cacheFirst"),
    worker.indexOf('self.addEventListener("fetch"'),
  );
  const cloneAt = body.indexOf("response.clone()");
  const wrapAt = body.indexOf("withDownloadProgress(");
  assert.ok(cloneAt !== -1, "cacheFirst must clone the network response for the cache");
  assert.ok(wrapAt !== -1, "cacheFirst must wrap network responses for progress");
  assert.ok(cloneAt < wrapAt, "the cache clone must be taken BEFORE the progress wrap");
  // Cache hits never report progress: the cached branch returns before any wrap.
  assert.ok(body.indexOf("if (cached) return") < cloneAt);
});

test("the canvas subscribes to runtime progress and renders an accessible indicator", () => {
  const canvas = read("src/components/WriterCanvas.svelte");
  // Same channel name as the service worker, feature-guarded.
  assert.match(canvas, /new BroadcastChannel\(PROGRESS_CHANNEL_NAME\)/);
  assert.match(canvas, /"openword-runtime-progress"/);
  assert.match(canvas, /typeof BroadcastChannel [!=]== "function"/);
  // Determinate, accessible progress bar.
  assert.match(canvas, /role="progressbar"/);
  assert.match(canvas, /aria-valuemin/);
  assert.match(canvas, /aria-valuemax/);
  assert.match(canvas, /aria-valuenow/);
  assert.match(canvas, /aria-live="polite"/);
  // Completed files count fully toward the received total.
  assert.match(canvas, /"done"/);
  // First-visit explainer note.
  assert.match(canvas, /afterwards OpenWord works offline/);
  // The channel is closed on teardown and when loading ends.
  assert.match(canvas, /closeProgressChannel/);
  assert.match(canvas, /\.close\(\)/);
  // Indicator only appears once messages arrive; warm cache stays unchanged.
  assert.match(canvas, /\{#if showProgress\}/);
});
