import {
  ArrowLeft,
  Download,
  ExternalLink,
  FileCode2,
  FileDown,
  FileText,
  FolderOpen,
  Info,
  Markdown,
  Printer,
  Save,
  ShieldAlert,
  Text,
} from "lucide-react";
import { useEffect, useState } from "react";
import { BUILT_IN_TEMPLATES, type TemplateId } from "../../core/document/templates";
import type { OpenDocumentTab } from "../../core/document/model";
import type { RecentFile } from "../../store/workspaceStore";
import { IconButton } from "../common/IconButton";

interface BackstageProps {
  open: boolean;
  tab: OpenDocumentTab;
  recentFiles: RecentFile[];
  onClose: () => void;
  onNew: (template: TemplateId) => void;
  onOpen: () => void;
  onOpenRecent: (file: RecentFile) => void;
  onSave: () => void;
  onSaveAs: (format: "openword" | "docx" | "markdown" | "html" | "text") => void;
  onPrint: () => void;
  onReveal: () => void;
}

type Section = "home" | "new" | "open" | "info" | "export";

const NAVIGATION: { id: Section; label: string; icon: typeof FileText }[] = [
  { id: "home", label: "Home", icon: FileText },
  { id: "new", label: "New", icon: FileDown },
  { id: "open", label: "Open", icon: FolderOpen },
  { id: "info", label: "Info", icon: Info },
  { id: "export", label: "Export", icon: Download },
];

const EXPORTS = [
  { format: "openword" as const, label: "OpenWord document", detail: "Lossless native file with comments, page settings, and compatibility metadata.", icon: FileText },
  { format: "docx" as const, label: "Microsoft Word (.docx)", detail: "Professional OOXML export with layout, tables, images, headers, footers, and page numbers.", icon: FileDown },
  { format: "markdown" as const, label: "Markdown (.md)", detail: "Portable structured text. Page layout and review metadata are simplified.", icon: Markdown },
  { format: "html" as const, label: "Web page (.html)", detail: "Semantic, sanitized HTML suitable for publishing and archiving.", icon: FileCode2 },
  { format: "text" as const, label: "Plain text (.txt)", detail: "Text only, without formatting or embedded media.", icon: Text },
];

