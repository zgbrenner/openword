import { Schema, type NodeSpec, type MarkSpec } from "prosemirror-model";
import { addListNodes } from "prosemirror-schema-list";
import { tableNodes } from "prosemirror-tables";
import { addSuggestionMarks } from "@handlewithcare/prosemirror-suggest-changes";
import OrderedMap from "orderedmap";

// The OpenWord document schema. This is intentionally modeled on what a
// real word processor needs (paragraph/heading alignment & indent, run-level
// character formatting, lists, tables, images, explicit page breaks) rather
// than a generic "rich text" schema — every node/attr here maps to something
// the toolbar exposes and, eventually, to a concrete OOXML element in the
// docx import/export layer.

const alignAttr = { default: "left" };
const indentAttr = { default: 0 };
const lineSpacingAttr = { default: "1" };

function toDom(node: { attrs: { align: string; indent: number; lineSpacing: string } }, tag: string) {
  const style: string[] = [];
  if (node.attrs.align && node.attrs.align !== "left") style.push(`text-align:${node.attrs.align}`);
  if (node.attrs.indent) style.push(`margin-left:${node.attrs.indent * 24}px`);
  if (node.attrs.lineSpacing && node.attrs.lineSpacing !== "1") style.push(`line-height:${node.attrs.lineSpacing}`);
  return [tag, style.length ? { style: style.join(";") } : {}, 0] as const;
}

const nodes: Record<string, NodeSpec> = {
  doc: { content: "block+" },

  paragraph: {
    group: "block",
    content: "inline*",
    attrs: { align: alignAttr, indent: indentAttr, lineSpacing: lineSpacingAttr },
    parseDOM: [{ tag: "p", getAttrs: parseBlockAttrs }],
    toDOM: (node) => toDom(node as any, "p"),
  },

  heading: {
    group: "block",
    content: "inline*",
    attrs: { level: { default: 1 }, align: alignAttr, indent: indentAttr, lineSpacing: lineSpacingAttr },
    defining: true,
    parseDOM: [1, 2, 3, 4, 5, 6].map((level) => ({
      tag: `h${level}`,
      getAttrs: (dom) => ({ ...parseBlockAttrs(dom as HTMLElement), level }),
    })),
    toDOM: (node) => toDom(node as any, `h${node.attrs.level}`),
  },

  page_break: {
    group: "block",
    atom: true,
    selectable: true,
    parseDOM: [{ tag: "div[data-page-break]" }],
    toDOM: () => ["div", { "data-page-break": "true", class: "ow-page-break" }, ["span", {}, "Page break"]],
  },

  image: {
    inline: true,
    group: "inline",
    draggable: true,
    attrs: {
      src: {},
      alt: { default: null },
      title: { default: null },
      width: { default: null },
      height: { default: null },
    },
    parseDOM: [
      {
        tag: "img[src]",
        getAttrs: (dom) => {
          const el = dom as HTMLElement;
          return {
            src: el.getAttribute("src"),
            alt: el.getAttribute("alt"),
            title: el.getAttribute("title"),
            width: el.getAttribute("width"),
            height: el.getAttribute("height"),
          };
        },
      },
    ],
    toDOM: (node) => {
      const { src, alt, title, width, height } = node.attrs;
      const attrs: Record<string, string> = { src };
      if (alt) attrs.alt = alt;
      if (title) attrs.title = title;
      if (width) attrs.width = width;
      if (height) attrs.height = height;
      return ["img", attrs];
    },
  },

  hard_break: {
    inline: true,
    group: "inline",
    selectable: false,
    parseDOM: [{ tag: "br" }],
    toDOM: () => ["br"],
  },

  text: { group: "inline" },
};

function parseBlockAttrs(dom: HTMLElement) {
  const style = dom.style;
  let align = dom.getAttribute("data-align") || style.textAlign || "left";
  if (!["left", "center", "right", "justify"].includes(align)) align = "left";
  const indentAttrVal = dom.getAttribute("data-indent");
  const indent = indentAttrVal ? parseInt(indentAttrVal, 10) : 0;
  const lineSpacing = dom.getAttribute("data-line-spacing") || "1";
  return { align, indent, lineSpacing };
}

