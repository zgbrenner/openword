import type { Editor } from "@tiptap/core";
import { useEffect, useState } from "react";
import { Dialog } from "../common/Dialog";

interface LinkDialogProps {
  open: boolean;
  editor: Editor | null;
  onClose: () => void;
  onError: (message: string) => void;
}

function normalizeLink(value: string): string {
  const trimmed = value.trim();
  if (/^(https?:\/\/|mailto:)/i.test(trimmed)) return trimmed;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return `mailto:${trimmed}`;
  return `https://${trimmed}`;
}

export function LinkDialog({ open, editor, onClose, onError }: LinkDialogProps) {
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");

  useEffect(() => {
    if (!open || !editor) return;
    const existing = editor.getAttributes("link");
    setUrl(String(existing.href ?? ""));
    const { from, to } = editor.state.selection;
    setText(editor.state.doc.textBetween(from, to, " "));
  }, [open, editor]);

  const apply = () => {
    if (!editor) return;
    if (!url.trim()) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      onClose();
      return;
    }

    try {
      const href = normalizeLink(url);
      const parsed = new URL(href);
      if (!["http:", "https:", "mailto:"].includes(parsed.protocol)) throw new Error("Unsupported link protocol");
      if (editor.state.selection.empty) {
        editor.chain().focus().insertContent({
          type: "text",
          text: text.trim() || href,
          marks: [{ type: "link", attrs: { href } }],
        }).run();
      } else {
        editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
      }
      onClose();
    } catch {
      onError("Enter a valid web address or email address.");
    }
  };

  return (
    <Dialog
      open={open}
      title="Insert link"
      onClose={onClose}
      width="small"
      footer={(
        <>
          <button type="button" className="secondary-button" onClick={() => { editor?.chain().focus().extendMarkRange("link").unsetLink().run(); onClose(); }}>Remove link</button>
          <button type="button" className="primary-button" onClick={apply}>Apply</button>
        </>
      )}
    >
      <div className="form-grid">
        {editor?.state.selection.empty ? (
          <label className="field-row"><span>Text</span><input value={text} onChange={(event) => setText(event.target.value)} /></label>
        ) : null}
        <label className="field-row"><span>Address</span><input autoFocus value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://example.com" onKeyDown={(event) => { if (event.key === "Enter") apply(); }} /></label>
      </div>
    </Dialog>
  );
}
