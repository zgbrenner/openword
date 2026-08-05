import { TextSelection, type Command, type EditorState, type Transaction } from "prosemirror-state";
import { toggleMark, setBlockType, wrapIn, lift } from "prosemirror-commands";
import { wrapInList, liftListItem } from "prosemirror-schema-list";
import { tableNodeTypes } from "prosemirror-tables";
import type { MarkType, NodeType } from "prosemirror-model";
import { schema } from "./schema";

export function markActive(state: EditorState, type: MarkType): boolean {
  const { from, $from, to, empty } = state.selection;
  if (empty) return !!type.isInSet(state.storedMarks || $from.marks());
  return state.doc.rangeHasMark(from, to, type);
}

export function toggleMarkCommand(type: MarkType): Command {
  return toggleMark(type);
}

export function toggleMarkWithAttrs(type: MarkType, attrs: Record<string, unknown>): Command {
  return (state, dispatch) => {
    const active = markActive(state, type);
    if (active) return toggleMark(type)(state, dispatch);
    return toggleMark(type, attrs)(state, dispatch);
  };
}

export function setParagraph(): Command {
  return setBlockType(schema.nodes.paragraph);
}

export function setHeading(level: number): Command {
  return setBlockType(schema.nodes.heading, { level });
}

export function setAlign(align: "left" | "center" | "right" | "justify"): Command {
  return (state, dispatch) => {
    const { $from } = state.selection;
    const node = $from.parent;
    if (!node.isTextblock) return false;
    if (dispatch) {
      const attrs = { ...node.attrs, align };
      const pos = $from.before();
      const tr = state.tr.setNodeMarkup(pos, undefined, attrs);
      dispatch(tr);
    }
    return true;
  };
}

export function changeIndent(delta: number): Command {
  return (state, dispatch) => {
    const { $from } = state.selection;
    const node = $from.parent;
    if (!node.isTextblock) return false;
    const nextIndent = Math.max(0, Math.min(8, (node.attrs.indent || 0) + delta));
    if (nextIndent === node.attrs.indent) return false;
    if (dispatch) {
      const pos = $from.before();
      const tr = state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent: nextIndent });
      dispatch(tr);
    }
    return true;
  };
}

export function setLineSpacing(lineSpacing: string): Command {
  return (state, dispatch) => {
    const { $from } = state.selection;
    const node = $from.parent;
    if (!node.isTextblock) return false;
    if (dispatch) {
      const pos = $from.before();
      const tr = state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, lineSpacing });
      dispatch(tr);
    }
    return true;
  };
}

export function toggleList(listType: NodeType): Command {
  return (state, dispatch, view) => {
    const { $from } = state.selection;
    const inThisList = hasAncestor($from, listType);
    if (inThisList) {
      return liftListItem(schema.nodes.list_item)(state, dispatch);
    }
    return wrapInList(listType)(state, dispatch, view);
  };
}

function hasAncestor($pos: import("prosemirror-model").ResolvedPos, type: NodeType): boolean {
  for (let d = $pos.depth; d >= 0; d--) {
    if ($pos.node(d).type === type) return true;
  }
  return false;
}

export function insertPageBreak(): Command {
  return (state, dispatch) => {
    if (!dispatch) return true;
    const breakNode = schema.nodes.page_break.create();
    let tr = state.tr.replaceSelectionWith(breakNode);
    // replaceSelectionWith leaves the new atom node selected; move the
    // cursor just past it instead, so typing continues onto the next page
    // rather than replacing the break itself. If the break landed at the
    // very end of the document, give it a paragraph to land in.
    const afterBreakPos = tr.selection.from + breakNode.nodeSize;
    if (afterBreakPos >= tr.doc.content.size) {
      tr = tr.insert(afterBreakPos, schema.nodes.paragraph.create());
    }
    tr = tr.setSelection(TextSelection.near(tr.doc.resolve(afterBreakPos), 1));
    dispatch(tr.scrollIntoView());
    return true;
  };
}

export function clearFormatting(): Command {
  return (state, dispatch) => {
    const { from, to } = state.selection;
    if (dispatch) {
      let tr: Transaction = state.tr;
      Object.values(schema.marks).forEach((markType) => {
        tr = tr.removeMark(from, to, markType);
      });
      dispatch(tr);
    }
    return true;
  };
}

export function insertLink(href: string, title?: string): Command {
  return (state, dispatch) => {
    const { from, to, empty } = state.selection;
    if (empty || !dispatch) return false;
    const mark = schema.marks.link.create({ href, title });
    dispatch(state.tr.addMark(from, to, mark));
    return true;
  };
}

export function insertImage(attrs: { src: string; alt?: string; width?: string | null; height?: string | null }): Command {
  return (state, dispatch) => {
    if (!dispatch) return true;
    const node = schema.nodes.image.create(attrs);
    dispatch(state.tr.replaceSelectionWith(node).scrollIntoView());
    return true;
  };
}

export function insertTable(rows: number, cols: number, withHeaderRow: boolean): Command {
  return (state, dispatch) => {
    if (!dispatch) return true;
    const types = tableNodeTypes(state.schema);
    const rowNodes = [];
    for (let r = 0; r < rows; r++) {
      const rowCells = [];
      for (let c = 0; c < cols; c++) {
        const cellType = withHeaderRow && r === 0 ? types.header_cell : types.cell;
        const cell = cellType.createAndFill();
        if (cell) rowCells.push(cell);
      }
      rowNodes.push(types.row.create(null, rowCells));
    }
    const table = types.table.create(null, rowNodes);
    const $from = state.selection.$from;
    const range = $from.blockRange();
    const insertPos = range ? range.end : state.selection.to;
    dispatch(state.tr.insert(insertPos, table).scrollIntoView());
    return true;
  };
}

export { wrapIn, lift };
