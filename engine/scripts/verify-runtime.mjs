import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(scriptDir, "../..");
const manifest = JSON.parse(readFileSync(resolve(root, "engine/manifest.json"), "utf8"));
const lockPath = resolve(root, "engine/runtime.lock.json");
const runtimeDir = resolve(root, manifest.runtimeDirectory);
const artifactManifestPath = resolve(runtimeDir, "runtime-manifest.json");
const missing = [];

for (const name of manifest.runtimeFiles) {
  if (!existsSync(resolve(runtimeDir, name))) missing.push(name);
}
if (!existsSync(lockPath)) missing.push("engine/runtime.lock.json");
if (!existsSync(artifactManifestPath)) missing.push("runtime-manifest.json");

if (missing.length) {
  console.error(`Writer runtime is incomplete:\n${missing.map((name) => `- ${name}`).join("\n")}`);
  process.exit(1);
}

const lock = JSON.parse(readFileSync(lockPath, "utf8"));
for (const [name, source] of Object.entries(lock.sources)) {
  if (!source || typeof source !== "object" || !/^[a-f0-9]{40}$/.test(source.commit)) {
    throw new Error(`Invalid commit lock for ${name}`);
  }
}

const artifacts = JSON.parse(readFileSync(artifactManifestPath, "utf8"));
for (const [name, source] of Object.entries(lock.sources)) {
  const embedded = artifacts.sourceLock?.[name];
  if (!embedded || embedded.commit !== source.commit || embedded.repository !== source.repository) {
    throw new Error(`Writer runtime source mismatch for ${name}`);
  }
}

for (const file of manifest.runtimeFiles) {
  const bytes = readFileSync(resolve(runtimeDir, file));
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const recorded = artifacts.files?.[file];
  if (!recorded || recorded.sha256 !== sha256 || recorded.bytes !== bytes.byteLength) {
    throw new Error(`Writer runtime artifact mismatch: ${file}`);
  }
  console.log(`${sha256}  ${file}`);
}

console.log("Writer runtime source lock and artifact hashes verified.");
