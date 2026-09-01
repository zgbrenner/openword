import { EditorView } from "prosemirror-view";
import { TextSelection, type EditorState } from "prosemirror-state";
import { undo, redo } from "prosemirror-history";
import {
  addColumnAfter,
  addRowAfter,
  deleteColumn as deleteTableColumn,
  deleteRow as deleteTableRow,
  deleteTable,
} from "prosemirror-tables";
import type { Node as PMNode, Mark } from "prosemirror-model";
import {
  isSuggestChangesEnabled,
  toggleSuggestChanges,
  applySuggestion,
  revertSuggestion,
  applySuggestions,
  revertSuggestions,
  selectSuggestion,
} from "@handlewithcare/prosemirror-suggest-changes";
import { schema } from "@/editor/schema";
import { buildEditorState, mountEditorView } from "@/editor/editorView";
import { emptyDoc } from "@/editor/document";
import { PaginationRuntime } from "@/editor/paginationPlugin";
import { PAGE_SIZES, geometryFor, type PageGeometry } from "@/editor/pagination";
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
import { addComment, replyToThread, setThreadResolved, deleteThread, findCommentAnchors, type CommentThread } from "@/editor/comments";
import { reconcileSuggestionMeta, type SuggestionMetaStore } from "@/editor/trackChanges";
import { getAuthorName } from "@/lib/authorIdentity";

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
  suggestingMode: boolean;
  selectionEmpty: boolean;
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
    suggestingMode: isSuggestChangesEnabled(state),
    selectionEmpty: state.selection.empty,
  };
}

// Character-level formatting marks format painter copies/clears. Deliberately
// excludes structural marks (link, comment, insertion/deletion/modification)
// — painting formatting onto other text shouldn't drag a hyperlink or a
// comment thread along with it.
const FORMAT_PAINTER_MARK_TYPES = () => [
  schema.marks.bold,
  schema.marks.italic,
  schema.marks.underline,
  schema.marks.strike,
  schema.marks.superscript,
  schema.marks.subscript,
  schema.marks.textColor,
  schema.marks.highlight,
  schema.marks.fontFamily,
  schema.marks.fontSize,
];

export class EditorController {
  view: EditorView | null = null;
  private pendingState: EditorState;
  snapshot = $state<EditorSnapshot>() as EditorSnapshot;
  dirty = $state(false);
  filePath = $state<string | null>(null);
  fileName = $state("Untitled document");
  fileFormat = $state<"owdoc" | "docx">("owdoc");
  comments = $state<CommentThread[]>([]);
  suggestionMeta = $state<SuggestionMetaStore>({});
  /**
   * Bumped by every wholesale document load (New, Open, "open with", crash
   * recovery). Async flows that put a dialog up before touching the document
   * capture it first and abandon their work if it moved while the dialog was
   * open — otherwise they overwrite whatever arrived in the meantime. See
   * restoreRecoveryIfAvailable() in EditorShell.svelte.
   */
  loadToken = $state(0);
  formatPainterMarks = $state<readonly Mark[] | null>(null);
  private formatPainterSticky = false;
  /** Long-lived pagination control channel — survives loadDocument() reloads,
   * see paginationPlugin.ts. Rebuilding the doc rebuilds the plugin instance,
   * but this object stays the same so PageCanvas's geometry/zoom updates
   * keep working across File > Open etc. */
  private paginationRuntime: PaginationRuntime;

  constructor(doc?: PMNode, onPageCount?: (count: number) => void) {
    this.paginationRuntime = new PaginationRuntime(geometryFor(PAGE_SIZES.letter), 1, onPageCount);
    this.pendingState = buildEditorState(doc ?? emptyDoc(), this.paginationRuntime);
    this.snapshot = computeSnapshot(this.pendingState);
  }

  /** Push a page-size/zoom change into the pagination plugin and trigger a
   * remeasure. Call whenever ViewState's pageSize or zoom changes — those
   * are plain Svelte state, not ProseMirror transactions, so the plugin
   * can't observe them on its own. */
  setPaginationGeometry(geometry: PageGeometry, zoom: number) {
    this.paginationRuntime.setGeometry(geometry, zoom);
  }

  /** Bind the (already-constructed) editor to a DOM mount point. Safe to call once, on mount. */
  attach(mount: HTMLElement) {
    if (this.view) return;
    this.view = mountEditorView(mount, this.pendingState, (state, docChanged) => {
      // The snapshot and the suggestion metadata are recomputed for every
      // transaction — the toolbar, status bar and review panel all track the
      // selection, not just the content.
      this.snapshot = computeSnapshot(state);
      this.suggestionMeta = reconcileSuggestionMeta(state.doc, this.suggestionMeta, getAuthorName());
      // Dirtiness is not: moving the caret, opening the find bar, or stepping
      // through search matches all dispatch selection-only transactions, and
      // marking the document unsaved for those turns the close prompt and the
      // recovery snapshot into noise for a document nobody edited.
      if (docChanged) this.dirty = true;
    });
    // Format painter applies on the next non-empty selection the user makes
    // by dragging — mouseup is a simple, reliable signal for "selection just
    // finished changing," without fighting ProseMirror's own transaction
    // stream (a plain click to move the cursor intentionally does nothing;
    // painter mode stays armed until an actual selection is made).
    mount.addEventListener("mouseup", () => {
      if (!this.formatPainterMarks) return;
      queueMicrotask(() => this.applyFormatPainter());
    });
  }

