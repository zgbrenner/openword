/*
 * Prepares dist-web/ for `wrangler deploy`.
 *
 * Vite copies public/ verbatim, so a built dist-web/ contains the Writer
 * runtime. Workers static assets reject any single file over 25 MiB, and
 * soffice.wasm / soffice.data are far larger, so the runtime must be excluded
 * from the asset upload and served from R2 by worker/index.ts instead.
 *
 * .assetsignore is the supported mechanism for that, and it has to live in the
 * asset directory itself. It is written here rather than kept in public/ so the
 * desktop bundle never picks up a Cloudflare-only file.
 */

import { existsSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const distDir = resolve(root, "dist-web");
const runtimeDir = resolve(distDir, "writer-runtime");

/* gitignore syntax; no comments, to stay portable across parser versions. */
const ASSETS_IGNORE = "writer-runtime\nwriter-runtime/**\n";

function fail(message) {
  console.error(`prepare-web-deploy: ${message}`);
  process.exit(1);
}

if (!existsSync(resolve(distDir, "index.html"))) {
  fail("dist-web/index.html is missing. Run `npm run build:web` first.");
}
if (!existsSync(resolve(distDir, "_headers"))) {
  fail("dist-web/_headers is missing. It must be copied from public/ by the Vite build.");
}

writeFileSync(resolve(distDir, ".assetsignore"), ASSETS_IGNORE);

let excludedBytes = 0;
if (existsSync(runtimeDir)) {
  for (const name of readdirSync(runtimeDir)) {
    excludedBytes += statSync(resolve(runtimeDir, name)).size;
  }
}

const excludedMiB = (excludedBytes / 1024 / 1024).toFixed(1);
console.log(`Wrote dist-web/.assetsignore (excluded writer-runtime/, ${excludedMiB} MiB).`);
console.log("The runtime is served from R2 — upload it with `npm run deploy:runtime`.");
