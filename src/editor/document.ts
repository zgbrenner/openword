import { Node as PMNode } from "prosemirror-model";
import { schema } from "./schema";
import type { CommentThread } from "./comments";
import type { SuggestionMetaStore } from "./trackChanges";
import { parseOwDocFile, serializeOwDocFile } from "./document_file";

export {
  OWDOC_VERSION,
  documentBaseName,
  documentFormatForPath,
  type DocumentFormat,
} from "./document_file";

export function emptyDoc(): PMNode {
  return schema.node("doc", null, [schema.node("paragraph")]);
}

export function docFromJSON(json: unknown): PMNode {
  return PMNode.fromJSON(schema, json as any);
}

export function docToJSON(doc: PMNode): unknown {
  return doc.toJSON();
}

export interface LoadedDocument {
  doc: PMNode;
  comments: CommentThread[];
  suggestionMeta: SuggestionMetaStore;
}

/**
 * OpenWord's native .owdoc file format: the PM document plus the
 * side-stores (comment threads, track-changes author/date metadata) that
 * deliberately don't live inside the document model itself. The envelope
 * itself — including migration of older files that were plain PM-doc JSON
 * with no envelope, from before comments existed — lives in document_file.js
 * so it can be unit-tested without ProseMirror; the two functions here only
 * add the schema binding.
 */
export function serializeOwDoc(doc: PMNode, comments: CommentThread[], suggestionMeta: SuggestionMetaStore): string {
  return serializeOwDocFile(docToJSON(doc), comments, suggestionMeta);
}

export function parseOwDoc(text: string): LoadedDocument {
  const parts = parseOwDocFile(text);
  return {
    doc: docFromJSON(parts.doc),
    comments: parts.comments,
    suggestionMeta: parts.suggestionMeta,
  };
}
