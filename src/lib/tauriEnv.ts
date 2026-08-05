// Lets the app run in a plain browser (useful for fast UI iteration and
// automated visual checks) as well as inside the real Tauri shell, by
// feature-detecting the IPC bridge Tauri injects into the webview instead of
// letting Tauri-only calls throw during startup.
export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}
