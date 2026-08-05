import { Node as PMNode } from "prosemirror-model";
import { schema } from "./schema";
import type { CommentThread } from "./comments";
import type { SuggestionMetaStore } from "./trackChanges";

export function emptyDoc(): PMNode {
  return schema.node("doc", null, [schema.node("paragraph")]);
}

export function docFromJSON(json: unknown): PMNode {
  return PMNode.fromJSON(schema, json as any);
}

export function docToJSON(doc: PMNode): unknown {
  return doc.toJSON();
}

/**
 * OpenWord's native .owdoc file format: the PM document plus the
 * side-stores (comment threads, track-changes author/date metadata) that
 * deliberately don't live inside the document model itself. Versioned so
 * older files — plain PM-doc JSON with no envelope, from before comments
 * existed — still open correctly.
 */
export interface OwDocFile {
  version: 2;
  doc: unknown;
  comments: CommentThread[];
  suggestionMeta: SuggestionMetaStore;
}

export interface LoadedDocument {
  doc: PMNode;
  comments: CommentThread[];
  suggestionMeta: SuggestionMetaStore;
}

export function serializeOwDoc(doc: PMNode, comments: CommentThread[], suggestionMeta: SuggestionMetaStore): string {
  const file: OwDocFile = { version: 2, doc: docToJSON(doc), comments, suggestionMeta };
  return JSON.stringify(file);
}

export function parseOwDoc(text: string): LoadedDocument {
  const parsed = JSON.parse(text);
  // v1 files are just a bare PM doc ({ type: "doc", content: [...] }) with
  // no envelope — anything else is assumed to be the current envelope.
  if (parsed && typeof parsed === "object" && parsed.type === "doc") {
    return { doc: docFromJSON(parsed), comments: [], suggestionMeta: {} };
  }
  const file = parsed as OwDocFile;
  return {
    doc: docFromJSON(file.doc),
    comments: Array.isArray(file.comments) ? file.comments : [],
    suggestionMeta: file.suggestionMeta && typeof file.suggestionMeta === "object" ? file.suggestionMeta : {},
  };
}
