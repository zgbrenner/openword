import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

test("runtime startup verifies the generated manifest before loading soffice", () => {
  const host = read("src/writer/runtimeHost.ts");
  const preflightIndex = host.indexOf("await this.verifyRuntimeManifest()");
  const loadIndex = host.indexOf("await this.loadScript(sofficeUrl)");
  assert.notEqual(preflightIndex, -1);
  assert.notEqual(loadIndex, -1);
  assert.ok(preflightIndex < loadIndex);
});

test("runtime preflight checks every required file and produces an actionable missing-file error", () => {
  const host = read("src/writer/runtimeHost.ts");
  assert.match(host, /runtime-manifest\.json/);
  assert.match(host, /for \(const file of REQUIRED_RUNTIME_FILES\)/);
  assert.match(host, /manifest\.files\?\.\[file\]/);
  assert.match(host, /Writer runtime manifest is missing required files/);
});

test("preflight remains local and does not permit remote runtime manifests", () => {
  const host = read("src/writer/runtimeHost.ts");
  assert.match(host, /runtimeAssetUrl\("runtime-manifest\.json", this\.baseUrl\)/);
  assert.match(host, /Remote Writer runtimes are forbidden/);
});