  /** Replace the document wholesale — used by File > New / File > Open. */
  loadDocument(doc: PMNode, comments: CommentThread[] = [], suggestionMeta: SuggestionMetaStore = {}) {
    const state = buildEditorState(doc, this.paginationRuntime);
    if (this.view) {
      this.view.updateState(state);
    } else {
      this.pendingState = state;
    }
    this.snapshot = computeSnapshot(state);
    this.comments = comments;
    this.suggestionMeta = reconcileSuggestionMeta(state.doc, suggestionMeta, getAuthorName());
    this.dirty = false;
    this.loadToken++;
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

  // Table structure editing. Each is a no-op unless the selection is inside a
  // table, which is what `snapshot.block.inTable` gates the toolbar group on.
  addTableRow = () => this.run((s, d) => addRowAfter(s, d));
  addTableColumn = () => this.run((s, d) => addColumnAfter(s, d));
  removeTableRow = () => this.run((s, d) => deleteTableRow(s, d));
  removeTableColumn = () => this.run((s, d) => deleteTableColumn(s, d));
  removeTable = () => this.run((s, d) => deleteTable(s, d));

  undo = () => this.run((s, d) => undo(s, d));
  redo = () => this.run((s, d) => redo(s, d));

  // --- Comments -----------------------------------------------------------
  addCommentToSelection = (text: string): CommentThread | null => {
    if (!this.view) return null;
    const thread = addComment(this.view.state, this.view.dispatch, getAuthorName(), text);
    if (thread) {
      this.comments = [...this.comments, thread];
      this.focus();
    }
    return thread;
  };

  replyToComment = (threadId: string, text: string) => {
    this.comments = replyToThread(this.comments, threadId, getAuthorName(), text);
  };

  resolveComment = (threadId: string) => {
    this.comments = setThreadResolved(this.comments, threadId, true);
  };

  reopenComment = (threadId: string) => {
    this.comments = setThreadResolved(this.comments, threadId, false);
  };

  deleteCommentThread = (threadId: string) => {
    if (!this.view) return;
    this.comments = deleteThread(this.view.state, this.view.dispatch, this.comments, threadId);
  };

  /** Move the cursor/selection to a comment thread's anchor and scroll it into view. */
  selectCommentAnchor = (threadId: string) => {
    if (!this.view) return;
    const anchor = findCommentAnchors(this.view.state.doc).find((a) => a.threadId === threadId);
    if (!anchor) return;
    const selection = TextSelection.create(this.view.state.doc, anchor.from, anchor.to);
    this.view.dispatch(this.view.state.tr.setSelection(selection).scrollIntoView());
    this.focus();
  };

  // --- Track changes --------------------------------------------------------
  toggleSuggesting = () => this.run((s, d) => toggleSuggestChanges(s, d));
  acceptSuggestion = (id: string | number) => this.run((s, d) => applySuggestion(id)(s, d));
  rejectSuggestion = (id: string | number) => this.run((s, d) => revertSuggestion(id)(s, d));
  acceptAllSuggestions = () => this.run((s, d) => applySuggestions(s, d));
  rejectAllSuggestions = () => this.run((s, d) => revertSuggestions(s, d));
  selectSuggestionRange = (id: string | number) => this.run((s, d) => selectSuggestion(id)(s, d));

  // --- Format painter -------------------------------------------------------
  /** Capture the current selection's formatting. `sticky` keeps painting on
   * every subsequent selection until cancelFormatPainter() instead of just once. */
  copyFormat = (sticky = false) => {
    if (!this.view) return;
    const { state } = this.view;
    const { from, to, empty } = state.selection;
    if (empty) {
      this.formatPainterMarks = state.selection.$from.marks();
    } else {
      let common: Mark[] | null = null;
      state.doc.nodesBetween(from, to, (node) => {
        if (!node.isText) return true;
        common = common === null ? [...node.marks] : common.filter((m) => node.marks.some((nm) => nm.eq(m)));
        return true;
      });
      this.formatPainterMarks = common ?? [];
    }
    this.formatPainterSticky = sticky;
  };

  cancelFormatPainter = () => {
    this.formatPainterMarks = null;
  };

  private applyFormatPainter() {
    if (!this.view || !this.formatPainterMarks) return;
    const { state, dispatch } = this.view;
    const { from, to, empty } = state.selection;
    if (empty) return;
    let tr = state.tr;
    for (const markType of FORMAT_PAINTER_MARK_TYPES()) tr = tr.removeMark(from, to, markType);
    for (const mark of this.formatPainterMarks) tr = tr.addMark(from, to, mark);
    dispatch(tr);
    if (!this.formatPainterSticky) this.formatPainterMarks = null;
  }
}
