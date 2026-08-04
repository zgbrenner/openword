import {
  AlignHorizontalSpaceAround,
  Columns2,
  FileCog,
  GalleryHorizontal,
  GalleryVertical,
  IndentDecrease,
  IndentIncrease,
  MoveHorizontal,
} from "lucide-react";
import { RibbonButton } from "../common/RibbonButton";
import { RibbonGroup } from "../common/RibbonGroup";
import { SelectControl } from "../common/SelectControl";
import type { RibbonTabProps } from "./types";

export function LayoutTab({ editor, tab, ui, actions }: RibbonTabProps) {
  const paragraph = editor?.getAttributes("paragraph") ?? {};
  const textStyle = editor?.getAttributes("textStyle") ?? {};
  const spacingBefore = Number(paragraph.spacingBeforePt ?? 0);
  const spacingAfter = Number(paragraph.spacingAfterPt ?? 8);

  return (
    <div className="ribbon-panel" aria-label="Layout commands">
      <RibbonGroup label="Page setup">
        <RibbonButton label="Page setup" icon={<FileCog size={23} />} large onClick={actions.openPageSetup} />
        <div className="ribbon-stack">
          <RibbonButton
            label="Portrait"
            icon={<GalleryVertical size={16} />}
            active={tab.document.page.orientation === "portrait"}
            onClick={() => actions.openPageSetup()}
          />
          <RibbonButton
            label="Landscape"
            icon={<GalleryHorizontal size={16} />}
            active={tab.document.page.orientation === "landscape"}
            onClick={() => actions.openPageSetup()}
          />
        </div>
      </RibbonGroup>

      <RibbonGroup label="Paragraph indent">
        <div className="ribbon-row">
          <RibbonButton label="Decrease indent" icon={<IndentDecrease size={18} />} disabled={!editor} onClick={() => editor?.chain().focus().outdentParagraph().run()} />
          <RibbonButton label="Increase indent" icon={<IndentIncrease size={18} />} disabled={!editor} onClick={() => editor?.chain().focus().indentParagraph().run()} />
        </div>
      </RibbonGroup>

      <RibbonGroup label="Paragraph spacing">
        <div className="ribbon-stack ribbon-stack--fields">
          <label className="ribbon-number-field">
            <span>Before</span>
            <input
              type="number"
              min={0}
              max={144}
              step={1}
              value={Number.isFinite(spacingBefore) ? spacingBefore : 0}
              disabled={!editor}
              onChange={(event) => {
                editor?.chain().focus().setParagraphSpacing(Number(event.target.value), spacingAfter).run();
              }}
            />
            <span>pt</span>
          </label>
          <label className="ribbon-number-field">
            <span>After</span>
            <input
              type="number"
              min={0}
              max={144}
              step={1}
              value={Number.isFinite(spacingAfter) ? spacingAfter : 8}
              disabled={!editor}
              onChange={(event) => {
                editor?.chain().focus().setParagraphSpacing(spacingBefore, Number(event.target.value)).run();
              }}
            />
            <span>pt</span>
          </label>
        </div>
      </RibbonGroup>

      <RibbonGroup label="Line spacing">
        <SelectControl
          label="Line spacing"
          visuallyHiddenLabel={false}
          value={String(textStyle.lineHeight ?? "1.15")}
          disabled={!editor}
          onChange={(event) => editor?.chain().focus().setLineHeight(event.target.value).run()}
        >
          <option value="1">Single</option>
          <option value="1.15">1.15</option>
          <option value="1.5">1.5 lines</option>
          <option value="2">Double</option>
        </SelectControl>
      </RibbonGroup>

      <RibbonGroup label="Layout mode">
        <div className="ribbon-row">
          <RibbonButton label="Print layout" icon={<AlignHorizontalSpaceAround size={18} />} active={ui.layoutMode === "print"} onClick={() => actions.setLayoutMode("print")} />
          <RibbonButton label="Web layout" icon={<MoveHorizontal size={18} />} active={ui.layoutMode === "web"} onClick={() => actions.setLayoutMode("web")} />
          <RibbonButton label="Columns" icon={<Columns2 size={18} />} disabled title="Multi-column sections are reserved for the section-layout milestone." />
        </div>
      </RibbonGroup>
    </div>
  );
}
