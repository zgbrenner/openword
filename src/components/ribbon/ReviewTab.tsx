import {
  CheckCircle2,
  Languages,
  MessageSquarePlus,
  PanelRightOpen,
  Search,
  ShieldCheck,
  SpellCheck2,
} from "lucide-react";
import { RibbonButton } from "../common/RibbonButton";
import { RibbonGroup } from "../common/RibbonGroup";
import type { RibbonTabProps } from "./types";

export function ReviewTab({ editor, tab, ui, actions }: RibbonTabProps) {
  const unresolved = tab.document.comments.filter((comment) => !comment.resolvedAt).length;

  return (
    <div className="ribbon-panel" aria-label="Review commands">
      <RibbonGroup label="Proofing">
        <RibbonButton
          label={tab.document.settings.spellcheck ? "Disable spellcheck" : "Enable spellcheck"}
          icon={<SpellCheck2 size={23} />}
          active={tab.document.settings.spellcheck}
          large
          onClick={() => actions.setSpellcheck(!tab.document.settings.spellcheck)}
        />
        <div className="ribbon-stack">
          <RibbonButton label="Find and replace" icon={<Search size={16} />} onClick={actions.openFindReplace} />
          <RibbonButton label="Document language" icon={<Languages size={16} />} disabled title="Language-specific proofing dictionaries depend on the operating system webview." />
        </div>
      </RibbonGroup>

      <RibbonGroup label="Comments">
        <RibbonButton
          label="New comment"
          icon={<MessageSquarePlus size={23} />}
          large
          disabled={!editor || editor.state.selection.empty}
          onClick={actions.addComment}
        />
        <div className="ribbon-stack">
          <RibbonButton
            label={`Review comments${unresolved ? ` (${unresolved})` : ""}`}
            icon={<PanelRightOpen size={16} />}
            active={ui.rightSidebar}
            onClick={actions.toggleReview}
          />
          <RibbonButton label="Resolved comments" icon={<CheckCircle2 size={16} />} onClick={actions.toggleReview} />
        </div>
      </RibbonGroup>

      <RibbonGroup label="Compatibility">
        <RibbonButton
          label={`${tab.document.compatibilityWarnings.length} compatibility warnings`}
          icon={<ShieldCheck size={23} />}
          large
          active={tab.document.compatibilityWarnings.length > 0}
          onClick={actions.toggleReview}
        />
      </RibbonGroup>
    </div>
  );
}
