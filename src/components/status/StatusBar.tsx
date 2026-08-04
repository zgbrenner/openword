import { FileCheck2, Monitor, Printer, ZoomIn, ZoomOut } from "lucide-react";
import type { Editor } from "@tiptap/core";
import { useMemo } from "react";
import type { OpenDocumentTab } from "../../core/document/model";
import { calculateDocumentStats } from "../../core/document/stats";
import { IconButton } from "../common/IconButton";

interface StatusBarProps {
  tab: OpenDocumentTab;
  editor: Editor | null;
  revision: number;
  zoom: number;
  layoutMode: "print" | "web";
  onZoomChange: (zoom: number) => void;
  onLayoutModeChange: (mode: "print" | "web") => void;
}

function pageCount(editor: Editor | null): number {
  if (!editor) return 1;
  let breaks = 0;
  editor.state.doc.descendants((node) => {
    if (node.type.name === "pageBreak") breaks += 1;
  });
  return breaks + 1;
}

export function StatusBar({
  tab,
  editor,
  revision,
  zoom,
  layoutMode,
  onZoomChange,
  onLayoutModeChange,
}: StatusBarProps) {
  const stats = useMemo(
    () => calculateDocumentStats(editor?.getJSON() ?? tab.document.content),
    [editor, revision, tab.document.content],
  );
  const pages = useMemo(() => pageCount(editor), [editor, revision]);

  return (
    <footer className="status-bar">
      <div className="status-bar__left">
        <span>Page 1 of {pages}</span>
        <span>{stats.words.toLocaleString()} words</span>
        <span>{stats.characters.toLocaleString()} characters</span>
        <span>{stats.readingMinutes ? `${stats.readingMinutes} min read` : "Empty document"}</span>
        <span className={`status-save${tab.dirty ? " is-dirty" : ""}`}>
          <FileCheck2 size={13} aria-hidden="true" />
          {tab.dirty ? "Autosaved for recovery" : "Saved locally"}
        </span>
      </div>
      <div className="status-bar__right">
        <span className="status-language">English (US)</span>
        <div className="layout-switch" aria-label="Document view">
          <IconButton label="Print layout" icon={<Printer size={14} />} active={layoutMode === "print"} compact onClick={() => onLayoutModeChange("print")} />
          <IconButton label="Web layout" icon={<Monitor size={14} />} active={layoutMode === "web"} compact onClick={() => onLayoutModeChange("web")} />
        </div>
        <div className="zoom-control">
          <IconButton label="Zoom out" icon={<ZoomOut size={14} />} compact disabled={zoom <= 50} onClick={() => onZoomChange(zoom - 10)} />
          <input
            aria-label="Zoom"
            type="range"
            min={50}
            max={200}
            step={10}
            value={zoom}
            onChange={(event) => onZoomChange(Number(event.target.value))}
          />
          <IconButton label="Zoom in" icon={<ZoomIn size={14} />} compact disabled={zoom >= 200} onClick={() => onZoomChange(zoom + 10)} />
          <button type="button" className="zoom-value" onClick={() => onZoomChange(100)}>{zoom}%</button>
        </div>
      </div>
    </footer>
  );
}
