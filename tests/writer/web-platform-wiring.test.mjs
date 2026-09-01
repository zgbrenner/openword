import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

test("Writer document lifecycle goes through the platform layer, not Tauri directly", () => {
  const fileApi = read("src/writer/fileApi.ts");
  const recovery = read("src/writer/recovery.ts");
  for (const source of [fileApi, recovery]) {
    assert.doesNotMatch(source, /@tauri-apps/);
    assert.match(source, /from "@\/platform"/);
  }
});

test("Tauri storage and dialog plugins are confined to the desktop backend", () => {
  const desktop = read("src/platform/desktop.ts");
  assert.match(desktop, /@tauri-apps\/plugin-fs/);
  assert.match(desktop, /@tauri-apps\/plugin-dialog/);

  const web = read("src/platform/web/webPlatform.ts");
  assert.doesNotMatch(web, /@tauri-apps/);
});

test("platform selection is a runtime feature-detect so one build serves both versions", () => {
  const index = read("src/platform/index.ts");
  assert.match(index, /isTauri\(\)\s*\?\s*desktopPlatform\s*:\s*webPlatform/);
});

test("the desktop backend keeps the staged sibling-write replacement sequence", () => {
  const desktop = read("src/platform/desktop.ts");
  assert.match(desktop, /openword-tmp-/);
  assert.match(desktop, /openword-backup-/);
  assert.match(desktop, /retainedBackupPath/);
});

test("the web backend persists through browser storage only", () => {
  const web = read("src/platform/web/webPlatform.ts");
  assert.match(web, /showOpenFilePicker/);
  assert.match(web, /showSaveFilePicker/);
  assert.match(web, /navigator\.storage/);
  assert.match(web, /createWritable/);
  const kv = read("src/platform/web/idbKv.ts");
  assert.match(kv, /indexedDB\.open/);
  // A write is only durable once its IndexedDB transaction commits.
  assert.match(kv, /transactionDone/);
});

test("application dialogs route through the platform so both versions prompt identically", () => {
  const app = read("src/App.svelte");
  assert.match(app, /const platform = getPlatform\(\)/);
  assert.match(app, /platform\.ask\(/);
  assert.match(app, /platform\.message\(/);
  assert.doesNotMatch(app, /@tauri-apps\/plugin-dialog/);
  assert.match(app, /<AppDialog \/>/);
});

test("autosave and recovery run in the browser as well as the desktop shell", () => {
  const app = read("src/App.svelte");
  // The autosave interval and recovery restore must not be desktop-gated.
  assert.match(app, /const autosave = window\.setInterval\(\(\) => void persistRecovery\(\), 20_000\)/);
  assert.doesNotMatch(app, /if \(!isTauri\(\)\) return;/);
  assert.match(app, /restoreRecoveryIfAvailable/);
});

test("the web shell mirrors native window behavior", () => {
  const app = read("src/App.svelte");
  assert.match(app, /function mountWebShell/);
  assert.match(app, /shortcutMenuAction/);
  assert.match(app, /beforeunload/);
  assert.match(app, /visibilitychange/);
  assert.match(app, /pagehide/);
  assert.match(app, /launchQueue/);
  assert.match(app, /registerOpenWordServiceWorker/);
  assert.match(app, /\{#if !isTauri\(\)\}\s*<WebMenuBar onaction=\{\(id\) => void handleMenuAction\(id\)\} \/>/);
});

test("recovery snapshots delegate persistence to the platform recovery store", () => {
  const recovery = read("src/writer/recovery.ts");
  assert.match(recovery, /getPlatform\(\)\.recovery\.write\(metadata, bytes\)/);
  assert.match(recovery, /getPlatform\(\)\.recovery\.read\(\)/);
  assert.match(recovery, /getPlatform\(\)\.recovery\.clear\(\)/);
});
