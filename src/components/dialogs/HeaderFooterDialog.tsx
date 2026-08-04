import { useEffect, useState } from "react";
import type { JSONContent } from "@tiptap/core";
import { extractPlainText } from "../../core/document/stats";
import { Dialog } from "../common/Dialog";

interface HeaderFooterDialogProps {
  open: boolean;
  header: JSONContent;
  footer: JSONContent;
  onApply: (header: JSONContent, footer: JSONContent) => void;
  onClose: () => void;
}

function textToDocument(value: string): JSONContent {
  const lines = value.replaceAll("\r\n", "\n").split("\n");
  return {
    type: "doc",
    content: lines.map((line) => ({
      type: "paragraph",
      content: line ? [{ type: "text", text: line }] : undefined,
    })),
  };
}

export function HeaderFooterDialog({ open, header, footer, onApply, onClose }: HeaderFooterDialogProps) {
  const [headerText, setHeaderText] = useState("");
  const [footerText, setFooterText] = useState("");
  useEffect(() => {
    if (!open) return;
    setHeaderText(extractPlainText(header));
    setFooterText(extractPlainText(footer));
  }, [open, header, footer]);

  return (
    <Dialog
      open={open}
      title="Header and footer"
      description="This release supports text headers and footers. An empty footer exports with automatic page numbering."
      onClose={onClose}
      width="medium"
      footer={(
        <>
          <button type="button" className="secondary-button" onClick={onClose}>Cancel</button>
          <button type="button" className="primary-button" onClick={() => { onApply(textToDocument(headerText), textToDocument(footerText)); onClose(); }}>Apply</button>
        </>
      )}
    >
      <div className="form-grid">
        <label className="field-column"><span>Header</span><textarea rows={4} value={headerText} onChange={(event) => setHeaderText(event.target.value)} placeholder="Optional header text" /></label>
        <label className="field-column"><span>Footer</span><textarea rows={4} value={footerText} onChange={(event) => setFooterText(event.target.value)} placeholder="Leave empty for Page 1, Page 2… in DOCX" /></label>
      </div>
    </Dialog>
  );
}
