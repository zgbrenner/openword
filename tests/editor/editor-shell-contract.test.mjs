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

// --- Crash recovery, saving, and the prompts that depend on them ------------

test("recovery writes and clears are serialized so neither can overtake the other", () => {
  const shell = read("src/components/EditorShell.svelte");
  assert.match(shell, /let recoveryQueue: Promise<void> = Promise\.resolve\(\)/);
  assert.match(shell, /function enqueueRecovery<T>\(work: \(\) => Promise<T>\): Promise<T>/);
  assert.match(shell, /const result = recoveryQueue\.then\(work\)/);
  // Both directions go through the queue: an autosave landing after a
  // successful save would leave a snapshot newer than the file on disk.
  assert.match(shell, /function persistRecovery\(\): Promise<boolean> \{[\s\S]*?return enqueueRecovery\(/);
  assert.match(shell, /function clearRecovery\(\): Promise<void> \{\s*return enqueueRecovery\(/);
  assert.doesNotMatch(
    shell,
    /await clearRecoverySnapshot\(\)\.catch/,
    "no save or open path may clear the snapshot outside the queue",
  );
});

test("a close that lands on top of the autosave still flushes, instead of bailing out", () => {
  const shell = read("src/components/EditorShell.svelte");
  // The old guard returned early while another write was in flight, so the
  // final flush before quitting was silently skipped.
  assert.doesNotMatch(shell, /recoveryInFlight/);
});

test("the close prompt promises recovery only when the snapshot was written", () => {
  const shell = read("src/components/EditorShell.svelte");
  assert.match(shell, /const recovered = await persistRecovery\(\)/);
  const prompt = shell.slice(shell.indexOf("const recovered = await persistRecovery()"));
  assert.match(prompt, /recovered\s*\?\s*"You have unsaved changes\. Quit without saving\?/);
  assert.match(prompt, /could not be saved for recovery/);
  assert.match(prompt, /kind: recovered \? "info" : "warning"/);
  // The failure path is reported to the caller, not swallowed into the
  // console and then reported as success.
  const persist = shell.slice(
    shell.indexOf("function persistRecovery"),
    shell.indexOf("function clearRecovery"),
  );
  assert.match(persist, /console\.error\("Could not write OpenWord recovery snapshot", error\);\s*return false;/);
});

test("a recovery restore is abandoned if the document changed while the prompt was up", () => {
  const shell = read("src/components/EditorShell.svelte");
  const restore = shell.slice(
    shell.indexOf("async function restoreRecoveryIfAvailable"),
    shell.indexOf("// --- Shell wiring"),
  );
  // Captured before the dialog, re-checked after it, and again after the
  // discard confirmation — "open with", the launch queue and File > Open all
  // race this prompt.
  assert.match(restore, /const token = controller\.loadToken;/);
  assert.equal((restore.match(/controller\.loadToken !== token/g) ?? []).length, 2);
  assert.match(restore, /await confirmDiscard\(/);
  const controller = read("src/lib/editorController.svelte.ts");
  assert.match(controller, /loadToken = \$state\(0\)/);
  assert.match(controller, /this\.loadToken\+\+;/);
});

test("saving an imported .docx warns once and offers the lossless format instead", () => {
  const shell = read("src/components/EditorShell.svelte");
  assert.match(shell, /const DOCX_REWRITE_WARNING =/);
  // Wording tracks README.md's "About .docx files" list.
  for (const dropped of [
    "headers and footers",
    "footnotes and endnotes",
    "page setup",
    "Heading 1–6",
    "fields and tables of contents",
    "text boxes, shapes and charts",
    "document properties",
  ]) {
    assert.ok(shell.includes(dropped), `the warning must name ${dropped}`);
  }
  assert.match(shell, /Save a lossless \.owdoc copy instead\?/);
  assert.match(shell, /await platform\.ask\(DOCX_REWRITE_WARNING/);

  // Armed by a .docx import, disarmed by the first ask — never on every save.
  assert.match(shell, /docxRewriteWarningPending = result\.format === "docx"/);
  assert.match(shell, /if \(!docxRewriteWarningPending \|\| controller\.fileFormat !== "docx"\) return true;/);
  assert.match(shell, /docxRewriteWarningPending = false;\s*const saveAsOwdoc = await platform\.ask\(/);
  // Save is the path that overwrites the colleague's original file.
  assert.match(shell, /if \(!\(await confirmDocxRewrite\(\)\)\) return;/);
  const confirm = shell.slice(
    shell.indexOf("async function confirmDocxRewrite"),
    shell.indexOf("// --- File workflows"),
  );
  assert.match(confirm, /if \(!saveAsOwdoc\) return true;\s*await doSaveAs\(\);\s*return false;/);
});

test("the image picker reports failures instead of leaving an unhandled rejection", () => {
  const toolbar = read("src/components/Toolbar.svelte");
  const pick = toolbar.slice(toolbar.indexOf("async function pickImage"));
  assert.match(pick, /try \{/);
  assert.match(pick, /\} catch \(error\) \{/);
  assert.match(pick, /platform\.message\(detail, \{ title: "Could not insert image", kind: "error" \}\)/);
});

test("the view options the page canvas and ruler read are reachable from the UI", () => {
  const viewState = read("src/lib/viewState.svelte.ts");
  assert.match(viewState, /toggleRuler = \(\) =>/);
  assert.match(viewState, /setPageSize = \(name: "letter" \| "a4"\) =>/);
  const status = read("src/components/StatusBar.svelte");
  assert.match(status, /onclick=\{view\.toggleRuler\}/);
  assert.match(status, /view\.setPageSize\(\(e\.target as HTMLSelectElement\)\.value as "letter" \| "a4"\)/);
  assert.match(status, /<option value="letter">Letter<\/option>/);
  assert.match(status, /<option value="a4">A4<\/option>/);
  // Both are live consumers, not decoration.
  assert.match(read("src/components/Ruler.svelte"), /\{#if view\.showRuler\}/);
  assert.match(read("src/components/PageCanvas.svelte"), /geometryFor\(view\.pageSize\)/);
});
