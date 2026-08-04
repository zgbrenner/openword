import { FileText, Plus, X } from "lucide-react";
import type { OpenDocumentTab } from "../../core/document/model";
import { IconButton } from "../common/IconButton";

interface DocumentTabsProps {
  tabs: OpenDocumentTab[];
  activeTabId: string;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
  onNew: () => void;
}

export function DocumentTabs({ tabs, activeTabId, onActivate, onClose, onNew }: DocumentTabsProps) {
  return (
    <nav className="document-tabs" aria-label="Open documents">
      <div className="document-tabs__scroll">
        {tabs.map((tab) => {
          const active = tab.id === activeTabId;
          return (
            <div
              key={tab.id}
              className={`document-tab${active ? " is-active" : ""}`}
              role="tab"
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              onClick={() => onActivate(tab.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") onActivate(tab.id);
              }}
            >
              <FileText size={14} aria-hidden="true" />
              <span className="document-tab__name">{tab.document.title}</span>
              {tab.dirty ? <span className="document-tab__dirty" aria-label="Unsaved changes" /> : null}
              <IconButton
                label={`Close ${tab.document.title}`}
                icon={<X size={13} />}
                compact
                onClick={(event) => {
                  event.stopPropagation();
                  onClose(tab.id);
                }}
              />
            </div>
          );
        })}
      </div>
      <IconButton label="New document" icon={<Plus size={16} />} onClick={onNew} compact />
    </nav>
  );
}
