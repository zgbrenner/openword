import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

test("pull-request CI runs Writer contract tests before the frontend build", () => {
  const workflow = read(".github/workflows/ci.yml");
  const tests = workflow.indexOf("npm run test:writer");
  const build = workflow.indexOf("npm run build");
  assert.notEqual(tests, -1);
  assert.notEqual(build, -1);
  assert.ok(tests < build, "Writer contract tests must gate the frontend build");
});

test("package exposes a single deterministic Writer test command", () => {
  const packageJson = JSON.parse(read("package.json"));
  assert.equal(packageJson.scripts["test:writer"], "node --test tests/writer/*.test.mjs");
});
