// OpenWord is local-first with no accounts yet, so "who made this change"
// for comments/track-changes is just a name the user sets locally, stored
// in the webview's localStorage (works identically in-browser and inside
// the Tauri shell — no Tauri API needed for something this small).
const KEY = "openword.authorName";
const DEFAULT_NAME = "You";

export function getAuthorName(): string {
  try {
    return localStorage.getItem(KEY) || DEFAULT_NAME;
  } catch {
    return DEFAULT_NAME;
  }
}

export function setAuthorName(name: string): void {
  try {
    localStorage.setItem(KEY, name.trim() || DEFAULT_NAME);
  } catch {
    // localStorage unavailable (e.g. disabled) — name just won't persist.
  }
}
