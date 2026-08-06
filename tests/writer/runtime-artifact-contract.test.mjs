import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

test("conditionally emitted LOWA worker files are copied and verified when present", () => {
  const manifest = JSON.parse(read("engine/manifest.json"));
  assert.deepEqual(manifest.optionalRuntimeFiles, ["soffice.worker.js"]);

  const install = read("engine/scripts/install-runtime.mjs");
  const verify = read("engine/scripts/verify-runtime.mjs");
  assert.match(install, /manifest\.optionalRuntimeFiles/);
  assert.match(install, /existsSync\(source\)/);
  assert.match(verify, /manifest\.optionalRuntimeFiles/);
  assert.match(verify, /artifacts\.files\?\.\[file\]/);
});

test("required Writer runtime files remain strict and do not include optional helpers", () => {
  const host = read("src/writer/runtimeHost.ts");
  assert.doesNotMatch(host, /REQUIRED_RUNTIME_FILES = \[[\s\S]*soffice\.worker\.js/);
});
