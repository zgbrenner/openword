import { ChevronRight, FileText, Search, X } from "lucide-react";
import type { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { useMemo, useState } from "react";
import { IconButton } from "../common/IconButton";

interface OutlineEntry {
  id: string;
  level: number;
  text: string;
  position: number;
}

interface NavigationSidebarProps {
  editor: Editor | null;
  revision: number;
  onClose: () => void;
}

function getOutline(editor: Editor | null): OutlineEntry[] {
  if (!editor) return [];
  const entries: OutlineEntry[] = [];
  editor.state.doc.descendants((node, position) => {
    if (node.type.name !== "heading") return;
    entries.push({
      id: `heading-${position}`,
      level: Math.min(6, Math.max(1, Number(node.attrs.level) || 1)),
      text: node.textContent.trim() || "Untitled heading",
      position,
    });
  });
  return entries;
}

export function NavigationSidebar({ editor, revision, onClose }: NavigationSidebarProps) {
  const [query, setQuery] = useState("");
  const entries = useMemo(() => getOutline(editor), [editor, revision]);
  const filtered = query
    ? entries.filter((entry) => entry.text.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
    : entries;

  const goToHeading = (entry: OutlineEntry) => {
    if (!editor) return;
    const position = Math.min(editor.state.doc.content.size, entry.position + 1);
    editor.view.dispatch(
      editor.state.tr
        .setSelection(TextSelection.create(editor.state.doc, position))
        .scrollIntoView(),
    );
    editor.commands.focus();
  };

  return (
    <aside className="side-panel navigation-panel" aria-label="Navigation pane">
      <header className="side-panel__header">
        <div>
          <h2>Navigation</h2>
          <span>{entries.length} headings</span>
        </div>
        <IconButton label="Close navigation pane" icon={<X size={16} />} compact onClick={onClose} />
      </header>
      <label className="side-panel-search">
        <Search size={15} aria-hidden="true" />
        <span className="sr-only">Filter headings</span>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search headings" />
      </label>
      <div className="outline-list">
        {filtered.length ? filtered.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className="outline-entry"
            style={{ paddingLeft: `${12 + (entry.level - 1) * 14}px` }}
            onClick={() => goToHeading(entry)}
          >
            <ChevronRight size={13} aria-hidden="true" />
            <span>{entry.text}</span>
          </button>
        )) : (
          <div className="side-panel-empty">
            <FileText size={28} aria-hidden="true" />
            <strong>{query ? "No matching headings" : "No headings yet"}</strong>
            <p>Apply Heading 1–6 styles to create a navigable outline.</p>
          </div>
        )}
      </div>
    </aside>
  );
}
