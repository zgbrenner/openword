// Track changes ("suggesting mode") is built on @handlewithcare/prosemirror-
// suggest-changes (MIT) rather than hand-rolled — see ARCHITECTURE.md. That
// library owns the hard part (intercepting transactions so deletions become
// marks instead of real removals) and only tracks a bare suggestion id; this
// module adds the "who and when" layer OpenWord needs on top, as a side-store
// keyed by id — the same pattern used for comment threads.
import type { Node as PMNode } from "prosemirror-model";
import { schema } from "./schema";

export interface SuggestionMeta {
  author: string;
  date: number;
}

export type SuggestionMetaStore = Record<string, SuggestionMeta>;

const TRACK_MARK_TYPES = () => [schema.marks.insertion, schema.marks.deletion, schema.marks.modification];

export function findSuggestionIds(doc: PMNode): Set<string> {
  const ids = new Set<string>();
  const markTypes = TRACK_MARK_TYPES();
  doc.descendants((node) => {
    if (!node.isInline) return true;
    for (const mark of node.marks) {
      if (markTypes.includes(mark.type)) ids.add(String(mark.attrs.id));
    }
    return true;
  });
  return ids;
}

/**
 * Reconcile the metadata side-store against what's actually in the doc:
 * new suggestion ids get an entry (attributed to `author`, timestamped
 * now), ids that no longer appear (accepted/rejected/deleted) are pruned.
 * Returns the same object reference when nothing changed, so callers can
 * skip a reactive update cheaply.
 */
export function reconcileSuggestionMeta(doc: PMNode, store: SuggestionMetaStore, author: string): SuggestionMetaStore {
  const idsInDoc = findSuggestionIds(doc);
  let changed = false;
  const next: SuggestionMetaStore = {};
  for (const id of idsInDoc) {
    next[id] = store[id] ?? { author, date: Date.now() };
    if (!store[id]) changed = true;
  }
  if (!changed && Object.keys(next).length !== Object.keys(store).length) changed = true;
  return changed ? next : store;
}

export interface SuggestionInfo {
  /** The suggestion's real id, exactly as stored in the mark's attrs — pass
   * this straight to applySuggestion/revertSuggestion/selectSuggestion.
   * Those compare ids with strict equality, so this must NOT be stringified
   * (the library's default id generator produces numbers). */
  id: string | number;
  kind: "insertion" | "deletion" | "modification";
  from: number;
  to: number;
  meta: SuggestionMeta | undefined;
}

/** Every suggestion range in the doc, for building a review list/panel. */
export function findSuggestions(doc: PMNode, store: SuggestionMetaStore): SuggestionInfo[] {
  const open = new Map<string, { id: string | number; kind: SuggestionInfo["kind"]; from: number }>();
  const result: SuggestionInfo[] = [];
  const kindOf = (markType: unknown): SuggestionInfo["kind"] | null => {
    if (markType === schema.marks.insertion) return "insertion";
    if (markType === schema.marks.deletion) return "deletion";
    if (markType === schema.marks.modification) return "modification";
    return null;
  };
  doc.descendants((node, pos) => {
    const here = new Map<string, { id: string | number; kind: SuggestionInfo["kind"] }>();
    if (node.isInline) {
      for (const mark of node.marks) {
        const kind = kindOf(mark.type);
        if (kind) here.set(String(mark.attrs.id), { id: mark.attrs.id, kind });
      }
    }
    for (const [key, entry] of open) {
      if (!here.has(key)) {
        result.push({ id: entry.id, kind: entry.kind, from: entry.from, to: pos, meta: store[key] });
        open.delete(key);
      }
    }
    for (const [key, { id, kind }] of here) {
      if (!open.has(key)) open.set(key, { id, kind, from: pos });
    }
    return true;
  });
  const end = doc.content.size;
  for (const [key, entry] of open) {
    result.push({ id: entry.id, kind: entry.kind, from: entry.from, to: end, meta: store[key] });
  }
  return result.sort((a, b) => a.from - b.from);
}
