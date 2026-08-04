import { EditorView } from "prosemirror-view";
import type { EditorState } from "prosemirror-state";
import { undo, redo } from "prosemirror-history";
import type { Node as PMNode } from "prosemirror-model";
import { schema } from "@/editor/schema";
import { buildEditorState, mountEditorView } from "@/editor/editorView";
import { emptyDoc } from "@/editor/document";
import { countWords, type WordCount } from "@/editor/wordcount";
import {
  markActive,
  toggleMarkWithAttrs,
  setParagraph,
  setHeading,
  setAlign,
  changeIndent,
  setLineSpacing,
  toggleList,
  insertPageBreak,
  clearFormatting,
  insertLink,
  insertImage,
  insertTable,
} from "@/editor/commands";

export interface BlockInfo {
  kind: "paragraph" | "heading";
  level: number;
  align: "left" | "center" | "right" | "justify";
  indent: number;
  lineSpacing: string;
  inBulletList: boolean;
  inOrderedList: boolean;
  inTable: boolean;
}

export interface EditorSnapshot {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  superscript: boolean;
  subscript: boolean;
  link: boolean;
  block: BlockInfo;
  canUndo: boolean;
  canRedo: boolean;
  wordCount: WordCount;
}

function computeBlockInfo(state: EditorState): BlockInfo {
  // Not destructured as `$from` — Svelte reserves the `$` identifier prefix
  // for runes in .svelte.ts files, which collides with ProseMirror's naming
  // convention for ResolvedPos values.
  const resolvedFrom = state.selection.$from;
  const node = resolvedFrom.parent;
  let inBulletList = false;
  let inOrderedList = false;
  let inTable = false;
  for (let d = resolvedFrom.depth; d >= 0; d--) {
    const t = resolvedFrom.node(d).type.name;
    if (t === "bullet_list") inBulletList = true;
    if (t === "ordered_list") inOrderedList = true;
    if (t === "table") inTable = true;
  }
  return {
    kind: node.type.name === "heading" ? "heading" : "paragraph",
    level: node.type.name === "heading" ? node.attrs.level : 0,
    align: node.attrs.align ?? "left",
    indent: node.attrs.indent ?? 0,
    lineSpacing: node.attrs.lineSpacing ?? "1",
    inBulletList,
    inOrderedList,
    inTable,
  };
}

function computeSnapshot(state: EditorState): EditorSnapshot {
  return {
    bold: markActive(state, schema.marks.bold),
    italic: markActive(state, schema.marks.italic),
    underline: markActive(state, schema.marks.underline),
    strike: markActive(state, schema.marks.strike),
    superscript: markActive(state, schema.marks.superscript),
    subscript: markActive(state, schema.marks.subscript),
    link: markActive(state, schema.marks.link),
    block: computeBlockInfo(state),
    canUndo: undo(state),
    canRedo: redo(state),
    wordCount: countWords(state.doc),
  };
}

export class EditorController {
  view: EditorView | null = null;
  private pendingState: EditorState;
  snapshot = $state<EditorSnapshot>() as EditorSnapshot;
  dirty = $state(false);
  filePath = $state<string | null>(null);
  fileName = $state("Untitled document");
  fileFormat = $state<"owdoc" | "docx">("owdoc");

  constructor(doc?: PMNode) {
    this.pendingState = buildEditorState(doc ?? emptyDoc());
    this.snapshot = computeSnapshot(this.pendingState);
  }

  /** Bind the (already-constructed) editor to a DOM mount point. Safe to call once, on mount. */
  attach(mount: HTMLElement) {
    if (this.view) return;
    this.view = mountEditorView(mount, this.pendingState, (state) => {
      this.snapshot = computeSnapshot(state);
      this.dirty = true;
    });
  }

  /** Replace the document wholesale — used by File > New / File > Open. */
  loadDocument(doc: PMNode) {
    const state = buildEditorState(doc);
    if (this.view) {
      this.view.updateState(state);
    } else {
      this.pendingState = state;
    }
    this.snapshot = computeSnapshot(state);
    this.dirty = false;
  }

  get doc(): PMNode {
    return (this.view?.state ?? this.pendingState).doc;
  }

  focus() {
    this.view?.focus();
  }

  destroy() {
    this.view?.destroy();
  }

  markDirty(value: boolean) {
    this.dirty = value;
  }

  private run(command: (state: EditorState, dispatch: EditorView["dispatch"]) => boolean) {
    if (!this.view) return;
    command(this.view.state, this.view.dispatch);
    this.focus();
  }

  toggleBold = () => this.run((s, d) => toggleMarkWithAttrs(schema.marks.bold, {})(s, d));
  toggleItalic = () => this.run((s, d) => toggleMarkWithAttrs(schema.marks.italic, {})(s, d));
  toggleUnderline = () => this.run((s, d) => toggleMarkWithAttrs(schema.marks.underline, {})(s, d));
  toggleStrike = () => this.run((s, d) => toggleMarkWithAttrs(schema.marks.strike, {})(s, d));
  toggleSuperscript = () => this.run((s, d) => toggleMarkWithAttrs(schema.marks.superscript, {})(s, d));
  toggleSubscript = () => this.run((s, d) => toggleMarkWithAttrs(schema.marks.subscript, {})(s, d));

  setTextColor = (color: string) =>
    this.run((s, d) => toggleMarkWithAttrs(schema.marks.textColor, { color })(s, d));
  setHighlight = (color: string) =>
    this.run((s, d) => toggleMarkWithAttrs(schema.marks.highlight, { color })(s, d));
  setFontFamily = (family: string) =>
    this.run((s, d) => toggleMarkWithAttrs(schema.marks.fontFamily, { family })(s, d));
  setFontSize = (size: string) => this.run((s, d) => toggleMarkWithAttrs(schema.marks.fontSize, { size })(s, d));

  setParagraph = () => this.run((s, d) => setParagraph()(s, d));
  setHeading = (level: number) => this.run((s, d) => setHeading(level)(s, d));
  setAlign = (align: "left" | "center" | "right" | "justify") => this.run((s, d) => setAlign(align)(s, d));
  indent = () => this.run((s, d) => changeIndent(1)(s, d));
  outdent = () => this.run((s, d) => changeIndent(-1)(s, d));
  setLineSpacing = (v: string) => this.run((s, d) => setLineSpacing(v)(s, d));
  toggleBulletList = () => this.run((s, d) => toggleList(schema.nodes.bullet_list)(s, d));
  toggleOrderedList = () => this.run((s, d) => toggleList(schema.nodes.ordered_list)(s, d));
  clearFormatting = () => this.run((s, d) => clearFormatting()(s, d));
  insertPageBreak = () => this.run((s, d) => insertPageBreak()(s, d));
  insertLink = (href: string, title?: string) => this.run((s, d) => insertLink(href, title)(s, d));
  insertImage = (src: string, alt?: string) => this.run((s, d) => insertImage({ src, alt })(s, d));
  insertTable = (rows: number, cols: number, withHeaderRow = true) =>
    this.run((s, d) => insertTable(rows, cols, withHeaderRow)(s, d));

  undo = () => this.run((s, d) => undo(s, d));
  redo = () => this.run((s, d) => redo(s, d));
}
