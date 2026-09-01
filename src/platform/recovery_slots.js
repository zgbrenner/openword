// A recovery snapshot belongs to exactly one shell: the ProseMirror editor
// only ever writes `.owdoc` files, the Writer engine only ever writes its own
// package formats. Reads were already isolated — each shell ignores a
// snapshot it cannot open — but a single stored slot meant the isolation was
// one-directional: an editor `clear()` deleted a Writer snapshot and an
// editor `write()` replaced it, and vice versa.
//
// Each shell therefore gets its own slot. Which slot a call uses is never
// guessed: a write is routed by the format it is persisting, a read or a
// clear by the shell that is actually running.

/**
 * @param {string | undefined} format
 * @returns {"editor" | "writer"}
 */
export function recoveryShellForFormat(format) {
  return format === "owdoc" ? "editor" : "writer";
}

/**
 * @param slots one single-slot recovery store per shell.
 * @param currentShell resolves the shell this application instance is running.
 */
export function createShellScopedRecoveryStore(slots, currentShell) {
  return {
    async write(metadata, bytes) {
      await slots[recoveryShellForFormat(metadata?.format)].write(metadata, bytes);
    },

    async read() {
      return slots[currentShell()].read();
    },

    async clear() {
      await slots[currentShell()].clear();
    },
  };
}
