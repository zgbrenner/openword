import {
  CalendarDays,
  Columns3,
  Heading,
  ImagePlus,
  Link2,
  Merge,
  Minus,
  PanelBottom,
  PanelTop,
  Rows3,
  SplitSquareHorizontal,
  Table2,
  Trash2,
} from "lucide-react";
import { RibbonButton } from "../common/RibbonButton";
import { RibbonGroup } from "../common/RibbonGroup";
import type { RibbonTabProps } from "./types";

export function InsertTab({ editor, actions }: RibbonTabProps) {
  const inTable = Boolean(editor?.isActive("table"));

  return (
    <div className="ribbon-panel" aria-label="Insert commands">
      <RibbonGroup label="Pages">
        <RibbonButton
          label="Insert page break"
          icon={<Minus size={22} />}
          large
          shortcut="Ctrl+Enter"
          disabled={!editor}
          onClick={() => editor?.chain().focus().setPageBreak().run()}
        />
      </RibbonGroup>

      <RibbonGroup label="Table" className="ribbon-group--table">
        <div className="ribbon-stack ribbon-stack--primary">
          <RibbonButton
            label="Insert table"
            icon={<Table2 size={22} />}
            large
            disabled={!editor}
            onClick={() => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
          />
          <div className="ribbon-mini-grid">
            <RibbonButton label="Add row" icon={<Rows3 size={15} />} disabled={!inTable} onClick={() => editor?.chain().focus().addRowAfter().run()} />
            <RibbonButton label="Add column" icon={<Columns3 size={15} />} disabled={!inTable} onClick={() => editor?.chain().focus().addColumnAfter().run()} />
          </div>
        </div>
      </RibbonGroup>

      {inTable ? (
        <RibbonGroup label="Table tools">
          <div className="ribbon-row ribbon-row--tight">
            <RibbonButton label="Merge cells" icon={<Merge size={17} />} disabled={!editor?.can().mergeCells()} onClick={() => editor?.chain().focus().mergeCells().run()} />
            <RibbonButton label="Split cell" icon={<SplitSquareHorizontal size={17} />} disabled={!editor?.can().splitCell()} onClick={() => editor?.chain().focus().splitCell().run()} />
            <RibbonButton label="Delete row" icon={<Rows3 size={17} />} onClick={() => editor?.chain().focus().deleteRow().run()} />
            <RibbonButton label="Delete column" icon={<Columns3 size={17} />} onClick={() => editor?.chain().focus().deleteColumn().run()} />
            <RibbonButton label="Delete table" icon={<Trash2 size={17} />} onClick={() => editor?.chain().focus().deleteTable().run()} />
          </div>
        </RibbonGroup>
      ) : null}

      <RibbonGroup label="Illustrations">
        <RibbonButton label="Insert image" icon={<ImagePlus size={22} />} large disabled={!editor} onClick={actions.insertImage} />
      </RibbonGroup>

      <RibbonGroup label="Links">
        <RibbonButton label="Insert link" icon={<Link2 size={22} />} large disabled={!editor} onClick={actions.openLinkDialog} />
      </RibbonGroup>

      <RibbonGroup label="Header and footer">
        <div className="ribbon-row">
          <RibbonButton label="Edit header" icon={<PanelTop size={18} />} onClick={actions.openHeaderFooter} />
          <RibbonButton label="Edit footer" icon={<PanelBottom size={18} />} onClick={actions.openHeaderFooter} />
        </div>
      </RibbonGroup>

      <RibbonGroup label="Text">
        <div className="ribbon-stack">
          <RibbonButton
            label="Insert date"
            icon={<CalendarDays size={16} />}
            disabled={!editor}
            onClick={() => editor?.chain().focus().insertContent(new Intl.DateTimeFormat(undefined, { dateStyle: "long" }).format(new Date())).run()}
          />
          <RibbonButton
            label="Horizontal rule"
            icon={<Minus size={16} />}
            disabled={!editor}
            onClick={() => editor?.chain().focus().setHorizontalRule().run()}
          />
          <RibbonButton
            label="Heading"
            icon={<Heading size={16} />}
            disabled={!editor}
            onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
          />
        </div>
      </RibbonGroup>
    </div>
  );
}
