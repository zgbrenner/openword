import type { Editor } from "@tiptap/core";
import { createId } from "./factory";
import type { CommentThread, OpenWordDocument } from "./model";

export interface CreateCommentOptions {
  author?: string;
  body: string;
}

export function createCommentThread(options: CreateCommentOptions): CommentThread {
  const body = options.body.trim();
  if (!body) throw new Error("A comment cannot be empty.");

  return {
    id: createId("comment"),
    author: options.author?.trim() || "You",
    body,
    createdAt: new Date().toISOString(),
    replies: [],
  };
}

export function addCommentFromSelection(
  editor: Editor,
  document: OpenWordDocument,
  options: CreateCommentOptions,
): { thread: CommentThread; document: OpenWordDocument } {
  const { from, to } = editor.state.selection;
  if (from === to) throw new Error("Select text before adding a comment.");

  const thread = createCommentThread(options);
  editor.chain().focus().setCommentMark(thread.id).run();

  return {
    thread,
    document: {
      ...document,
      comments: [...document.comments, thread],
      content: editor.getJSON(),
    },
  };
}

export function resolveComment(
  document: OpenWordDocument,
  commentId: string,
  resolved: boolean,
): OpenWordDocument {
  return {
    ...document,
    comments: document.comments.map((thread) =>
      thread.id === commentId
        ? {
            ...thread,
            resolvedAt: resolved ? new Date().toISOString() : undefined,
          }
        : thread,
    ),
  };
}

export function removeCommentMarks(editor: Editor, commentId: string): void {
  const { state, view } = editor;
  const mark = state.schema.marks.comment;
  if (!mark) return;

  let transaction = state.tr;
  state.doc.descendants((node, position) => {
    if (!node.isText) return;
    const hasComment = node.marks.some(
      (candidate) =>
        candidate.type === mark && candidate.attrs.commentId === commentId,
    );
    if (hasComment) transaction = transaction.removeMark(position, position + node.nodeSize, mark);
  });

  if (transaction.docChanged) view.dispatch(transaction);
}
