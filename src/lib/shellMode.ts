// OpenWord ships the ProseMirror editor: it is the whole word processor in a
// few hundred kilobytes of JavaScript, so a packaged desktop build is small
// and works offline with no extra artifacts.
//
// The LibreOffice Writer engine shell lives beside it in the same build and is
// opt-in, because it needs a separate multi-hundred-megabyte WebAssembly
// runtime that is not part of a normal package. Selecting it is a runtime
// decision so one build can serve both.

export type ShellMode = "editor" | "writer";

const OVERRIDE_KEY = "openword.shell";

function asShellMode(value: string | null): ShellMode | null {
  return value === "editor" || value === "writer" ? value : null;
}

function storedOverride(): ShellMode | null {
  try {
    return asShellMode(window.localStorage.getItem(OVERRIDE_KEY));
  } catch {
    return null;
  }
}

function rememberOverride(mode: ShellMode): void {
  try {
    window.localStorage.setItem(OVERRIDE_KEY, mode);
  } catch {
    // Storage disabled: the choice simply applies to this visit only.
  }
}

/**
 * The shell to mount. `?shell=writer` selects the Writer engine and is
 * remembered for later launches (the desktop shell has no address bar);
 * `?shell=editor` clears the choice again. Anything else gets the editor.
 */
export function resolveShellMode(): ShellMode {
  if (typeof window === "undefined") return "editor";
  const requested = asShellMode(new URLSearchParams(window.location.search).get("shell"));
  if (requested) {
    rememberOverride(requested);
    return requested;
  }
  return storedOverride() ?? "editor";
}
