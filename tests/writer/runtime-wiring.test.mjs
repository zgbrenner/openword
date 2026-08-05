import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

test("loads immutable command policy before the UNO worker", () => {
  const host = read("src/writer/runtimeHost.ts");
  const commandsIndex = host.indexOf('absoluteAssetUrl("openword_writer_commands.js"');
  const workerIndex = host.indexOf('absoluteAssetUrl("openword_writer_thread.js"');

  assert.notEqual(commandsIndex, -1);
  assert.notEqual(workerIndex, -1);
  assert.ok(commandsIndex < workerIndex, "command policy must load before the worker bridge");
});

test("UNO worker consumes the shared policy instead of defining a second registry", () => {
  const worker = read("public/writer-runtime/openword_writer_thread.js");
  assert.match(worker, /const commandUrls = OPENWORD_WRITER_COMMANDS;/);
  assert.doesNotMatch(worker, /const commandUrls = Object\.freeze\(/);
});

test("runtime provenance includes both committed Writer bridge scripts", () => {
  const manifest = JSON.parse(read("engine/manifest.json"));
  assert.ok(manifest.runtimeFiles.includes("openword_writer_commands.js"));
  assert.ok(manifest.runtimeFiles.includes("openword_writer_thread.js"));

  const ignore = read(".gitignore");
  assert.match(ignore, /!public\/writer-runtime\/openword_writer_commands\.js/);
  assert.match(ignore, /!public\/writer-runtime\/openword_writer_thread\.js/);
});
