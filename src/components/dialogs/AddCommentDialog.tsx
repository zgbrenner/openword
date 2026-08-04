import { useEffect, useState } from "react";
import { Dialog } from "../common/Dialog";

interface AddCommentDialogProps {
  open: boolean;
  selectedText: string;
  onSubmit: (body: string) => void;
  onClose: () => void;
}

export function AddCommentDialog({ open, selectedText, onSubmit, onClose }: AddCommentDialogProps) {
  const [body, setBody] = useState("");
  useEffect(() => {
    if (open) setBody("");
  }, [open]);

  return (
    <Dialog
      open={open}
      title="New comment"
      description={selectedText ? `Commenting on “${selectedText.slice(0, 120)}${selectedText.length > 120 ? "…" : ""}”` : "Select document text before adding a comment."}
      onClose={onClose}
      width="small"
      footer={(
        <>
          <button type="button" className="secondary-button" onClick={onClose}>Cancel</button>
          <button type="button" className="primary-button" disabled={!body.trim() || !selectedText} onClick={() => { onSubmit(body); onClose(); }}>Add comment</button>
        </>
      )}
    >
      <label className="field-column">
        <span>Comment</span>
        <textarea autoFocus rows={5} value={body} onChange={(event) => setBody(event.target.value)} placeholder="Write a clear review note" />
      </label>
    </Dialog>
  );
}
