import {
  Command,
  Eye,
  Focus,
  Moon,
  PanelLeftOpen,
  PanelRightOpen,
  Pilcrow,
  Printer,
  Rows3,
  Sun,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { RibbonButton } from "../common/RibbonButton";
import { RibbonGroup } from "../common/RibbonGroup";
import type { RibbonTabProps } from "./types";

export function ViewTab({ tab, ui, actions }: RibbonTabProps) {
  return (
    <div className="ribbon-panel" aria-label="View commands">
      <RibbonGroup label="Views">
        <RibbonButton label="Print layout" icon={<Printer size={22} />} active={ui.layoutMode === "print"} large onClick={() => actions.setLayoutMode("print")} />
        <RibbonButton label="Web layout" icon={<Rows3 size={22} />} active={ui.layoutMode === "web"} large onClick={() => actions.setLayoutMode("web")} />
      </RibbonGroup>

      <RibbonGroup label="Show">
        <div className="ribbon-stack">
          <RibbonButton label="Navigation pane" icon={<PanelLeftOpen size={16} />} active={ui.leftSidebar} onClick={actions.toggleNavigation} />
          <RibbonButton label="Review pane" icon={<PanelRightOpen size={16} />} active={ui.rightSidebar} onClick={actions.toggleReview} />
          <RibbonButton label="Formatting marks" icon={<Pilcrow size={16} />} active={tab.document.settings.showFormattingMarks} onClick={() => actions.setFormattingMarks(!tab.document.settings.showFormattingMarks)} />
        </div>
      </RibbonGroup>

      <RibbonGroup label="Zoom">
        <div className="ribbon-row">
          <RibbonButton label="Zoom out" icon={<ZoomOut size={18} />} disabled={ui.zoom <= 50} onClick={() => actions.setZoom(ui.zoom - 10)} />
          <button className="zoom-readout" type="button" onClick={() => actions.setZoom(100)} title="Reset zoom to 100 percent">{ui.zoom}%</button>
          <RibbonButton label="Zoom in" icon={<ZoomIn size={18} />} disabled={ui.zoom >= 200} onClick={() => actions.setZoom(ui.zoom + 10)} />
        </div>
      </RibbonGroup>

      <RibbonGroup label="Window">
        <div className="ribbon-stack">
          <RibbonButton label="Focus mode" icon={<Focus size={16} />} active={ui.focusMode} onClick={() => actions.setFocusMode(!ui.focusMode)} />
          <RibbonButton label={ui.darkMode ? "Use light theme" : "Use dark theme"} icon={ui.darkMode ? <Sun size={16} /> : <Moon size={16} />} active={ui.darkMode} onClick={() => actions.setDarkMode(!ui.darkMode)} />
          <RibbonButton label="Command palette" icon={<Command size={16} />} onClick={actions.openCommandPalette} />
        </div>
      </RibbonGroup>

      <RibbonGroup label="Accessibility">
        <RibbonButton label="Reading focus" icon={<Eye size={22} />} large active={ui.focusMode} onClick={() => actions.setFocusMode(!ui.focusMode)} />
      </RibbonGroup>
    </div>
  );
}
