import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const app = readFileSync(new URL("../../src/App.svelte", import.meta.url), "utf8");

test("application routes ribbon command failures through the existing error dialog", () => {
  assert.match(app, /<WriterHomeBar[\s\S]*onerror=\{\(error\) => void showError\("Writer command failed", error\)\}/);
});
