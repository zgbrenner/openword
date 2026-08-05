import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const manifestPath = fileURLToPath(new URL("../manifest.json", import.meta.url));
const lockPath = fileURLToPath(new URL("../runtime.lock.json", import.meta.url));
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const sources = {};

for (const [name, source] of Object.entries(manifest.sources)) {
  const output = execFileSync("git", ["ls-remote", source.repository, source.ref], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  }).trim();
  const commit = output.split(/\s+/)[0];
  if (!/^[a-f0-9]{40}$/.test(commit)) {
    throw new Error(`Could not resolve ${name} ${source.ref}`);
  }
  sources[name] = { ...source, commit };
}

writeFileSync(
  lockPath,
  `${JSON.stringify({ schemaVersion: 1, resolvedAt: new Date().toISOString(), sources }, null, 2)}\n`,
);
console.log(`Wrote ${lockPath}`);