export function Backstage({
  open,
  tab,
  recentFiles,
  onClose,
  onNew,
  onOpen,
  onOpenRecent,
  onSave,
  onSaveAs,
  onPrint,
  onReveal,
}: BackstageProps) {
  const [section, setSection] = useState<Section>("home");
  useEffect(() => {
    if (open) setSection("home");
  }, [open]);

  if (!open) return null;

  return (
    <div className="backstage" role="dialog" aria-modal="true" aria-label="File menu">
      <aside className="backstage-nav">
        <div className="backstage-brand">
          <IconButton label="Return to document" icon={<ArrowLeft size={19} />} onClick={onClose} />
          <div className="brand-mark"><FileText size={20} /></div>
          <strong>OpenWord</strong>
        </div>
        <nav aria-label="File menu sections">
          {NAVIGATION.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.id} type="button" className={section === item.id ? "is-active" : ""} onClick={() => setSection(item.id)}>
                <Icon size={17} aria-hidden="true" /> {item.label}
              </button>
            );
          })}
        </nav>
        <div className="backstage-nav__bottom">
          <button type="button" onClick={onSave}><Save size={17} /> Save</button>
          <button type="button" onClick={onPrint}><Printer size={17} /> Print</button>
        </div>
      </aside>

      <main className="backstage-content">
        {section === "home" ? (
          <div className="backstage-page">
            <header className="backstage-heading">
              <h1>Good work starts with a clean document.</h1>
              <p>Create, open, or continue a local document. OpenWord does not send document contents to a server.</p>
            </header>
            <div className="backstage-quick-actions">
              <button type="button" className="backstage-action" onClick={() => onNew("blank")}>
                <span><FileDown size={24} /></span>
                <strong>Blank document</strong>
                <small>Start with professional defaults</small>
              </button>
              <button type="button" className="backstage-action" onClick={onOpen}>
                <span><FolderOpen size={24} /></span>
                <strong>Open a document</strong>
                <small>DOCX, OpenWord, Markdown, HTML, or text</small>
              </button>
              <button type="button" className="backstage-action" onClick={onSave}>
                <span><Save size={24} /></span>
                <strong>Save current document</strong>
                <small>{tab.file?.name ?? "Choose a local filename"}</small>
              </button>
            </div>
            <section className="backstage-section">
              <div className="backstage-section__heading"><h2>Recent</h2><button type="button" onClick={() => setSection("open")}>See all</button></div>
              <div className="recent-list">
                {recentFiles.slice(0, 6).map((file) => (
                  <button key={`${file.path ?? "browser"}-${file.name}-${file.openedAt}`} type="button" onClick={() => onOpenRecent(file)} disabled={!file.path}>
                    <FileText size={18} />
                    <span><strong>{file.name}</strong><small>{file.path ?? "Downloaded from browser session"}</small></span>
                    <time>{new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(file.openedAt))}</time>
                  </button>
                ))}
                {!recentFiles.length ? <div className="recent-empty">No recent desktop files yet.</div> : null}
              </div>
            </section>
          </div>
        ) : null}

        {section === "new" ? (
          <div className="backstage-page">
            <header className="backstage-heading"><h1>New document</h1><p>Use a focused template, then change anything.</p></header>
            <div className="template-grid">
              {BUILT_IN_TEMPLATES.map((template) => (
                <button key={template.id} type="button" className="template-card" onClick={() => onNew(template.id)}>
                  <div className={`template-preview template-preview--${template.id}`}>
                    <span /><span /><span /><span />
                  </div>
                  <strong>{template.name}</strong>
                  <p>{template.description}</p>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {section === "open" ? (
          <div className="backstage-page">
            <header className="backstage-heading"><h1>Open</h1><p>Import a supported local document. Original files are not overwritten during import.</p></header>
            <button type="button" className="large-open-button" onClick={onOpen}><FolderOpen size={26} /><span><strong>Browse this device</strong><small>Open .openword, .docx, .md, .html, or .txt</small></span></button>
            <section className="backstage-section">
              <h2>Recent desktop files</h2>
              <div className="recent-list">
                {recentFiles.map((file) => (
                  <button key={`${file.path ?? "browser"}-${file.name}-${file.openedAt}`} type="button" onClick={() => onOpenRecent(file)} disabled={!file.path}>
                    <FileText size={18} /><span><strong>{file.name}</strong><small>{file.path ?? "Browser download has no reusable path"}</small></span><time>{new Intl.DateTimeFormat(undefined, { dateStyle: "short", timeStyle: "short" }).format(new Date(file.openedAt))}</time>
                  </button>
                ))}
              </div>
            </section>
          </div>
        ) : null}

        {section === "info" ? (
          <div className="backstage-page backstage-page--narrow">
            <header className="backstage-heading"><h1>Document information</h1><p>Metadata and compatibility status for the active document.</p></header>
            <section className="info-card">
              <div className="info-document-icon"><FileText size={34} /></div>
              <div><h2>{tab.document.title}</h2><p>{tab.file?.path ?? "Not yet saved to a desktop path"}</p></div>
              {tab.file?.path ? <button type="button" className="secondary-button" onClick={onReveal}><ExternalLink size={14} /> Show in folder</button> : null}
            </section>
            <dl className="document-properties">
              <div><dt>Format</dt><dd>{tab.file?.format ?? "Unsaved"}</dd></div>
              <div><dt>Created</dt><dd>{new Intl.DateTimeFormat(undefined, { dateStyle: "long", timeStyle: "short" }).format(new Date(tab.document.createdAt))}</dd></div>
              <div><dt>Modified</dt><dd>{new Intl.DateTimeFormat(undefined, { dateStyle: "long", timeStyle: "short" }).format(new Date(tab.document.updatedAt))}</dd></div>
              <div><dt>Author</dt><dd>{tab.document.author ?? "Not set"}</dd></div>
              <div><dt>Page</dt><dd>{tab.document.page.size.toUpperCase()}, {tab.document.page.orientation}</dd></div>
              <div><dt>Comments</dt><dd>{tab.document.comments.length}</dd></div>
            </dl>
            <section className={`compatibility-summary${tab.document.compatibilityWarnings.length ? " has-warnings" : ""}`}>
              <ShieldAlert size={20} />
              <div><strong>{tab.document.compatibilityWarnings.length ? `${tab.document.compatibilityWarnings.length} compatibility notices` : "Native model is healthy"}</strong><p>{tab.document.compatibilityWarnings.length ? "Review notices before exporting to another format." : "No imported structures are currently flagged as lossy."}</p></div>
            </section>
          </div>
        ) : null}

        {section === "export" ? (
          <div className="backstage-page">
            <header className="backstage-heading"><h1>Export</h1><p>Choose a destination format. OpenWord warns when the target format cannot represent every feature.</p></header>
            <div className="export-grid">
              {EXPORTS.map((option) => {
                const Icon = option.icon;
                return (
                  <button key={option.format} type="button" className="export-option" onClick={() => onSaveAs(option.format)}>
                    <span className="export-option__icon"><Icon size={24} /></span>
                    <span><strong>{option.label}</strong><small>{option.detail}</small></span>
                    <Download size={18} />
                  </button>
                );
              })}
              <button type="button" className="export-option" onClick={onPrint}>
                <span className="export-option__icon"><Printer size={24} /></span>
                <span><strong>PDF or paper</strong><small>Use the operating system print dialog for PDF and printer output.</small></span>
                <Printer size={18} />
              </button>
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}