const listNodes = addListNodes(OrderedMap.from(nodes), "paragraph block*", "block");

const allNodes = listNodes.append(
  tableNodes({
    tableGroup: "block",
    cellContent: "block+",
    cellAttributes: {},
  }),
);

const marks: Record<string, MarkSpec> = {
  bold: {
    parseDOM: [
      { tag: "strong" },
      { tag: "b" },
      { style: "font-weight", getAttrs: (value) => /^(bold(er)?|[5-9]\d{2,})$/.test(value as string) && null },
    ],
    toDOM: () => ["strong", 0],
  },
  italic: {
    parseDOM: [{ tag: "em" }, { tag: "i" }, { style: "font-style=italic" }],
    toDOM: () => ["em", 0],
  },
  underline: {
    parseDOM: [{ tag: "u" }, { style: "text-decoration=underline" }],
    toDOM: () => ["u", 0],
  },
  strike: {
    parseDOM: [{ tag: "s" }, { tag: "strike" }, { style: "text-decoration=line-through" }],
    toDOM: () => ["s", 0],
  },
  superscript: {
    excludes: "subscript",
    parseDOM: [{ tag: "sup" }],
    toDOM: () => ["sup", 0],
  },
  subscript: {
    excludes: "superscript",
    parseDOM: [{ tag: "sub" }],
    toDOM: () => ["sub", 0],
  },
  textColor: {
    attrs: { color: {} },
    parseDOM: [{ style: "color", getAttrs: (value) => ({ color: value as string }) }],
    toDOM: (mark) => ["span", { style: `color:${mark.attrs.color}` }, 0],
  },
  highlight: {
    attrs: { color: {} },
    parseDOM: [{ style: "background-color", getAttrs: (value) => ({ color: value as string }) }],
    toDOM: (mark) => ["span", { style: `background-color:${mark.attrs.color}` }, 0],
  },
  fontFamily: {
    attrs: { family: {} },
    parseDOM: [{ style: "font-family", getAttrs: (value) => ({ family: value as string }) }],
    toDOM: (mark) => ["span", { style: `font-family:${mark.attrs.family}` }, 0],
  },
  fontSize: {
    attrs: { size: {} },
    parseDOM: [{ style: "font-size", getAttrs: (value) => ({ size: value as string }) }],
    toDOM: (mark) => ["span", { style: `font-size:${mark.attrs.size}` }, 0],
  },
  link: {
    attrs: { href: {}, title: { default: null } },
    inclusive: false,
    parseDOM: [
      {
        tag: "a[href]",
        getAttrs: (dom) => ({
          href: (dom as HTMLElement).getAttribute("href"),
          title: (dom as HTMLElement).getAttribute("title"),
        }),
      },
    ],
    toDOM: (mark) => ["a", { href: mark.attrs.href, title: mark.attrs.title }, 0],
  },
  // Anchors a text range to a CommentThread (see src/editor/comments.ts) —
  // the thread's actual content (author, text, replies, resolved state)
  // lives outside the PM doc, this mark just records which thread(s) a
  // range belongs to. `excludes: ""` overrides the default same-type
  // exclusion so overlapping threads (different ids) can coexist on the
  // same text, which is routine once a document has more than one comment.
  comment: {
    attrs: { id: {} },
    excludes: "",
    inclusive: true,
    parseDOM: [
      {
        tag: "span[data-comment-id]",
        getAttrs: (dom) => ({ id: (dom as HTMLElement).getAttribute("data-comment-id") }),
      },
    ],
    toDOM: (mark) => ["span", { "data-comment-id": mark.attrs.id, class: "ow-comment-anchor" }, 0],
  },
};

// Track-changes marks (insertion/deletion/modification) come from
// @handlewithcare/prosemirror-suggest-changes (MIT) rather than being
// hand-rolled — see ARCHITECTURE.md's track-changes section for why. The
// library's marks only carry a suggestion `id`; author/timestamp metadata
// for each id lives in a side-store (src/editor/trackChanges.ts), the same
// pattern comment threads use to stay out of the document model.
export const schema = new Schema({
  nodes: allNodes,
  marks: addSuggestionMarks(marks),
});
