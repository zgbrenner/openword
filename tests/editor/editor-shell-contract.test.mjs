import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

function customMenuIds() {
  return new Set([...read("src-tauri/src/menu.rs").matchAll(/item\("([a-z0-9_]+)"/g)].map((m) => m[1]));
}

function handledIds(source) {
  return new Set([...source.matchAll(/case "([a-z0-9_]+)":/g)].map((m) => m[1]));
}

test("the application root mounts the ProseMirror editor shell by default", () => {
  const app = read("src/App.svelte");
  assert.match(app, /import EditorShell from "@\/components\/EditorShell\.svelte"/);
  assert.match(app, /const shell = resolveShellMode\(\)/);
  // The Writer engine is the explicit opt-in branch; the editor is the default.
  assert.match(app, /\{#if shell === "writer"\}[\s\S]*\{:else\}\s*<EditorShell \/>\s*\{\/if\}/);
  assert.match(read("src/lib/shellMode.ts"), /\?\? "editor"/);
});

test("the Writer engine shell stays in the build, reachable by opt-in", () => {
  for (const path of [
    "src/components/WriterCanvas.svelte",
    "src/components/WriterHomeBar.svelte",
    "src/components/WriterStatusBar.svelte",
    "src/components/WriterFindBar.svelte",
    "src/components/WriterEngineFailure.svelte",
    "src/components/WriterGlyph.svelte",
    "src/writer/client.ts",
    "src/writer/fileApi.ts",
    "src/writer/runtimeHost.ts",
  ]) {
    assert.ok(read(path).length > 0, `${path} must still exist`);
  }
  const app = read("src/App.svelte");
  assert.match(app, /<WriterCanvas/);
  assert.match(app, /<WriterHomeBar/);
});

test("the editor shell handles every custom item the native menu emits", () => {
  const shell = read("src/components/EditorShell.svelte");
  const handled = handledIds(shell);
  const missing = [...customMenuIds()].filter((id) => !handled.has(id));
  assert.deepEqual(missing, []);
});

test("the editor shell invents no menu ids the native menu never sends", () => {
  const shell = read("src/components/EditorShell.svelte");
  const native = customMenuIds();
  const extra = [...handledIds(shell)].filter((id) => !native.has(id));
  assert.deepEqual(extra, []);
});

test("one menu-action handler serves the native menu, the web menu bar, and accelerators", () => {
  const shell = read("src/components/EditorShell.svelte");
  assert.match(shell, /function mountDesktopShell/);
  assert.match(shell, /function mountWebShell/);
  assert.match(shell, /listen<string>\("menu:action"/);
  assert.match(shell, /"file:open-path"/);
  assert.match(shell, /<WebMenuBar onaction=\{\(id\) => void handleMenuAction\(id\)\} \/>/);
  assert.match(shell, /shortcutMenuAction/);
  assert.match(shell, /launchQueue\?\.setConsumer/);
  assert.match(shell, /beforeunload/);
  assert.match(shell, /visibilitychange/);
  assert.match(shell, /pagehide/);
});

test("the editor shell mounts the paginated ProseMirror surface, not the Writer canvas", () => {
  const shell = read("src/components/EditorShell.svelte");
  for (const component of ["Toolbar", "Ruler", "PageCanvas", "FindReplace", "ReviewPanel", "StatusBar"]) {
    assert.match(shell, new RegExp(`<${component}[\\s/>]`), `${component} must be mounted`);
  }
  assert.doesNotMatch(shell, /WriterCanvas|WriterClient|writerState/);
});

test("the editor document lifecycle goes through the platform layer, not Tauri plugins", () => {
  for (const path of [
    "src/lib/fileApi.ts",
    "src/components/EditorShell.svelte",
    "src/components/Toolbar.svelte",
  ]) {
    const source = read(path);
    assert.doesNotMatch(source, /@tauri-apps\/plugin-dialog/, `${path} must not open Tauri dialogs directly`);
    assert.doesNotMatch(source, /@tauri-apps\/plugin-fs/, `${path} must not touch the Tauri filesystem directly`);
  }
  const fileApi = read("src/lib/fileApi.ts");
  assert.match(fileApi, /from "@\/platform"/);
  assert.match(fileApi, /getPlatform\(\)\.pickOpenDocument/);
  assert.match(fileApi, /getPlatform\(\)\.replaceDocument/);
  // Dialogs come from the platform too, so the website prompts the same way.
  const shell = read("src/components/EditorShell.svelte");
  assert.match(shell, /const platform = getPlatform\(\)/);
  assert.match(shell, /platform\.ask\(/);
  assert.match(shell, /platform\.message\(/);
});

test("a document the platform could only hand over as bytes opens detached", () => {
  const fileApi = read("src/lib/fileApi.ts");
  assert.match(fileApi, /path: string \| null/);
  assert.match(fileApi, /pick\.kind === "path"/);
  const shell = read("src/components/EditorShell.svelte");
  // No path means no save target: the document is dirty and Save becomes Save As.
  assert.match(shell, /controller\.markDirty\(result\.path === null\)/);
  assert.match(shell, /if \(!controller\.filePath\) return doSaveAs\(\)/);
});

test("editor recovery snapshots use the shared platform store without colliding with Writer's", () => {
  const fileApi = read("src/lib/fileApi.ts");
  assert.match(fileApi, /format: "owdoc"/);
  assert.match(fileApi, /getPlatform\(\)\.recovery\.write\(metadata, bytes\)/);
  // Both backends must accept the editor's format alongside Writer packages.
  assert.match(read("src/platform/desktop.ts"), /parsed\.format === "owdoc"/);
  assert.match(read("src/platform/web/web_recovery_store.js"), /metadata\.format === "owdoc"/);
  // And each shell must skip the other shell's snapshot rather than misread it.
  assert.match(fileApi, /snapshot\.metadata\.format !== "owdoc"/);
  assert.match(read("src/writer/recovery.ts"), /export function writerRecoveryFormat/);
  assert.match(read("src/App.svelte"), /writerRecoveryFormat\(snapshot\)/);
});

test("autosave and crash recovery run in the browser as well as the desktop shell", () => {
  const shell = read("src/components/EditorShell.svelte");
  assert.match(shell, /const autosave = window\.setInterval\(\(\) => void persistRecovery\(\), 20_000\)/);
  assert.match(shell, /void restoreRecoveryIfAvailable\(\)/);
  // Neither is behind an isTauri() gate.
  const mountIndex = shell.indexOf("onMount(() => {");
  assert.ok(mountIndex !== -1);
  assert.ok(shell.indexOf("const autosave") > mountIndex);
});

test("web accelerators leave editing keys to whichever editing surface owns them", () => {
  const shortcuts = read("src/lib/webShortcuts.ts");
  assert.match(shortcuts, /#qtcanvas/);
  assert.match(shortcuts, /\.ow-prosemirror/);
  assert.match(read("src/editor/editorView.ts"), /class: "ow-prosemirror"/);
});

test("Find and Replace are bound by the editor because the native menu carries no Find", () => {
  const shell = read("src/components/EditorShell.svelte");
  assert.match(shell, /function findBarShortcut/);
  assert.match(shell, /<FindReplace bind:open=\{findOpen\} bind:withReplace=\{findWithReplace\} \/>/);
  assert.doesNotMatch(read("src-tauri/src/menu.rs"), /"edit_find"/);
});
