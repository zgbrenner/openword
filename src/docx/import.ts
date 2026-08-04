// DOCX import: reads a .docx (OOXML-in-a-zip) file with JSZip + DOMParser and
// builds an OpenWord ProseMirror document. This is a best-effort v1 converter
// — unrecognized XML is skipped, not preserved. See ARCHITECTURE.md's "DOCX
// fidelity" section for the real parse -> model -> serialize roadmap (v2).

import JSZip from "jszip";
import type { Node as PMNode } from "prosemirror-model";
import { docFromJSON, emptyDoc } from "../editor/document";

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function importDocx(bytes: Uint8Array | ArrayBuffer): Promise<PMNode> {
  try {
    const zip = await JSZip.loadAsync(bytes);
    const documentFile = zip.file("word/document.xml");
    if (!documentFile) return emptyDoc();
    const documentXml = await documentFile.async("string");

    const relsFile = zip.file("word/_rels/document.xml.rels");
    const relsXml = relsFile ? await relsFile.async("string") : undefined;
    const rels = parseRelationships(relsXml);

    const numberingFile = zip.file("word/numbering.xml");
    const numberingXml = numberingFile ? await numberingFile.async("string") : undefined;
    const numberingDefs = parseNumbering(numberingXml);

    const media = await loadMedia(zip, rels);

    const xmlDoc = new DOMParser().parseFromString(documentXml, "application/xml");
    if (xmlDoc.getElementsByTagName("parsererror").length > 0) return emptyDoc();
    const bodyEl = findChild(xmlDoc.documentElement, "body");
    if (!bodyEl) return emptyDoc();

    const ctx: ImportContext = { rels, media, numberingDefs };
    const content = convertBody(bodyEl, ctx);
    if (content.length === 0) content.push({ type: "paragraph" });

    return docFromJSON({ type: "doc", content });
  } catch (err) {
    // A malformed/unsupported .docx must never crash the caller — degrade to
    // an empty (but valid) document rather than losing the whole import.
    console.error("importDocx: failed to parse document, returning an empty document", err);
    return emptyDoc();
  }
}

// ---------------------------------------------------------------------------
// Shared context
// ---------------------------------------------------------------------------

interface RelInfo {
  target: string;
  type: string;
}

interface NumLevelDef {
  format: string;
  start: number;
}

interface NumDef {
  levels: Map<number, NumLevelDef>;
}

interface ImportContext {
  rels: Map<string, RelInfo>;
  media: Map<string, string>; // relationship id -> data: URL
  numberingDefs: Map<string, NumDef>;
}

// ---------------------------------------------------------------------------
// XML helpers
// ---------------------------------------------------------------------------

function localName(el: Element): string {
  return el.localName || el.tagName.split(":").pop() || el.tagName;
}

function findChild(el: Element | null, name: string): Element | null {
  if (!el) return null;
  for (const child of Array.from(el.children)) {
    if (localName(child) === name) return child;
  }
  return null;
}

function findChildren(el: Element | null, name: string): Element[] {
  if (!el) return [];
  return Array.from(el.children).filter((c) => localName(c) === name);
}

function findDescendant(el: Element, name: string): Element | null {
  for (const child of Array.from(el.children)) {
    if (localName(child) === name) return child;
    const found = findDescendant(child, name);
    if (found) return found;
  }
  return null;
}

function onOff(el: Element | null): boolean {
  if (!el) return false;
  const val = el.getAttribute("w:val");
  if (val === null) return true;
  return val === "true" || val === "1" || val === "on";
}

// ---------------------------------------------------------------------------
// Relationships / media / numbering parts
// ---------------------------------------------------------------------------

function parseRelationships(relsXml: string | undefined): Map<string, RelInfo> {
  const map = new Map<string, RelInfo>();
  if (!relsXml) return map;
  try {
    const doc = new DOMParser().parseFromString(relsXml, "application/xml");
    if (doc.getElementsByTagName("parsererror").length > 0) return map;
    for (const rel of Array.from(doc.getElementsByTagName("Relationship"))) {
      const id = rel.getAttribute("Id");
      const target = rel.getAttribute("Target");
      const type = rel.getAttribute("Type") || "";
      if (id && target) map.set(id, { target, type });
    }
  } catch {
    // malformed rels part: degrade to no relationships rather than failing the import
  }
  return map;
}

