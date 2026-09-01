/*
 * Uploads the built Writer runtime to the R2 bucket that worker/index.ts reads.
 *
 * Every file is verified against public/writer-runtime/runtime-manifest.json
 * before it is sent, so a runtime that does not match its own manifest can
 * never reach production — the browser-side runtime host checks the same
 * hashes and refuses to start on a mismatch.
 *
 * runtime-manifest.json is uploaded last. The service worker treats it as the
 * cache-invalidation signal (it drops the runtime cache when the manifest body
 * changes), so publishing it before the bytes it describes would hand clients a
 * manifest that does not match what the bucket is still serving.
 *
 * Wrangler uploads at most 315 MB per object and one object at a time
 * (https://developers.cloudflare.com/r2/objects/upload-objects/). soffice.data
 * can exceed that, so `--tool rclone` switches to a multipart-capable client.
 */

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

/* Cloudflare documents this as "315 MB"; treat it as decimal and stay under. */
const WRANGLER_MAX_BYTES = 315_000_000;

const CONTENT_TYPES = {
  js: "text/javascript; charset=utf-8",
  json: "application/json; charset=utf-8",
  wasm: "application/wasm",
  metadata: "application/json; charset=utf-8",
};

const MANIFEST_FILE = "runtime-manifest.json";

function fail(message) {
  console.error(`upload-writer-runtime: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const options = { tool: "wrangler", remote: "r2", bucket: null, dryRun: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      const value = argv[index + 1];
      if (value === undefined) fail(`${arg} requires a value`);
      index += 1;
      return value;
    };
    if (arg === "--tool") options.tool = next();
    else if (arg === "--remote") options.remote = next();
    else if (arg === "--bucket") options.bucket = next();
    else if (arg === "--dry-run") options.dryRun = true;
    else fail(`unknown argument: ${arg}`);
  }
  if (options.tool !== "wrangler" && options.tool !== "rclone") {
    fail(`--tool must be "wrangler" or "rclone" (got "${options.tool}")`);
  }
  return options;
}

/* Single source of truth for the bucket name: the Worker's own binding. */
function bucketFromWranglerConfig() {
  const config = readFileSync(resolve(root, "wrangler.toml"), "utf8");
  const match = /^\s*bucket_name\s*=\s*"([^"]+)"/m.exec(config);
  if (!match) fail("could not read bucket_name from wrangler.toml");
  return match[1];
}

function contentTypeFor(name) {
  const extension = name.slice(name.lastIndexOf(".") + 1).toLowerCase();
  return CONTENT_TYPES[extension] ?? "application/octet-stream";
}

function run(command, args, dryRun) {
  console.log(`  $ ${command} ${args.join(" ")}`);
  if (dryRun) return;
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.error) fail(`failed to run ${command}: ${result.error.message}`);
  if (result.status !== 0) fail(`${command} exited with status ${result.status}`);
}

const options = parseArgs(process.argv.slice(2));
const bucket = options.bucket ?? bucketFromWranglerConfig();

const engineManifest = JSON.parse(readFileSync(resolve(root, "engine/manifest.json"), "utf8"));
const runtimeDir = resolve(root, engineManifest.runtimeDirectory);
const artifactManifestPath = resolve(runtimeDir, MANIFEST_FILE);

if (!existsSync(artifactManifestPath)) {
  fail(`${MANIFEST_FILE} is missing. Build or install the runtime first (npm run engine:build).`);
}
const artifacts = JSON.parse(readFileSync(artifactManifestPath, "utf8"));

const files = [...engineManifest.runtimeFiles];
for (const name of engineManifest.optionalRuntimeFiles ?? []) {
  if (existsSync(resolve(runtimeDir, name))) files.push(name);
}

/* Verify before uploading anything, so a bad runtime fails without a partial publish. */
let totalBytes = 0;
const oversized = [];
for (const name of files) {
  const path = resolve(runtimeDir, name);
  if (!existsSync(path)) fail(`runtime file is missing: ${name}`);
  const bytes = readFileSync(path);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const recorded = artifacts.files?.[name];
  if (!recorded || recorded.sha256 !== sha256 || recorded.bytes !== bytes.byteLength) {
    fail(`runtime artifact does not match ${MANIFEST_FILE}: ${name}`);
  }
  totalBytes += bytes.byteLength;
  if (bytes.byteLength > WRANGLER_MAX_BYTES) oversized.push({ name, bytes: bytes.byteLength });
}
totalBytes += statSync(artifactManifestPath).size;

console.log(`Verified ${files.length} runtime files against ${MANIFEST_FILE}.`);

if (options.tool === "wrangler" && oversized.length > 0) {
  const listed = oversized
    .map(({ name, bytes }) => `  - ${name} (${(bytes / 1_000_000).toFixed(0)} MB)`)
    .join("\n");
  fail(
    `these files exceed Wrangler's 315 MB single-object upload limit:\n${listed}\n\n` +
      "Configure an rclone remote for R2 and re-run with:\n" +
      `  node scripts/deploy/upload-writer-runtime.mjs --tool rclone --remote ${options.remote}\n` +
      "See https://developers.cloudflare.com/r2/examples/rclone/",
  );
}

console.log(
  `Uploading ${(totalBytes / 1024 / 1024).toFixed(1)} MiB to r2://${bucket} via ${options.tool}` +
    (options.dryRun ? " (dry run)" : "") +
    ".",
);

/* Bytes first, manifest last: the manifest is the client's invalidation signal. */
for (const name of [...files, MANIFEST_FILE]) {
  const path = resolve(runtimeDir, name);
  const contentType = contentTypeFor(name);
  console.log(`- ${name}`);
  if (options.tool === "wrangler") {
    run(
      "npx",
      [
        "wrangler@4",
        "r2",
        "object",
        "put",
        `${bucket}/${name}`,
        `--file=${path}`,
        `--content-type=${contentType}`,
        "--remote",
      ],
      options.dryRun,
    );
  } else {
    run(
      "rclone",
      [
        "copyto",
        path,
        `${options.remote}:${bucket}/${name}`,
        "--header-upload",
        `Content-Type: ${contentType}`,
      ],
      options.dryRun,
    );
  }
}

console.log(`Done. Deploy the shell with \`npm run deploy:web\`.`);
