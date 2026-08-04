import {
  Command,
  FileText,
  FolderOpen,
  Redo2,
  Save,
  Undo2,
} from "lucide-react";
import type { Editor } from "@tiptap/core";
import type { OpenDocumentTab } from "../../core/document/model";
import { IconButton } from "../common/IconButton";

interface TitleBarProps {
  tab: OpenDocumentTab;
  editor: Editor | null;
  onTitleChange: (title: string) => void;
  onOpen: () => void;
  onSave: () => void;
  onOpenBackstage: () => void;
  onOpenCommandPalette: () => void;
}

export function TitleBar({
  tab,
  editor,
  onTitleChange,
  onOpen,
  onSave,
  onOpenBackstage,
  onOpenCommandPalette,
}: TitleBarProps) {
  const saveLabel = tab.dirty ? "Save changes" : "Saved";

  return (
    <header className="title-bar" data-tauri-drag-region>
      <button
        type="button"
        className="brand-button"
        onClick={onOpenBackstage}
        aria-label="Open File menu"
      >
        <span className="brand-mark" aria-hidden="true"><FileText size={19} /></span>
        <span>OpenWord</span>
      </button>

      <div className="quick-access" aria-label="Quick access toolbar">
        <IconButton label="Open document" icon={<FolderOpen size={17} />} onClick={onOpen} compact />
        <IconButton
          label={saveLabel}
          icon={<Save size={17} />}
          onClick={onSave}
          compact
          className={tab.dirty ? "is-attention" : ""}
        />
        <span className="title-bar__separator" aria-hidden="true" />
        <IconButton
          label="Undo"
          icon={<Undo2 size={17} />}
          onClick={() => editor?.chain().focus().undo().run()}
          disabled={!editor?.can().undo()}
          compact
        />
        <IconButton
          label="Redo"
          icon={<Redo2 size={17} />}
          onClick={() => editor?.chain().focus().redo().run()}
          disabled={!editor?.can().redo()}
          compact
        />
      </div>

      <div className="document-identity">
        <input
          aria-label="Document title"
          className="document-title-input"
          value={tab.document.title}
          onChange={(event) => onTitleChange(event.target.value)}
          onBlur={(event) => {
            if (!event.target.value.trim()) onTitleChange("Untitled document");
          }}
          spellCheck={false}
        />
        <span className={`save-state${tab.dirty ? " is-dirty" : ""}`}>
          {tab.dirty ? "Unsaved changes" : tab.lastSavedAt ? "Saved" : "Local document"}
        </span>
      </div>

      <div className="title-bar__actions">
        <button type="button" className="command-search-button" onClick={onOpenCommandPalette}>
          <Command size={15} aria-hidden="true" />
          <span>Search commands</span>
          <kbd>Ctrl K</kbd>
        </button>
      </div>
    </header>
  );
}
