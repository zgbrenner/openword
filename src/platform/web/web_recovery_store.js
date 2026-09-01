// Browser recovery storage. The desktop backend achieves generation safety
// with staged files and atomic renames; in the browser the equivalent
// guarantee comes from committing the metadata and the document bytes as a
// single atomic key-value write (one IndexedDB transaction), so a crash
// leaves either the previous complete snapshot or the new complete snapshot,
// never a torn mixture.

const CURRENT_SNAPSHOT_KEY = "recovery/current";

export function isValidRecoveryMetadata(metadata) {
  return Boolean(
    metadata &&
    metadata.version === 1 &&
    typeof metadata.generation === "string" &&
    metadata.generation.length > 0 &&
    typeof metadata.createdAt === "string" &&
    typeof metadata.fileName === "string" &&
    (metadata.originalPath === null || typeof metadata.originalPath === "string") &&
    (metadata.format === "docx" || metadata.format === "odt" || metadata.format === "owdoc") &&
    typeof metadata.documentFile === "string",
  );
}

/**
 * @param kv an atomic key-value store: get(key), set(key, value), delete(key),
 *   each returning a promise; a set must be all-or-nothing.
 * @param slotKey the single key this store owns. Each shell is given its own
 *   slot so one shell's write or clear cannot destroy the other's snapshot;
 *   the default is the original, unscoped slot.
 */
export function createWebRecoveryStore(kv, slotKey = CURRENT_SNAPSHOT_KEY) {
  return {
    async write(metadata, bytes) {
      if (!isValidRecoveryMetadata(metadata)) {
        throw new Error("Refusing to persist a malformed recovery snapshot.");
      }
      if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) {
        throw new Error("Refusing to persist an empty recovery document.");
      }
      await kv.set(slotKey, { metadata, bytes });
    },

    async read() {
      const stored = await kv.get(slotKey);
      if (!stored || !isValidRecoveryMetadata(stored.metadata)) return null;
      if (!(stored.bytes instanceof Uint8Array) || stored.bytes.byteLength === 0) return null;
      return { metadata: stored.metadata, bytes: stored.bytes };
    },

    async clear() {
      await kv.delete(slotKey);
    },
  };
}
