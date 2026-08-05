import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(scriptDir, "../..");
const manifest = JSON.parse(readFileSync(resolve(root, "engine/manifest.json"), "utf8"));
const lockPath = resolve(root, "engine/runtime.lock.json");
const missing = [];

for (const name of manifest.runtimeFiles) {
  if (!existsSync(resolve(root, manifest.runtimeDirectory, name))) missing.push(name);
}
if (!existsSync(lockPath)) missing.push("engine/runtime.lock.json");

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

for (const file of manifest.runtimeFiles) {
  const bytes = readFileSync(resolve(root, manifest.runtimeDirectory, file));
  console.log(`${createHash("sha256").update(bytes).digest("hex")}  ${file}`);
}
