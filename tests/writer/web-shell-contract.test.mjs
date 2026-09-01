import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

test("the service worker injects cross-origin isolation headers", () => {
  const worker = read("public/openword-sw.js");
  assert.match(worker, /Cross-Origin-Opener-Policy/);
  assert.match(worker, /Cross-Origin-Embedder-Policy/);
  assert.match(worker, /Cross-Origin-Resource-Policy/);
  // Opaque and error responses cannot be reconstructed with new headers.
  assert.match(worker, /opaque/);
});

test("the service worker caches the shell and Writer runtime for offline use", () => {
  const worker = read("public/openword-sw.js");
  assert.match(worker, /openword-shell-/);
  assert.match(worker, /openword-runtime-/);
  assert.match(worker, /writer-runtime\//);
  // The integrity manifest must stay network-first so updates propagate.
  assert.match(worker, /runtime-manifest\.json/);
  // Partial reads of the large runtime data cannot come from the Cache API.
  assert.match(worker, /range/i);
  // Quota pressure from the multi-hundred-MB runtime must never break serving.
  assert.match(worker, /catch/);
});

test("service worker registration is guarded against reload loops and never blocks boot", () => {
  const client = read("src/lib/serviceWorkerClient.ts");
  assert.match(client, /\.\/openword-sw\.js/);
  assert.match(client, /sessionStorage/);
  assert.match(client, /crossOriginIsolated/);
  assert.match(client, /console\.warn/);
  // Registration happens only from the web shell, never under Tauri.
  const app = read("src/App.svelte");
  const webShell = app.slice(app.indexOf("function mountWebShell"));
  assert.match(webShell, /registerOpenWordServiceWorker\(\)/);
  const desktopShell = app.slice(
    app.indexOf("function mountDesktopShell"),
    app.indexOf("function mountWebShell"),
  );
  assert.doesNotMatch(desktopShell, /registerOpenWordServiceWorker/);
});

test("the web manifest mirrors the desktop file associations", () => {
  const manifest = JSON.parse(read("public/manifest.webmanifest"));
  assert.equal(manifest.name, "OpenWord");
  assert.equal(manifest.display, "standalone");
  const accepted = (manifest.file_handlers ?? []).flatMap((handler) =>
    Object.values(handler.accept ?? {}).flat(),
  );
  for (const extension of [".docx", ".odt", ".owdoc"]) {
    assert.ok(accepted.includes(extension), `file_handlers must accept ${extension}`);
  }
  for (const icon of manifest.icons ?? []) {
    assert.ok(
      existsSync(new URL(`public/${icon.src.replace(/^\.\//, "")}`, root)),
      `manifest icon must exist: ${icon.src}`,
    );
  }
});

test("the page links the manifest and the launch queue consumer opens documents", () => {
  const html = read("index.html");
  assert.match(html, /rel="manifest"/);
  const app = read("src/App.svelte");
  assert.match(app, /launchQueue\?\.setConsumer/);
  assert.match(app, /registerWebDocumentHandle/);
});

test("the website build is gated by the same verification as the desktop build", () => {
  const packageJson = JSON.parse(read("package.json"));
  const buildWeb = packageJson.scripts["build:web"];
  assert.ok(buildWeb, "build:web script must exist");
  const verify = buildWeb.indexOf("engine:verify");
  const tests = buildWeb.indexOf("test:writer");
  const build = buildWeb.indexOf("vite build --mode web");
  assert.ok(verify !== -1 && tests !== -1 && build !== -1);
  assert.ok(verify < tests && tests < build, "verify and tests must gate the web build");
  assert.ok(packageJson.scripts["preview:web"], "preview:web script must exist");
});
