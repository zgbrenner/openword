import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

test("every custom native-menu item has an explicit frontend handler", () => {
  const menu = read("src-tauri/src/menu.rs");
  const app = read("src/App.svelte");
  const menuIds = [...menu.matchAll(/item\("([a-z0-9_]+)"/g)].map((match) => match[1]);
  const handled = new Set([...app.matchAll(/case "([a-z0-9_]+)":/g)].map((match) => match[1]));
  const missing = [...new Set(menuIds)].filter((id) => !handled.has(id));
  assert.deepEqual(missing, []);
});

test("native menus do not advertise known placeholder workflows", () => {
  const menu = read("src-tauri/src/menu.rs");
  for (const id of [
    "app_preferences",
    "file_print",
    "edit_find",
    "edit_find_replace",
    "insert_image",
    "insert_table",
    "insert_link",
    "insert_comment",
    "format_strikethrough",
    "format_clear",
    "tools_spelling",
    "tools_track_changes",
    "tools_accept_all_changes",
    "tools_reject_all_changes",
    "tools_set_author_name",
    "help_shortcuts",
  ]) {
    assert.doesNotMatch(menu, new RegExp(`"${id}"`));
  }
});
