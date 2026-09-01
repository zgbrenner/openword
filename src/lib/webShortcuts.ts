// Keyboard accelerator matching for the web build, derived from APP_MENUS so
// the shortcut layer can never drift from the menu definition.

import { APP_MENUS, isSeparator } from "./menuDefinition";

// Actions that apply regardless of focus. Everything else (edit_*, insert_*,
// format_*) is an editing command the embedded Writer engine already handles
// natively inside its canvas — intercepting there would apply it twice.
const APP_LEVEL_ACTIONS = new Set([
  "file_new",
  "file_open",
  "file_save",
  "file_save_as",
  "tools_word_count",
]);

interface ShortcutBinding {
  id: string;
  shift: boolean;
  /** Lowercased event.key to match, e.g. "s" or "enter". */
  key: string | null;
  /** event.code to match instead, for digits — Shift+8 yields "*" in event.key. */
  code: string | null;
  digit: string | null;
}

function parseAccelerator(id: string, accelerator: string): ShortcutBinding {
  const binding: ShortcutBinding = { id, shift: false, key: null, code: null, digit: null };
  for (const part of accelerator.split("+")) {
    if (part === "CmdOrCtrl") continue; // always required; checked at match time
    if (part === "Shift") binding.shift = true;
    else if (part === "Return") binding.key = "enter";
    else if (/^\d$/.test(part)) {
      binding.code = `Digit${part}`;
      binding.digit = part;
    } else binding.key = part.toLowerCase();
  }
  return binding;
}

const BINDINGS: readonly ShortcutBinding[] = APP_MENUS.flatMap((menu) =>
  menu.entries.flatMap((entry) =>
    isSeparator(entry) || !entry.accelerator ? [] : [parseAccelerator(entry.id, entry.accelerator)],
  ),
);

export function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent);
}

function insideWriterCanvas(event: KeyboardEvent): boolean {
  return event.target instanceof Element && event.target.closest("#qtcanvas") !== null;
}

/**
 * Maps a keydown event to a menu action id, or null when no accelerator
 * matches. The caller listens on window in the capture phase and calls
 * preventDefault when non-null.
 */
export function shortcutMenuAction(event: KeyboardEvent): string | null {
  if (event.repeat) return null;
  const mac = isMacPlatform();
  const primary = mac ? event.metaKey : event.ctrlKey;
  const stray = mac ? event.ctrlKey : event.metaKey;
  if (!primary || stray || event.altKey) return null;
  for (const binding of BINDINGS) {
    if (binding.shift !== event.shiftKey) continue;
    const matches = binding.code
      ? event.code === binding.code || event.key === binding.digit
      : binding.key !== null && event.key.toLowerCase() === binding.key;
    if (!matches) continue;
    // Editing/formatting shortcuts stay with the Writer engine when the event
    // originates in its canvas, exactly like desktop.
    if (!APP_LEVEL_ACTIONS.has(binding.id) && insideWriterCanvas(event)) return null;
    return binding.id;
  }
  return null;
}
