import type { CommentThread } from "./comments";
import type { SuggestionMetaStore } from "./trackChanges";

export type DocumentFormat = "owdoc" | "docx";

export interface OwDocFileParts {
  /** The ProseMirror document as plain JSON, not yet bound to the schema. */
  doc: unknown;
  comments: CommentThread[];
  suggestionMeta: SuggestionMetaStore;
}

export const OWDOC_VERSION: 2;

export function serializeOwDocFile(
  docJson: unknown,
  comments: CommentThread[],
  suggestionMeta: SuggestionMetaStore,
): string;

export function parseOwDocFile(text: string): OwDocFileParts;

export function documentFormatForPath(path: string): DocumentFormat;

export function documentBaseName(name: string): string;
