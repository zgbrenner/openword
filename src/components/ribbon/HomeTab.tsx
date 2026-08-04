import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  CheckSquare2,
  Clipboard,
  Copy,
  Eraser,
  IndentDecrease,
  IndentIncrease,
  Italic,
  List,
  ListOrdered,
  Pilcrow,
  Redo2,
  Scissors,
  Strikethrough,
  Subscript,
  Superscript,
  Underline,
  Undo2,
} from "lucide-react";
import { RibbonButton } from "../common/RibbonButton";
import { RibbonGroup } from "../common/RibbonGroup";
import { SelectControl } from "../common/SelectControl";
import type { RibbonTabProps } from "./types";

const FONTS = [
  "Aptos",
  "Arial",
  "Calibri",
  "Cambria",
  "Georgia",
  "Helvetica",
  "Times New Roman",
  "Verdana",
  "Courier New",
];
const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 60, 72];

function colorInputValue(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  const short = trimmed.match(/^#([0-9a-f]{3})$/i);
  if (short) {
    return `#${short[1]!.split("").map((character) => `${character}${character}`).join("")}`;
  }
  return /^#[0-9a-f]{6}$/i.test(trimmed) ? trimmed : fallback;
}

function selectedText(editor: NonNullable<RibbonTabProps["editor"]>): string {
  const { from, to } = editor.state.selection;
  return editor.state.doc.textBetween(from, to, " ");
}

export function HomeTab({ editor, tab, actions }: RibbonTabProps) {
  const textStyle = editor?.getAttributes("textStyle") ?? {};
  const paragraph = editor?.getAttributes("paragraph") ?? {};
  const heading = editor?.getAttributes("heading") ?? {};
  const font = String(textStyle.fontFamily ?? tab.document.settings.defaultFontFamily);
  const fontSize = Number.parseFloat(String(textStyle.fontSize ?? tab.document.settings.defaultFontSizePt));

  const styleValue = editor?.isActive("heading")
    ? `heading-${Number(heading.level) || 1}`
    : String(paragraph.paragraphStyle ?? "normal");

  const copy = async (cut: boolean) => {
    if (!editor || !navigator.clipboard?.writeText) return;
    const text = selectedText(editor);
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      if (cut) editor.chain().focus().deleteSelection().run();
    } catch {
      // Clipboard permissions are controlled by the operating system and webview.
    }
  };

  const paste = async () => {
    if (!editor || !navigator.clipboard?.readText) return;
    try {
      const text = await navigator.clipboard.readText();
      editor.chain().focus().insertContent(text).run();
    } catch {
      // Keep the document unchanged when clipboard access is denied.
    }
  };

  return (
    <div className="ribbon-panel" aria-label="Home commands">
      <RibbonGroup label="Clipboard" className="ribbon-group--clipboard">
        <div className="ribbon-stack ribbon-stack--primary">
          <RibbonButton
            label="Paste"
            icon={<Clipboard size={22} />}
            large
            disabled={!editor || !navigator.clipboard?.readText}
            onClick={() => void paste()}
          />
          <div className="ribbon-mini-grid">
            <RibbonButton label="Cut" icon={<Scissors size={15} />} disabled={!editor} onClick={() => void copy(true)} />
            <RibbonButton label="Copy" icon={<Copy size={15} />} disabled={!editor} onClick={() => void copy(false)} />
          </div>
        </div>
      </RibbonGroup>

      <RibbonGroup label="History">
        <div className="ribbon-row">
          <RibbonButton label="Undo" icon={<Undo2 size={16} />} shortcut="Ctrl+Z" disabled={!editor?.can().undo()} onClick={() => editor?.chain().focus().undo().run()} />
          <RibbonButton label="Redo" icon={<Redo2 size={16} />} shortcut="Ctrl+Y" disabled={!editor?.can().redo()} onClick={() => editor?.chain().focus().redo().run()} />
        </div>
      </RibbonGroup>

      <RibbonGroup label="Font" className="ribbon-group--font">
        <div className="font-control-row">
          <SelectControl
            label="Font family"
            value={font}
            disabled={!editor}
            onChange={(event) => editor?.chain().focus().setFontFamily(event.target.value).run()}
          >
            {!FONTS.includes(font) ? <option value={font}>{font}</option> : null}
            {FONTS.map((candidate) => <option key={candidate} value={candidate}>{candidate}</option>)}
          </SelectControl>
          <SelectControl
            label="Font size"
            value={Number.isFinite(fontSize) ? fontSize : 11}
            disabled={!editor}
            onChange={(event) => editor?.chain().focus().setFontSize(`${event.target.value}pt`).run()}
          >
            {Number.isFinite(fontSize) && !FONT_SIZES.includes(fontSize) ? <option value={fontSize}>{fontSize}</option> : null}
            {FONT_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
          </SelectControl>
        </div>
        <div className="ribbon-row ribbon-row--tight">
          <RibbonButton label="Bold" icon={<Bold size={16} />} active={Boolean(editor?.isActive("bold"))} shortcut="Ctrl+B" disabled={!editor} onClick={() => editor?.chain().focus().toggleBold().run()} />
          <RibbonButton label="Italic" icon={<Italic size={16} />} active={Boolean(editor?.isActive("italic"))} shortcut="Ctrl+I" disabled={!editor} onClick={() => editor?.chain().focus().toggleItalic().run()} />
          <RibbonButton label="Underline" icon={<Underline size={16} />} active={Boolean(editor?.isActive("underline"))} shortcut="Ctrl+U" disabled={!editor} onClick={() => editor?.chain().focus().toggleUnderline().run()} />
          <RibbonButton label="Strikethrough" icon={<Strikethrough size={16} />} active={Boolean(editor?.isActive("strike"))} disabled={!editor} onClick={() => editor?.chain().focus().toggleStrike().run()} />
          <RibbonButton label="Superscript" icon={<Superscript size={16} />} active={Boolean(editor?.isActive("superscript"))} disabled={!editor} onClick={() => editor?.chain().focus().toggleSuperscript().run()} />
          <RibbonButton label="Subscript" icon={<Subscript size={16} />} active={Boolean(editor?.isActive("subscript"))} disabled={!editor} onClick={() => editor?.chain().focus().toggleSubscript().run()} />
          <label className="color-button" title="Text color">
            <span className="color-button__glyph">A</span>
            <input
              aria-label="Text color"
              type="color"
              value={colorInputValue(textStyle.color, "#1b1f24")}
              disabled={!editor}
              onChange={(event) => editor?.chain().focus().setColor(event.target.value).run()}
            />
          </label>
          <label className="color-button color-button--highlight" title="Highlight color">
            <span className="color-button__glyph">ab</span>
            <input
              aria-label="Highlight color"
              type="color"
              value={colorInputValue(editor?.getAttributes("highlight").color, "#fff09a")}
              disabled={!editor}
              onChange={(event) => editor?.chain().focus().toggleHighlight({ color: event.target.value }).run()}
            />
          </label>
          <RibbonButton
            label="Clear formatting"
            icon={<Eraser size={16} />}
            disabled={!editor}
            onClick={() => editor?.chain().focus().unsetAllMarks().clearNodes().run()}
          />
        </div>
      </RibbonGroup>

      <RibbonGroup label="Paragraph" className="ribbon-group--paragraph">
        <div className="ribbon-row ribbon-row--tight">
          <RibbonButton label="Bulleted list" icon={<List size={17} />} active={Boolean(editor?.isActive("bulletList"))} disabled={!editor} onClick={() => editor?.chain().focus().toggleBulletList().run()} />
          <RibbonButton label="Numbered list" icon={<ListOrdered size={17} />} active={Boolean(editor?.isActive("orderedList"))} disabled={!editor} onClick={() => editor?.chain().focus().toggleOrderedList().run()} />
          <RibbonButton label="Task list" icon={<CheckSquare2 size={17} />} active={Boolean(editor?.isActive("taskList"))} disabled={!editor} onClick={() => editor?.chain().focus().toggleTaskList().run()} />
          <RibbonButton label="Decrease indent" icon={<IndentDecrease size={17} />} disabled={!editor} onClick={() => editor?.chain().focus().outdentParagraph().run()} />
          <RibbonButton label="Increase indent" icon={<IndentIncrease size={17} />} disabled={!editor} onClick={() => editor?.chain().focus().indentParagraph().run()} />
          <RibbonButton label="Show formatting marks" icon={<Pilcrow size={17} />} active={tab.document.settings.showFormattingMarks} onClick={() => actions.setFormattingMarks(!tab.document.settings.showFormattingMarks)} />
        </div>
        <div className="ribbon-row ribbon-row--tight">
          <RibbonButton label="Align left" icon={<AlignLeft size={17} />} active={Boolean(editor?.isActive({ textAlign: "left" }))} disabled={!editor} onClick={() => editor?.chain().focus().setTextAlign("left").run()} />
          <RibbonButton label="Center" icon={<AlignCenter size={17} />} active={Boolean(editor?.isActive({ textAlign: "center" }))} disabled={!editor} onClick={() => editor?.chain().focus().setTextAlign("center").run()} />
          <RibbonButton label="Align right" icon={<AlignRight size={17} />} active={Boolean(editor?.isActive({ textAlign: "right" }))} disabled={!editor} onClick={() => editor?.chain().focus().setTextAlign("right").run()} />
          <RibbonButton label="Justify" icon={<AlignJustify size={17} />} active={Boolean(editor?.isActive({ textAlign: "justify" }))} disabled={!editor} onClick={() => editor?.chain().focus().setTextAlign("justify").run()} />
          <SelectControl
            label="Line spacing"
            value={String(textStyle.lineHeight ?? "1.15")}
            disabled={!editor}
            onChange={(event) => editor?.chain().focus().setLineHeight(event.target.value).run()}
          >
            <option value="1">1.0</option>
            <option value="1.15">1.15</option>
            <option value="1.5">1.5</option>
            <option value="2">2.0</option>
          </SelectControl>
        </div>
      </RibbonGroup>

      <RibbonGroup label="Styles" className="ribbon-group--styles">
        <SelectControl
          label="Paragraph style"
          visuallyHiddenLabel={false}
          value={styleValue}
          disabled={!editor}
          onChange={(event) => {
            const value = event.target.value;
            if (value.startsWith("heading-")) {
              editor?.chain().focus().setHeading({ level: Number(value.slice(-1)) as 1 | 2 | 3 | 4 | 5 | 6 }).run();
            } else {
              editor?.chain().focus().setParagraph().setParagraphStyle(value as "normal" | "title" | "subtitle" | "quote" | "compact").run();
            }
          }}
        >
          <option value="normal">Normal</option>
          <option value="title">Title</option>
          <option value="subtitle">Subtitle</option>
          <option value="quote">Quote</option>
          <option value="compact">Compact</option>
          <option value="heading-1">Heading 1</option>
          <option value="heading-2">Heading 2</option>
          <option value="heading-3">Heading 3</option>
          <option value="heading-4">Heading 4</option>
          <option value="heading-5">Heading 5</option>
          <option value="heading-6">Heading 6</option>
        </SelectControl>
      </RibbonGroup>

      <RibbonGroup label="Editing">
        <div className="ribbon-stack">
          <RibbonButton label="Find and replace" icon={<Pilcrow size={16} />} onClick={actions.openFindReplace} />
          <RibbonButton label="Search commands" icon={<Clipboard size={16} />} onClick={actions.openCommandPalette} />
        </div>
      </RibbonGroup>
    </div>
  );
}
