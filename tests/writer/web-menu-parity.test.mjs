import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

function nativeMenuItems() {
  const menu = read("src-tauri/src/menu.rs");
  const items = new Map();
  for (const match of menu.matchAll(
    /item\("([a-z0-9_]+)", "([^"]+)", (?:Some\("([^"]+)"\)|None)\)/g,
  )) {
    items.set(match[1], { label: match[2], accelerator: match[3] ?? null });
  }
  return items;
}

function webMenuItems() {
  const definition = read("src/lib/menuDefinition.ts");
  const items = new Map();
  for (const match of definition.matchAll(
    /\{ id: "([a-z0-9_]+)", label: "([^"]+)"(?:, accelerator: "([^"]+)")? \}/g,
  )) {
    items.set(match[1], { label: match[2], accelerator: match[3] ?? null });
  }
  return items;
}

test("the web menu definition carries every custom native menu item", () => {
  const native = nativeMenuItems();
  const web = webMenuItems();
  assert.ok(native.size > 0, "native menu items must parse");
  const missing = [...native.keys()].filter((id) => !web.has(id));
  assert.deepEqual(missing, []);
});

test("the web menu invents no command ids of its own", () => {
  const native = nativeMenuItems();
  const web = webMenuItems();
  const extra = [...web.keys()].filter((id) => !native.has(id));
  assert.deepEqual(extra, []);
});

test("labels and accelerators match the native menu verbatim", () => {
  const native = nativeMenuItems();
  const web = webMenuItems();
  for (const [id, item] of web) {
    assert.equal(item.label, native.get(id).label, `label for ${id}`);
    assert.equal(item.accelerator, native.get(id).accelerator, `accelerator for ${id}`);
  }
});

test("the web menu bar renders the shared definition and dispatches menu-action ids", () => {
  const bar = read("src/components/WebMenuBar.svelte");
  assert.match(bar, /APP_MENUS/);
  assert.match(bar, /role="menubar"/);
  assert.match(bar, /onaction/);
});

test("web keyboard accelerators derive from the shared menu definition", () => {
  const shortcuts = read("src/lib/webShortcuts.ts");
  assert.match(shortcuts, /from "\.\/menuDefinition"/);
  assert.match(shortcuts, /APP_MENUS/);
  // Editing keys inside the Writer canvas stay with the engine, like desktop.
  assert.match(shortcuts, /#qtcanvas/);
});
