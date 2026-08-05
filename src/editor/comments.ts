import type { Node as PMNode } from "prosemirror-model";
import type { EditorState, Transaction } from "prosemirror-state";
import { schema } from "./schema";

export interface CommentEntry {
  id: string;
  author: string;
  text: string;
  createdAt: number;
}

export interface CommentThread {
  id: string;
  resolved: boolean;
  entries: CommentEntry[];
}

export interface CommentAnchor {
  threadId: string;
  from: number;
  to: number;
}

function newId(prefix: string): string {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${random}`;
}

/**
 * Every place in the doc a comment mark appears, merged into contiguous
 * runs per thread. A comment spanning multiple paragraphs produces one
 * anchor per paragraph (marks don't carry across block boundaries) — for
 * placing a single margin card, callers should use the first anchor for a
 * given threadId.
 */
export function findCommentAnchors(doc: PMNode): CommentAnchor[] {
  const anchors: CommentAnchor[] = [];
  const open = new Map<string, number>();
  doc.descendants((node, pos) => {
    const idsHere = new Set<string>();
    if (node.isInline) {
      for (const mark of node.marks) {
        if (mark.type === schema.marks.comment) idsHere.add(mark.attrs.id as string);
      }
    }
    for (const [id, from] of open) {
      if (!idsHere.has(id)) {
        anchors.push({ threadId: id, from, to: pos });
        open.delete(id);
      }
    }
    for (const id of idsHere) {
      if (!open.has(id)) open.set(id, pos);
    }
    return true;
  });
  const end = doc.content.size;
  for (const [id, from] of open) {
    anchors.push({ threadId: id, from, to: end });
  }
  return anchors.sort((a, b) => a.from - b.from);
}

/** Add a new comment thread anchored to the current selection. Returns the new thread, or null if the selection is empty. */
export function addComment(
  state: EditorState,
  dispatch: ((tr: Transaction) => void) | undefined,
  author: string,
  text: string,
): CommentThread | null {
  const { from, to, empty } = state.selection;
  if (empty) return null;
  const thread: CommentThread = {
    id: newId("comment"),
    resolved: false,
    entries: [{ id: newId("entry"), author, text, createdAt: Date.now() }],
  };
  if (dispatch) {
    const mark = schema.marks.comment.create({ id: thread.id });
    dispatch(state.tr.addMark(from, to, mark));
  }
  return thread;
}

/** Reply to an existing thread. Pure data op — the anchor mark doesn't change. */
export function replyToThread(threads: CommentThread[], threadId: string, author: string, text: string): CommentThread[] {
  return threads.map((t) =>
    t.id === threadId ? { ...t, entries: [...t.entries, { id: newId("entry"), author, text, createdAt: Date.now() }] } : t,
  );
}

export function setThreadResolved(threads: CommentThread[], threadId: string, resolved: boolean): CommentThread[] {
  return threads.map((t) => (t.id === threadId ? { ...t, resolved } : t));
}

/** Remove a thread's data and strip its anchor mark from the doc. */
export function deleteThread(
  state: EditorState,
  dispatch: ((tr: Transaction) => void) | undefined,
  threads: CommentThread[],
  threadId: string,
): CommentThread[] {
  if (dispatch) {
    const mark = schema.marks.comment.create({ id: threadId });
    const anchors = findCommentAnchors(state.doc).filter((a) => a.threadId === threadId);
    // Removing a mark never changes node sizes, so the original positions
    // stay valid across every removeMark call in this transaction.
    let tr = state.tr;
    for (const a of anchors) {
      tr = tr.removeMark(a.from, a.to, mark);
    }
    dispatch(tr);
  }
  return threads.filter((t) => t.id !== threadId);
}