function resolvePartPath(basePath: string, target: string): string {
  if (target.startsWith("/")) return target.slice(1);
  const baseParts = basePath.split("/").slice(0, -1);
  const stack = [...baseParts];
  for (const part of target.split("/")) {
    if (part === "..") stack.pop();
    else if (part === "." || part === "") continue;
    else stack.push(part);
  }
  return stack.join("/");
}

async function loadMedia(zip: JSZip, rels: Map<string, RelInfo>): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  for (const [id, rel] of rels) {
    if (!rel.type.includes("/image")) continue;
    const path = resolvePartPath("word/document.xml", rel.target);
    const file = zip.file(path);
    if (!file) continue;
    try {
      const fileBytes = await file.async("uint8array");
      const mime = guessMimeFromPath(path);
      result.set(id, `data:${mime};base64,${bytesToBase64(fileBytes)}`);
    } catch {
      // unreadable media part: skip this one image, keep the rest of the import going
    }
  }
  return result;
}

function guessMimeFromPath(path: string): string {
  const ext = (path.split(".").pop() || "").toLowerCase();
  switch (ext) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "bmp":
      return "image/bmp";
    case "tif":
    case "tiff":
      return "image/tiff";
    case "webp":
      return "image/webp";
    case "svg":
      return "image/svg+xml";
    default:
      return "image/png";
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function parseNumbering(numberingXml: string | undefined): Map<string, NumDef> {
  const result = new Map<string, NumDef>();
  if (!numberingXml) return result;
  try {
    const doc = new DOMParser().parseFromString(numberingXml, "application/xml");
    if (doc.getElementsByTagName("parsererror").length > 0) return result;
    const root = doc.documentElement;
    const abstractLevels = new Map<string, Map<number, NumLevelDef>>();
    for (const abstractNum of findChildren(root, "abstractNum")) {
      const id = abstractNum.getAttribute("w:abstractNumId");
      if (!id) continue;
      const levels = new Map<number, NumLevelDef>();
      for (const lvl of findChildren(abstractNum, "lvl")) {
        const ilvl = parseInt(lvl.getAttribute("w:ilvl") || "0", 10) || 0;
        const numFmt = findChild(lvl, "numFmt")?.getAttribute("w:val") || "decimal";
        const startRaw = parseInt(findChild(lvl, "start")?.getAttribute("w:val") || "1", 10);
        levels.set(ilvl, { format: numFmt, start: Number.isFinite(startRaw) ? startRaw : 1 });
      }
      abstractLevels.set(id, levels);
    }
    for (const num of findChildren(root, "num")) {
      const numId = num.getAttribute("w:numId");
      const abstractRef = findChild(num, "abstractNumId")?.getAttribute("w:val");
      if (!numId || !abstractRef) continue;
      const levels = abstractLevels.get(abstractRef);
      if (levels) result.set(numId, { levels });
    }
  } catch {
    // malformed numbering part: degrade to "no numbering info" (lists still import as bullets)
  }
  return result;
}

// ---------------------------------------------------------------------------
// Paragraph-level property readers
// ---------------------------------------------------------------------------

function readAlign(pPr: Element | null): "left" | "center" | "right" | "justify" {
  const val = findChild(pPr, "jc")?.getAttribute("w:val");
  switch (val) {
    case "center":
      return "center";
    case "right":
    case "end":
      return "right";
    case "both":
    case "distribute":
    case "thaiDistribute":
    case "highKashida":
    case "lowKashida":
    case "mediumKashida":
      return "justify";
    default:
      return "left";
  }
}

function readIndent(pPr: Element | null): number {
  const ind = findChild(pPr, "ind");
  if (!ind) return 0;
  const raw = ind.getAttribute("w:left") ?? ind.getAttribute("w:start");
  if (!raw) return 0;
  const twips = parseInt(raw, 10);
  if (!Number.isFinite(twips) || twips <= 0) return 0;
  return Math.max(0, Math.min(8, Math.round(twips / 360)));
}

function readLineSpacing(pPr: Element | null): string {
  const spacing = findChild(pPr, "spacing");
  if (!spacing) return "1";
  const lineRaw = spacing.getAttribute("w:line");
  const rule = spacing.getAttribute("w:lineRule") ?? "auto";
  if (!lineRaw || rule !== "auto") return "1";
  const line = parseInt(lineRaw, 10);
  if (!Number.isFinite(line) || line <= 0) return "1";
  const multiplier = line / 240;
  if (!Number.isFinite(multiplier) || multiplier <= 0) return "1";
  return (Math.round(multiplier * 100) / 100).toString();
}

function readHeadingLevel(pPr: Element | null): number | null {
  const styleId = findChild(pPr, "pStyle")?.getAttribute("w:val");
  if (!styleId) return null;
  const match = /^heading\s*(\d)$/i.exec(styleId);
  if (!match) return null;
  const level = parseInt(match[1], 10);
  if (!Number.isFinite(level)) return null;
  return Math.max(1, Math.min(6, level));
}

function readPageBreakBefore(pPr: Element | null): boolean {
  return onOff(findChild(pPr, "pageBreakBefore"));
}

function readNumPr(pPr: Element | null, defs: Map<string, NumDef>): { level: number; kind: "bullet_list" | "ordered_list"; start: number } | null {
  const numPr = findChild(pPr, "numPr");
  if (!numPr) return null;
  const numId = findChild(numPr, "numId")?.getAttribute("w:val");
  if (!numId) return null;
  const level = Math.max(0, parseInt(findChild(numPr, "ilvl")?.getAttribute("w:val") || "0", 10) || 0);
  const levelDef = defs.get(numId)?.levels.get(level);
  const isBullet = levelDef ? levelDef.format === "bullet" : true;
  return { level, kind: isBullet ? "bullet_list" : "ordered_list", start: levelDef?.start ?? 1 };
}

// ---------------------------------------------------------------------------
// Run-level marks
// ---------------------------------------------------------------------------

const HIGHLIGHT_NAME_TO_HEX: Record<string, string> = {
  black: "#000000", blue: "#0000ff", cyan: "#00ffff", darkBlue: "#00008b", darkCyan: "#008b8b",
  darkGray: "#404040", darkGreen: "#006400", darkMagenta: "#8b008b", darkRed: "#8b0000", darkYellow: "#808000",
  green: "#00ff00", lightGray: "#d3d3d3", magenta: "#ff00ff", red: "#ff0000", white: "#ffffff", yellow: "#ffff00",
};

type MarkJSON = { type: string; attrs?: Record<string, unknown> };

function marksFromRPr(rPr: Element | null): MarkJSON[] {
  if (!rPr) return [];
  const marks: MarkJSON[] = [];
  if (onOff(findChild(rPr, "b"))) marks.push({ type: "bold" });
  if (onOff(findChild(rPr, "i"))) marks.push({ type: "italic" });
  const underlineVal = findChild(rPr, "u")?.getAttribute("w:val");
  if (underlineVal && underlineVal !== "none") marks.push({ type: "underline" });
  if (onOff(findChild(rPr, "strike")) || onOff(findChild(rPr, "dstrike"))) marks.push({ type: "strike" });
  const vertAlign = findChild(rPr, "vertAlign")?.getAttribute("w:val");
  if (vertAlign === "superscript") marks.push({ type: "superscript" });
  else if (vertAlign === "subscript") marks.push({ type: "subscript" });

  const colorVal = findChild(rPr, "color")?.getAttribute("w:val");
  if (colorVal && /^[0-9a-fA-F]{6}$/.test(colorVal)) {
    marks.push({ type: "textColor", attrs: { color: `#${colorVal.toLowerCase()}` } });
  }

  const highlightVal = findChild(rPr, "highlight")?.getAttribute("w:val");
  if (highlightVal && highlightVal !== "none" && HIGHLIGHT_NAME_TO_HEX[highlightVal]) {
    marks.push({ type: "highlight", attrs: { color: HIGHLIGHT_NAME_TO_HEX[highlightVal] } });
  } else {
    const fill = findChild(rPr, "shd")?.getAttribute("w:fill");
    if (fill && fill !== "auto" && /^[0-9a-fA-F]{6}$/.test(fill)) {
      marks.push({ type: "highlight", attrs: { color: `#${fill.toLowerCase()}` } });
    }
  }

  const rFonts = findChild(rPr, "rFonts");
  const family = rFonts?.getAttribute("w:ascii") || rFonts?.getAttribute("w:hAnsi") || rFonts?.getAttribute("w:cs") || rFonts?.getAttribute("w:eastAsia");
  if (family) marks.push({ type: "fontFamily", attrs: { family } });

  const szVal = findChild(rPr, "sz")?.getAttribute("w:val");
  if (szVal) {
    const halfPoints = parseInt(szVal, 10);
    if (Number.isFinite(halfPoints) && halfPoints > 0) marks.push({ type: "fontSize", attrs: { size: `${halfPoints / 2}pt` } });
  }

  return marks;
}

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

function extractImageFromDrawing(drawingEl: Element, ctx: ImportContext): { type: "image"; attrs: Record<string, unknown> } | null {
  const blip = findDescendant(drawingEl, "blip");
  const embedId = blip?.getAttribute("r:embed") || blip?.getAttribute("r:link");
  if (!embedId) return null;
  const dataUrl = ctx.media.get(embedId);
  if (!dataUrl) return null;

  const extent = findDescendant(drawingEl, "extent");
  const cx = extent ? parseInt(extent.getAttribute("cx") || "0", 10) : 0;
  const cy = extent ? parseInt(extent.getAttribute("cy") || "0", 10) : 0;
  const docPr = findDescendant(drawingEl, "docPr");
  const alt = docPr?.getAttribute("descr") || null;
  const title = docPr?.getAttribute("title") || null;

  const attrs: Record<string, unknown> = { src: dataUrl, alt, title, width: null, height: null };
  if (cx > 0) attrs.width = Math.round(cx / 9525);
  if (cy > 0) attrs.height = Math.round(cy / 9525);
  return { type: "image", attrs };
}

// ---------------------------------------------------------------------------
// Paragraph body (runs, hyperlinks, breaks, images) -> PM inline/block JSON
// ---------------------------------------------------------------------------

function buildParagraphBlocks(
  pEl: Element,
  baseAttrs: { align: string; indent: number; lineSpacing: string },
  headingLevel: number | null,
  ctx: ImportContext,
): unknown[] {
  const blocks: unknown[] = [];
  let current: unknown[] = [];

  const flushParagraph = () => {
    const node = headingLevel
      ? { type: "heading", attrs: { level: headingLevel, ...baseAttrs }, content: current }
      : { type: "paragraph", attrs: baseAttrs, content: current };
    blocks.push(node);
    current = [];
  };

  const pushInline = (node: unknown) => current.push(node);
  const withMarks = (node: Record<string, unknown>, marks: MarkJSON[]) => (marks.length ? { ...node, marks } : node);

  function processRun(runEl: Element, marks: MarkJSON[]) {
    const rPr = findChild(runEl, "rPr");
    const runMarks = [...marks, ...marksFromRPr(rPr)];
    for (const child of Array.from(runEl.children)) {
      const local = localName(child);
      switch (local) {
        case "t":
        case "delText": {
          const text = child.textContent || "";
          if (text) pushInline(withMarks({ type: "text", text }, runMarks));
          break;
        }
        case "tab":
          pushInline(withMarks({ type: "text", text: "\t" }, runMarks));
          break;
        case "noBreakHyphen":
          pushInline(withMarks({ type: "text", text: "-" }, runMarks));
          break;
        case "br": {
          if (child.getAttribute("w:type") === "page") {
            flushParagraph();
            blocks.push({ type: "page_break" });
          } else {
            pushInline({ type: "hard_break" });
          }
          break;
        }
        case "cr":
          pushInline({ type: "hard_break" });
          break;
        case "drawing": {
          const img = extractImageFromDrawing(child, ctx);
          if (img) pushInline(img);
          break;
        }
        case "AlternateContent": {
          const choice = findChild(child, "Choice") || findChild(child, "Fallback");
          const drawing = choice ? findChild(choice, "drawing") : null;
          if (drawing) {
            const img = extractImageFromDrawing(drawing, ctx);
            if (img) pushInline(img);
          }
          break;
        }
        default:
          break; // rPr and other non-content run markers: skip
      }
    }
  }

  function walk(el: Element, marks: MarkJSON[]) {
    for (const child of Array.from(el.children)) {
      const local = localName(child);
      switch (local) {
        case "r":
          processRun(child, marks);
          break;
        case "hyperlink": {
          const rId = child.getAttribute("r:id");
          const anchor = child.getAttribute("w:anchor");
          let href: string | null = null;
          if (rId) href = ctx.rels.get(rId)?.target ?? null;
          else if (anchor) href = `#${anchor}`;
          walk(child, href ? [...marks, { type: "link", attrs: { href } }] : marks);
          break;
        }
        case "ins":
        case "del":
        case "smartTag":
          // Tracked-change / smart-tag wrappers: drop the metadata, keep the content.
          walk(child, marks);
          break;
        case "sdt": {
          const content = findChild(child, "sdtContent");
          if (content) walk(content, marks);
          break;
        }
        default:
          break; // bookmarks, proofErr, comment anchors, unknown elements: skip
      }
    }
  }

  walk(pEl, []);
  flushParagraph();
  return blocks;
}

// ---------------------------------------------------------------------------
// Lists — flattens the OOXML "sequence of numPr paragraphs" model into
// nested bullet_list/ordered_list/list_item PM nodes.
// ---------------------------------------------------------------------------

interface ListFrame {
  level: number;
  kind: "bullet_list" | "ordered_list";
  order: number;
  items: Record<string, unknown>[];
}

interface ListState {
  addItem(level: number, kind: "bullet_list" | "ordered_list", order: number, blocks: unknown[]): void;
  flush(): void;
}

function createListState(out: unknown[]): ListState {
  const stack: ListFrame[] = [];

  function closeTop() {
    const frame = stack.pop();
    if (!frame) return;
    const listNode: Record<string, unknown> = { type: frame.kind, content: frame.items };
    if (frame.kind === "ordered_list") listNode.attrs = { order: frame.order };
    if (stack.length > 0) {
      const parent = stack[stack.length - 1];
      if (parent.items.length === 0) {
        parent.items.push({ type: "list_item", content: [{ type: "paragraph" }] });
      }
      const lastItem = parent.items[parent.items.length - 1];
      const prevContent = Array.isArray(lastItem.content) ? (lastItem.content as unknown[]) : [];
      lastItem.content = [...prevContent, listNode];
    } else {
      out.push(listNode);
    }
  }

  function flush() {
    while (stack.length > 0) closeTop();
  }

  function addItem(level: number, kind: "bullet_list" | "ordered_list", order: number, blocks: unknown[]) {
    const safeLevel = Math.max(0, Math.min(level, 8));
    while (stack.length > 0) {
      const top = stack[stack.length - 1];
      if (top.level > safeLevel || (top.level === safeLevel && top.kind !== kind)) {
        closeTop();
        continue;
      }
      break;
    }
    if (stack.length === 0 || stack[stack.length - 1].level < safeLevel) {
      const from = stack.length > 0 ? stack[stack.length - 1].level + 1 : 0;
      for (let l = from; l <= safeLevel; l++) {
        stack.push({ level: l, kind, order, items: [] });
      }
    }
    const top = stack[stack.length - 1];
    const content = blocks.length > 0 ? blocks : [{ type: "paragraph" }];
    top.items.push({ type: "list_item", content });
  }

  return { addItem, flush };
}

// ---------------------------------------------------------------------------
// Body-level walk (paragraphs, tables, content controls)
// ---------------------------------------------------------------------------

function handleParagraphElement(pEl: Element, ctx: ImportContext, listState: ListState, out: unknown[]) {
  const pPr = findChild(pEl, "pPr");
  const align = readAlign(pPr);
  const indent = readIndent(pPr);
  const lineSpacing = readLineSpacing(pPr);
  const headingLevel = readHeadingLevel(pPr);
  const pageBreakBefore = readPageBreakBefore(pPr);
  // Headings never enter the list structure: our schema's list_item requires
  // a literal `paragraph` as its first child, which a `heading` node can't
  // satisfy. Numbered headings therefore import as plain headings (losing
  // only the numbering, not the text/structure) — an explicit v1 tradeoff.
  const numInfo = headingLevel === null ? readNumPr(pPr, ctx.numberingDefs) : null;

  const blocks = buildParagraphBlocks(pEl, { align, indent, lineSpacing }, headingLevel, ctx);

  if (numInfo) {
    listState.addItem(numInfo.level, numInfo.kind, numInfo.start, blocks);
  } else {
    listState.flush();
    if (pageBreakBefore) out.push({ type: "page_break" });
    out.push(...blocks);
  }
}

function convertTable(tblEl: Element, ctx: ImportContext): Record<string, unknown> | null {
  const rows: Record<string, unknown>[] = [];
  const openSpans: (Record<string, unknown> | undefined)[] = [];

  for (const tr of findChildren(tblEl, "tr")) {
    const trPr = findChild(tr, "trPr");
    const isHeaderRow = !!findChild(trPr, "tblHeader");
    const cellsOut: Record<string, unknown>[] = [];
    let colIndex = 0;

    for (const tc of findChildren(tr, "tc")) {
      const tcPr = findChild(tc, "tcPr");
      const gridSpanRaw = findChild(tcPr, "gridSpan")?.getAttribute("w:val");
      const gridSpan = Math.max(1, parseInt(gridSpanRaw || "1", 10) || 1);
      const vMergeEl = findChild(tcPr, "vMerge");
      const vMergeVal = vMergeEl ? vMergeEl.getAttribute("w:val") || "continue" : null;

      if (vMergeEl && vMergeVal === "continue") {
        const origin = openSpans[colIndex];
        if (origin) {
          const originAttrs = origin.attrs as { rowspan?: number };
          originAttrs.rowspan = (originAttrs.rowspan || 1) + 1;
        }
        colIndex += gridSpan;
        continue;
      }

      const blocks: unknown[] = [];
      for (const child of Array.from(tc.children)) {
        const local = localName(child);
        if (local === "p") {
          const pPr = findChild(child, "pPr");
          const cellParagraphAttrs = { align: readAlign(pPr), indent: readIndent(pPr), lineSpacing: readLineSpacing(pPr) };
          blocks.push(...buildParagraphBlocks(child, cellParagraphAttrs, readHeadingLevel(pPr), ctx));
        } else if (local === "tbl") {
          const nested = convertTable(child, ctx);
          if (nested) blocks.push(nested);
        }
      }
      if (blocks.length === 0) blocks.push({ type: "paragraph" });

      const cellNode: Record<string, unknown> = {
        type: isHeaderRow ? "table_header" : "table_cell",
        attrs: { colspan: gridSpan, rowspan: 1, colwidth: null },
        content: blocks,
      };
      cellsOut.push(cellNode);
      if (vMergeEl && vMergeVal === "restart") {
        for (let k = 0; k < gridSpan; k++) openSpans[colIndex + k] = cellNode;
      } else {
        for (let k = 0; k < gridSpan; k++) openSpans[colIndex + k] = undefined;
      }
      colIndex += gridSpan;
    }
    rows.push({ type: "table_row", content: cellsOut });
  }

  if (rows.length === 0) return null;
  return { type: "table", content: rows };
}

function processBodyChild(child: Element, ctx: ImportContext, listState: ListState, out: unknown[]) {
  const local = localName(child);
  if (local === "p") {
    handleParagraphElement(child, ctx, listState, out);
  } else if (local === "tbl") {
    listState.flush();
    const table = convertTable(child, ctx);
    if (table) out.push(table);
  } else if (local === "sdt") {
    const content = findChild(child, "sdtContent");
    if (content) {
      for (const inner of Array.from(content.children)) processBodyChild(inner, ctx, listState, out);
    }
  }
  // else: sectPr, body-level bookmarks, custom XML, etc. — v2 scope, skipped gracefully
}

function convertBody(bodyEl: Element, ctx: ImportContext): unknown[] {
  const out: unknown[] = [];
  const listState = createListState(out);
  for (const child of Array.from(bodyEl.children)) {
    try {
      processBodyChild(child, ctx, listState, out);
    } catch (err) {
      // One malformed element shouldn't sink the whole document.
      console.warn("importDocx: skipping malformed body element", err);
    }
  }
  listState.flush();
  return out;
}
