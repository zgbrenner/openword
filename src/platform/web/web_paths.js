// Web document paths are opaque tokens that stand in for filesystem paths.
// They must satisfy the same string expectations the rest of the app has of
// desktop paths: the file name is the final "/" segment and the format is
// derived from the token's extension suffix.
//
//   openword-web://handle/<id>/<fileName>   File System Access handle
//   openword-web://opfs/<path>/<fileName>   Origin Private File System file
//   openword-web://download/<fileName>      no storage; served as a download

export const WEB_PATH_PREFIX = "openword-web://";

const FILE_NAME_FORBIDDEN = /[\\/\u0000-\u001f]/;

export function isWebDocumentPath(path) {
  return typeof path === "string" && path.startsWith(WEB_PATH_PREFIX);
}

export function sanitizeWebFileName(name) {
  const trimmed = typeof name === "string" ? name.trim() : "";
  if (!trimmed || trimmed === "." || trimmed === "..") {
    throw new Error("Document names must not be empty.");
  }
  if (FILE_NAME_FORBIDDEN.test(trimmed)) {
    throw new Error("Document names must not contain path separators or control characters.");
  }
  return trimmed;
}

export function handleWebPath(handleId, fileName) {
  return `${WEB_PATH_PREFIX}handle/${handleId}/${sanitizeWebFileName(fileName)}`;
}

export function opfsWebPath(directorySegments, fileName) {
  const segments = directorySegments.map((segment) => sanitizeWebFileName(segment));
  return `${WEB_PATH_PREFIX}opfs/${[...segments, sanitizeWebFileName(fileName)].join("/")}`;
}

export function downloadWebPath(fileName) {
  return `${WEB_PATH_PREFIX}download/${sanitizeWebFileName(fileName)}`;
}

/**
 * Splits a web document path into its storage scheme and segments.
 * Returns null for anything that is not a well-formed web path, so callers
 * can fail with a precise diagnostic instead of misrouting bytes.
 */
export function parseWebDocumentPath(path) {
  if (!isWebDocumentPath(path)) return null;
  const rest = path.slice(WEB_PATH_PREFIX.length);
  const segments = rest.split("/");
  const scheme = segments.shift();
  if (segments.length === 0 || segments.some((segment) => segment.length === 0)) return null;

  if (scheme === "handle") {
    if (segments.length !== 2) return null;
    return { scheme, handleId: segments[0], fileName: segments[1] };
  }
  if (scheme === "opfs") {
    return { scheme, segments, fileName: segments[segments.length - 1] };
  }
  if (scheme === "download") {
    if (segments.length !== 1) return null;
    return { scheme, fileName: segments[0] };
  }
  return null;
}

export function webDocumentFileName(path) {
  const parsed = parseWebDocumentPath(path);
  if (!parsed) throw new Error(`Not an OpenWord web document path: ${path}`);
  return parsed.fileName;
}
