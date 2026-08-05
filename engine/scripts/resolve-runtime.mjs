import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const manifestPath = fileURLToPath(new URL("../manifest.json", import.meta.url));
const lockPath = fileURLToPath(new URL("../runtime.lock.json", import.meta.url));
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const sources = {};

function resolveCommit(source) {
  const refs = [source.ref, `${source.ref}^{}`];
  const output = execFileSync("git", ["ls-remote", source.repository, ...refs], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  }).trim();

  const rows = output
    .split("\n")
    .map((line) => line.trim().split(/\s+/))
    .filter(([commit, ref]) => /^[a-f0-9]{40}$/.test(commit) && typeof ref === "string");
  const peeled = rows.find(([, ref]) => ref.endsWith("^{}"));
  const direct = rows.find(([, ref]) => ref === source.ref);
  const commit = (peeled || direct)?.[0];

  if (!commit) throw new Error(`Could not resolve ${source.repository} ${source.ref}`);
  return commit;
}

for (const [name, source] of Object.entries(manifest.sources)) {
  sources[name] = { ...source, commit: resolveCommit(source) };
}

writeFileSync(
  lockPath,
  `${JSON.stringify(
    {
      schemaVersion: manifest.schemaVersion,
      resolvedAt: new Date().toISOString(),
      sources,
    },
    null,
    2,
  )}\n`,
);
console.log(`Wrote ${lockPath}`);
