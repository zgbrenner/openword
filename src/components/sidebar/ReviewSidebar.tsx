import {
  AlertTriangle,
  Check,
  MessageSquare,
  RotateCcw,
  Send,
  Trash2,
  X,
} from "lucide-react";
import type { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { useState } from "react";
import { createId } from "../../core/document/factory";
import type { CommentThread, CompatibilityWarning } from "../../core/document/model";
import { IconButton } from "../common/IconButton";

interface ReviewSidebarProps {
  editor: Editor | null;
  comments: CommentThread[];
  warnings: CompatibilityWarning[];
  onAddComment: (body: string) => void;
  onUpdateComment: (id: string, patch: Partial<CommentThread>) => void;
  onDeleteComment: (id: string) => void;
  onClose: () => void;
}

function focusComment(editor: Editor | null, commentId: string): void {
  if (!editor) return;
  let from: number | undefined;
  let to: number | undefined;
  editor.state.doc.descendants((node, position) => {
    if (from !== undefined || !node.isText) return;
    const match = node.marks.some(
      (mark) => mark.type.name === "comment" && mark.attrs.commentId === commentId,
    );
    if (match) {
      from = position;
      to = position + node.nodeSize;
    }
  });
  if (from === undefined || to === undefined) return;
  editor.view.dispatch(
    editor.state.tr
      .setSelection(TextSelection.create(editor.state.doc, from, to))
      .scrollIntoView(),
  );
  editor.commands.focus();
}

export function ReviewSidebar({
  editor,
  comments,
  warnings,
  onAddComment,
  onUpdateComment,
  onDeleteComment,
  onClose,
}: ReviewSidebarProps) {
  const [section, setSection] = useState<"comments" | "compatibility">("comments");
  const [commentBody, setCommentBody] = useState("");
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});

  const submitComment = () => {
    if (!commentBody.trim()) return;
    onAddComment(commentBody);
    setCommentBody("");
  };

  const submitReply = (thread: CommentThread) => {
    const body = replyDrafts[thread.id]?.trim();
    if (!body) return;
    onUpdateComment(thread.id, {
      replies: [
        ...thread.replies,
        {
          id: createId("reply"),
          author: "You",
          body,
          createdAt: new Date().toISOString(),
        },
      ],
    });
    setReplyDrafts((current) => ({ ...current, [thread.id]: "" }));
  };

  return (
    <aside className="side-panel review-panel" aria-label="Review pane">
      <header className="side-panel__header">
        <div>
          <h2>Review</h2>
          <span>{comments.filter((comment) => !comment.resolvedAt).length} open comments</span>
        </div>
        <IconButton label="Close review pane" icon={<X size={16} />} compact onClick={onClose} />
      </header>
      <div className="side-panel-tabs" role="tablist" aria-label="Review sections">
        <button type="button" role="tab" aria-selected={section === "comments"} className={section === "comments" ? "is-active" : ""} onClick={() => setSection("comments")}>
          Comments <span>{comments.length}</span>
        </button>
        <button type="button" role="tab" aria-selected={section === "compatibility"} className={section === "compatibility" ? "is-active" : ""} onClick={() => setSection("compatibility")}>
          Compatibility <span>{warnings.length}</span>
        </button>
      </div>

      {section === "comments" ? (
        <div className="review-section">
          <div className="new-comment-box">
            <label>
              <span>Add a comment to selected text</span>
              <textarea
                value={commentBody}
                onChange={(event) => setCommentBody(event.target.value)}
                placeholder={editor?.state.selection.empty ? "Select text in the document first" : "Write a comment"}
                disabled={!editor || editor.state.selection.empty}
                rows={3}
              />
            </label>
            <button type="button" className="primary-button compact-button" onClick={submitComment} disabled={!commentBody.trim() || !editor || editor.state.selection.empty}>
              <MessageSquare size={14} aria-hidden="true" /> Add comment
            </button>
          </div>

          <div className="comment-list">
            {comments.length ? comments.map((thread) => (
              <article key={thread.id} className={`comment-card${thread.resolvedAt ? " is-resolved" : ""}`}>
                <button type="button" className="comment-card__body" onClick={() => focusComment(editor, thread.id)}>
                  <div className="comment-card__meta">
                    <strong>{thread.author}</strong>
                    <time dateTime={thread.createdAt}>{new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(thread.createdAt))}</time>
                  </div>
                  <p>{thread.body}</p>
                </button>
                {thread.replies.map((reply) => (
                  <div key={reply.id} className="comment-reply">
                    <strong>{reply.author}</strong>
                    <p>{reply.body}</p>
                  </div>
                ))}
                {!thread.resolvedAt ? (
                  <div className="comment-reply-form">
                    <input
                      aria-label={`Reply to ${thread.author}`}
                      value={replyDrafts[thread.id] ?? ""}
                      onChange={(event) => setReplyDrafts((current) => ({ ...current, [thread.id]: event.target.value }))}
                      placeholder="Reply"
                      onKeyDown={(event) => {
                        if (event.key === "Enter") submitReply(thread);
                      }}
                    />
                    <IconButton label="Send reply" icon={<Send size={14} />} compact onClick={() => submitReply(thread)} disabled={!replyDrafts[thread.id]?.trim()} />
                  </div>
                ) : null}
                <footer className="comment-card__actions">
                  <button type="button" onClick={() => onUpdateComment(thread.id, { resolvedAt: thread.resolvedAt ? undefined : new Date().toISOString() })}>
                    {thread.resolvedAt ? <RotateCcw size={13} /> : <Check size={13} />}
                    {thread.resolvedAt ? "Reopen" : "Resolve"}
                  </button>
                  <button type="button" className="danger-text" onClick={() => onDeleteComment(thread.id)}>
                    <Trash2 size={13} /> Delete
                  </button>
                </footer>
              </article>
            )) : (
              <div className="side-panel-empty">
                <MessageSquare size={28} aria-hidden="true" />
                <strong>No comments</strong>
                <p>Select text and add a comment to start a review thread.</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="review-section compatibility-list">
          {warnings.length ? warnings.map((warning) => (
            <article key={warning.id} className={`compatibility-card compatibility-card--${warning.severity}`}>
              <AlertTriangle size={17} aria-hidden="true" />
              <div>
                <strong>{warning.code.replaceAll("-", " ")}</strong>
                <p>{warning.message}</p>
                {warning.source ? <span>{warning.source}</span> : null}
              </div>
            </article>
          )) : (
            <div className="side-panel-empty">
              <Check size={28} aria-hidden="true" />
              <strong>No known compatibility issues</strong>
              <p>The native OpenWord document model can represent the current content.</p>
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
