import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(scriptDir, "../..");
const workdir = resolve(process.env.OPENWORD_ENGINE_WORKDIR || resolve(root, ".engine-work"));
const runtimeSource = resolve(process.argv[2] || resolve(workdir, "libreoffice/workdir/installation/LibreOffice/emscripten"));
const zetaSource = resolve(process.argv[3] || resolve(workdir, "zetajs/source/zeta.js"));
const destination = resolve(root, "public/writer-runtime");
const manifest = JSON.parse(readFileSync(resolve(root, "engine/manifest.json"), "utf8"));
const lock = JSON.parse(readFileSync(resolve(root, "engine/runtime.lock.json"), "utf8"));
const generatedFiles = ["soffice.js", "soffice.wasm", "soffice.data", "soffice.data.js.metadata"];
const committedBridgeFiles = [
  "openword_writer_commands.js",
  "openword_writer_page_styles.js",
  "openword_writer_thread.js",
];

mkdirSync(destination, { recursive: true });
for (const name of generatedFiles) {
  const source = resolve(runtimeSource, name);
  if (!existsSync(source)) throw new Error(`LibreOffice build output is missing ${source}`);
  copyFileSync(source, resolve(destination, name));
}
if (!existsSync(zetaSource)) throw new Error(`zetajs source is missing ${zetaSource}`);
copyFileSync(zetaSource, resolve(destination, "zeta.js"));

for (const name of committedBridgeFiles) {
  if (!existsSync(resolve(destination, name))) {
    throw new Error(`OpenWord Writer bridge source is missing: ${name}`);
  }
}

const files = {};
for (const name of manifest.runtimeFiles) {
  const path = resolve(destination, name);
  if (!existsSync(path)) throw new Error(`Runtime artifact is missing: ${name}`);
  const bytes = readFileSync(path);
  files[name] = {
    bytes: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

writeFileSync(
  resolve(destination, "runtime-manifest.json"),
  `${JSON.stringify(
    {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      sourceLock: lock.sources,
      files,
    },
    null,
    2,
  )}\n`,
);
console.log(`Installed Writer runtime in ${destination}`);
