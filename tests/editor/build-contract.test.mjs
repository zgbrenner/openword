import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const scripts = () => JSON.parse(read("package.json")).scripts;

test("the desktop build no longer depends on the Writer WebAssembly runtime", () => {
  const buildDesktop = scripts()["build:desktop"];
  assert.ok(buildDesktop, "build:desktop script must exist");
  assert.doesNotMatch(
    buildDesktop,
    /engine:verify/,
    "packaging the ProseMirror editor must not require the Writer runtime artifacts",
  );
  const tests = buildDesktop.indexOf("npm run test");
  const build = buildDesktop.indexOf("npm run build");
  assert.ok(tests !== -1 && build !== -1);
  assert.ok(tests < build, "the test suites must gate the frontend build");
});

test("the engine-verified desktop build stays available for when the runtime exists", () => {
  const engineBuild = scripts()["build:desktop:engine"];
  assert.ok(engineBuild, "build:desktop:engine script must exist");
  const verify = engineBuild.indexOf("engine:verify");
  const tests = engineBuild.indexOf("npm run test");
  const build = engineBuild.indexOf("npm run build");
  assert.ok(verify !== -1 && tests !== -1 && build !== -1);
  assert.ok(verify < tests && tests < build, "verify and tests must gate the engine build");
});

test("the packaged build still runs through build:desktop", () => {
  const tauri = JSON.parse(read("src-tauri/tauri.conf.json"));
  assert.equal(tauri.build.beforeBuildCommand, "npm run build:desktop");
  assert.equal(tauri.build.frontendDist, "../dist");
});

test("the two suites stay separate and run from one command", () => {
  const all = scripts();
  assert.equal(all["test:writer"], "node --test tests/writer/*.test.mjs");
  assert.equal(all["test:editor"], "node --test tests/editor/*.test.mjs");
  assert.equal(all["test"], "npm run test:writer && npm run test:editor");
});
