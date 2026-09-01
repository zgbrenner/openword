// The `.owdoc` container format, kept as plain JavaScript with a typed
// declaration sibling so its migration rules can be exercised directly by the
// Node test runner — the same pattern as the platform storage helpers in
// src/platform/web/.
//
// The envelope wraps the ProseMirror document JSON together with the
// side-stores that deliberately do not live inside the document model itself:
// comment threads and track-changes author/date metadata. Nothing in here
// touches ProseMirror; src/editor/document.ts adds the schema-aware layer.

export const OWDOC_VERSION = 2;

/**
 * Serialize a `.owdoc` file body. `docJson` is the ProseMirror document
 * already reduced to plain JSON.
 */
export function serializeOwDocFile(docJson, comments, suggestionMeta) {
  return JSON.stringify({
    version: OWDOC_VERSION,
    doc: docJson,
    comments,
    suggestionMeta,
  });
}

/**
 * Split a `.owdoc` file body into its three parts.
 *
 * Version 1 files are a bare ProseMirror document with no envelope at all,
 * written before comments existed; they migrate to empty side-stores. A
 * side-store of the wrong shape is normalized to empty rather than taking the
 * document down with it — losing comment metadata beats refusing to open the
 * user's text.
 */
export function parseOwDocFile(text) {
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Not an OpenWord document: the file is not a JSON object.");
  }
  if (parsed.type === "doc") {
    return { doc: parsed, comments: [], suggestionMeta: {} };
  }
  if (!parsed.doc || typeof parsed.doc !== "object") {
    throw new Error("Not an OpenWord document: the file carries no document content.");
  }
  const suggestionMeta = parsed.suggestionMeta;
  return {
    doc: parsed.doc,
    comments: Array.isArray(parsed.comments) ? parsed.comments : [],
    suggestionMeta:
      suggestionMeta && typeof suggestionMeta === "object" && !Array.isArray(suggestionMeta)
        ? suggestionMeta
        : {},
  };
}

/**
 * The document format a path or file name denotes. Everything that is not a
 * Word document is OpenWord's own format, so an extension-less Save As target
 * still round-trips through the native writer.
 */
export function documentFormatForPath(path) {
  return path.toLowerCase().endsWith(".docx") ? "docx" : "owdoc";
}

/** A file name with its extension removed, for seeding Save As dialogs. */
export function documentBaseName(name) {
  return name.replace(/\.[^.]+$/, "");
}
