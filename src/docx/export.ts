// DOCX export: walks an OpenWord ProseMirror document and builds an equivalent
// .docx (OOXML) file using the `docx` package. This is a best-effort v1
// converter, not a lossless round-trip: saving rebuilds the whole file from
// what the editor models, so anything it doesn't model is gone rather than
// carried through. README.md's "About .docx files" section is the contract for
// what round-trips, what is dropped, and what changes on the way through.
//
// What this must never do is finish quietly with a file that isn't the
// document. A .docx written here replaces the user's original — the staged
// write removes its backup once we report success — so an empty or
// structurally broken result throws a DocxExportError instead of being
// returned. Individual unrepresentable *pieces* (see the notes further down)
// are still dropped, which is the documented best-effort behaviour.

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  ImageRun,
  ExternalHyperlink,
  Table,
  TableRow,
  TableCell,
  HeadingLevel,
  AlignmentType,
  LevelFormat,
  LineRuleType,
  UnderlineType,
  HighlightColor,
  PageBreak,
  WidthType,
  BorderStyle,
  CommentRangeStart,
  CommentRangeEnd,
  CommentReference,
  InsertedTextRun,
  DeletedTextRun,
  type IParagraphOptions,
  type IRunStylePropertiesOptions,
  type ILevelsOptions,
  type ISpacingProperties,
  type ITableBordersOptions,
  type ParagraphChild,
  type ICommentOptions,
} from "docx";
import type { Node as PMNode, Mark } from "prosemirror-model";
import { findCommentAnchors, type CommentThread } from "../editor/comments";
import type { SuggestionMetaStore } from "../editor/trackChanges";

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Thrown when the .docx we would have written is not a usable stand-in for the
 * document. `message` is shown verbatim to the user by the caller's error
 * dialog, and the caller leaves the file on disk untouched.
 */
export class DocxExportError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "DocxExportError";
  }
}

/** Local file header signature every zip — and so every .docx — begins with. */
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];

export async function exportDocx(
  doc: PMNode,
  comments: CommentThread[] = [],
  suggestionMeta: SuggestionMetaStore = {},
): Promise<Blob> {
  // Per-call mutable state for numbering (ordered lists get their own
  // numbering "reference" so independent lists can each start at their own
  // number and nest correctly). Kept local to avoid any shared module state
  // across concurrent exports.
  const numberingConfigs: { reference: string; levels: readonly ILevelsOptions[] }[] = [];
  let orderedListCounter = 0;

  // ---------------------------------------------------------------------
  // Comments: assign each thread that actually anchors somewhere in the doc
  // a sequential OOXML numeric id (w:comment/@w:id, shared with
  // w:commentRangeStart/End/w:commentReference), and build the comments.xml
  // entries up front. Replies use the `docx` package's native `parentId`
  // threading (it auto-generates word/commentsExtended.xml + the w14:paraId
  // plumbing) rather than us hand-rolling that — real Word itself only ever
  // anchors ONE commentRangeStart/End/commentReference triple per thread (at
  // the root comment's id); replies live purely in comments.xml + the
  // threading part, with no separate anchor of their own. Threads with no
  // anchor left in the doc (stale data) are dropped — documented v1
  // simplification, not a silent bug: there is nothing left to point them at.
  const commentAnchors = findCommentAnchors(doc);
  const anchorCountByThread = new Map<string, number>();
  for (const a of commentAnchors) anchorCountByThread.set(a.threadId, (anchorCountByThread.get(a.threadId) ?? 0) + 1);
  const remainingAnchorsByThread = new Map(anchorCountByThread);

  const commentNumericId = new Map<string, number>();
  const commentEntries: ICommentOptions[] = [];
  let nextCommentNumericId = 0;
  for (const thread of comments) {
    if (!anchorCountByThread.has(thread.id) || thread.entries.length === 0) continue;
    const [first, ...replies] = thread.entries;
    const rootId = nextCommentNumericId++;
    commentNumericId.set(thread.id, rootId);
    commentEntries.push({
      id: rootId,
      author: first.author || "Unknown",
      initials: authorInitials(first.author),
      date: new Date(first.createdAt),
      resolved: thread.resolved,
      children: textToParagraphs(first.text),
    });
    for (const reply of replies) {
      commentEntries.push({
        id: nextCommentNumericId++,
        author: reply.author || "Unknown",
        initials: authorInitials(reply.author),
        date: new Date(reply.createdAt),
        parentId: rootId,
        resolved: thread.resolved,
        children: textToParagraphs(reply.text),
      });
    }
  }

  // ---------------------------------------------------------------------
  // Track changes: insertion/deletion marks only carry a bare suggestion id
  // (author/date live in `suggestionMeta`, keyed by String(id) — same
  // lookup convention as src/editor/trackChanges.ts). Map each raw mark id
  // to a stable OOXML numeric id (w:ins/w:del share Word's id space) so
  // runs split by formatting boundaries still read as the same edit.
  const trackNumericId = new Map<string, number>();
  let nextTrackNumericId = 1;
  function numericTrackId(rawId: unknown): number {
    const key = String(rawId);
    let id = trackNumericId.get(key);
    if (id === undefined) {
      id = nextTrackNumericId++;
      trackNumericId.set(key, id);
    }
    return id;
  }
  function trackChangeMeta(rawId: unknown): { author: string; date: string } {
    const meta = suggestionMeta[String(rawId)];
    return {
      author: meta?.author || "Unknown",
      date: (meta && Number.isFinite(meta.date) ? new Date(meta.date) : new Date()).toISOString(),
    };
  }

  function convertOrderedList(node: PMNode, depth: number): (Paragraph | Table)[] {
    orderedListCounter += 1;
    const reference = `ow-ordered-${orderedListCounter}`;
    const startAt =
      typeof node.attrs.order === "number" && Number.isFinite(node.attrs.order) && node.attrs.order > 0
        ? Math.round(node.attrs.order)
        : 1;
    numberingConfigs.push({ reference, levels: buildOrderedLevels(startAt, depth) });
    const out: (Paragraph | Table)[] = [];
    node.forEach((item) => {
      if (item.type.name !== "list_item") return;
      out.push(...convertListItem(item, depth, { kind: "ordered", reference, level: Math.min(depth, 8) }));
    });
    return out;
  }

  function convertBulletList(node: PMNode, depth: number): (Paragraph | Table)[] {
    const out: (Paragraph | Table)[] = [];
    node.forEach((item) => {
      if (item.type.name !== "list_item") return;
      out.push(...convertListItem(item, depth, { kind: "bullet", level: Math.min(depth, 8) }));
    });
    return out;
  }

  function convertListItem(item: PMNode, depth: number, marker: ListMarker): (Paragraph | Table)[] {
    const out: (Paragraph | Table)[] = [];
    let markerApplied = false;
    item.forEach((child) => {
      if (child.type.name === "bullet_list") {
        out.push(...convertBulletList(child, depth + 1));
        return;
      }
      if (child.type.name === "ordered_list") {
        out.push(...convertOrderedList(child, depth + 1));
        return;
      }
      if (!markerApplied && (child.type.name === "paragraph" || child.type.name === "heading")) {
        out.push(buildParagraph(child, child.type.name === "heading" ? child.attrs.level : undefined, marker));
        markerApplied = true;
        return;
      }
      out.push(...convertBlockNode(child, depth));
    });
    if (out.length === 0) {
      // Defensive: a list_item with no usable content still needs a marked
      // paragraph so the schema's list_item content (list_item+) is honored.
      out.push(buildMarkedEmptyParagraph(marker));
    }
    return out;
  }

  function convertTable(node: PMNode): Table | null {
    const rows: TableRow[] = [];
    node.forEach((rowNode) => {
      if (rowNode.type.name !== "table_row") return;
      const cells: TableCell[] = [];
      rowNode.forEach((cellNode) => {
        if (cellNode.type.name !== "table_cell" && cellNode.type.name !== "table_header") return;
        const cellChildren: (Paragraph | Table)[] = [];
        cellNode.forEach((child) => cellChildren.push(...convertBlockNode(child, 0)));
        if (cellChildren.length === 0) cellChildren.push(new Paragraph({}));
        const attrs = cellNode.attrs as { colspan?: number; rowspan?: number; colwidth?: number[] | null };
        const colspan = attrs.colspan && attrs.colspan > 1 ? attrs.colspan : undefined;
        const rowspan = attrs.rowspan && attrs.rowspan > 1 ? attrs.rowspan : undefined;
        const firstColWidth = attrs.colwidth && attrs.colwidth[0] ? attrs.colwidth[0] : undefined;
        cells.push(
          new TableCell({
            children: cellChildren,
            ...(colspan ? { columnSpan: colspan } : {}),
            ...(rowspan ? { rowSpan: rowspan } : {}),
            ...(firstColWidth ? { width: { size: Math.round(firstColWidth * 15), type: WidthType.DXA } } : {}),
            ...(cellNode.type.name === "table_header" ? { shading: { fill: "F2F2F2" } } : {}),
          }),
        );
      });
      rows.push(new TableRow({ children: cells }));
    });
    if (rows.length === 0) return null;
    return new Table({ rows, borders: DEFAULT_TABLE_BORDERS, width: { size: 100, type: WidthType.PERCENTAGE } });
  }

  function convertBlockNode(node: PMNode, depth: number): (Paragraph | Table)[] {
    switch (node.type.name) {
      case "paragraph":
        return [buildParagraph(node)];
      case "heading":
        return [buildParagraph(node, node.attrs.level)];
      case "page_break":
        return [new Paragraph({ children: [new PageBreak()] })];
      case "bullet_list":
        return convertBulletList(node, depth);
      case "ordered_list":
        return convertOrderedList(node, depth);
      case "table": {
        const table = convertTable(node);
        return table ? [table] : [];
      }
      default:
        // Unknown/future block node type: degrade gracefully rather than
        // dropping content or throwing.
        if (node.inlineContent) return [buildParagraph(node)];
        if (node.content.childCount > 0) {
          const out: (Paragraph | Table)[] = [];
          node.forEach((child) => out.push(...convertBlockNode(child, depth)));
          return out;
        }
        return [];
    }
  }

  function buildParagraph(node: PMNode, headingLevel?: number, marker?: ListMarker): Paragraph {
    const attrs = node.attrs as { align?: string; indent?: number; lineSpacing?: string };
    const align = attrs.align ? ALIGN_MAP[attrs.align] : undefined;
    const spacing = lineSpacingToDocxSpacing(attrs.lineSpacing);
    const indentTwips = attrs.indent ? Math.round(attrs.indent) * INDENT_TWIPS_PER_LEVEL : 0;

    const options: IParagraphOptions = {
      ...(headingLevel ? { heading: HEADING_LEVELS[clamp(headingLevel, 1, 6) - 1] } : {}),
      ...(align ? { alignment: align } : {}),
      ...(spacing ? { spacing } : {}),
      ...(indentTwips ? { indent: { left: indentTwips } } : {}),
      ...(marker?.kind === "bullet" ? { bullet: { level: marker.level } } : {}),
      ...(marker?.kind === "ordered" ? { numbering: { reference: marker.reference, level: marker.level } } : {}),
      children: inlineChildrenToDocx(node),
    };
    return new Paragraph(options);
  }

  function buildMarkedEmptyParagraph(marker: ListMarker): Paragraph {
    return new Paragraph({
      ...(marker.kind === "bullet" ? { bullet: { level: marker.level } } : {}),
      ...(marker.kind === "ordered" ? { numbering: { reference: marker.reference, level: marker.level } } : {}),
    });
  }

  type RunLike = TextRun | ImageRun | InsertedTextRun | DeletedTextRun;

  function buildRun(child: PMNode): RunLike | null {
    const deletionMark = child.marks.find((m) => m.type.name === "deletion");
    const insertionMark = child.marks.find((m) => m.type.name === "insertion");
    // insertion/deletion/modification mutually exclude each other on the PM
    // side (see the suggest-changes library's schema), so at most one of
    // these applies. `modification` (formatting-change suggestions) has no
    // OOXML rendering here — see the note above `runPropsFromMarks` — so a
    // modified run just falls through to the plain-run branch below,
    // exported with its current (post-change) formatting.
    if (child.isText) {
      const text = child.text ?? "";
      const runProps = runPropsFromMarks(child.marks);
      if (deletionMark) {
        const meta = trackChangeMeta(deletionMark.attrs.id);
        return new DeletedTextRun({ ...runProps, text, id: numericTrackId(deletionMark.attrs.id), ...meta });
      }
      if (insertionMark) {
        const meta = trackChangeMeta(insertionMark.attrs.id);
        return new InsertedTextRun({ ...runProps, text, id: numericTrackId(insertionMark.attrs.id), ...meta });
      }
      return new TextRun({ text, ...runProps });
    }
    if (child.type.name === "image") {
      // Tracked-change wrapping of images isn't supported by the `docx`
      // package (InsertedTextRun/DeletedTextRun always wrap a TextRun) —
      // documented simplification: an inserted/deleted image round-trips
      // as a plain image, losing only the suggestion annotation.
      return imageNodeToRun(child);
    }
    if (child.type.name === "hard_break") {
      if (deletionMark) {
        const meta = trackChangeMeta(deletionMark.attrs.id);
        return new DeletedTextRun({ break: 1, id: numericTrackId(deletionMark.attrs.id), ...meta });
      }
      if (insertionMark) {
        const meta = trackChangeMeta(insertionMark.attrs.id);
        return new InsertedTextRun({ break: 1, id: numericTrackId(insertionMark.attrs.id), ...meta });
      }
      return new TextRun({ break: 1 });
    }
    return null;
  }

  function inlineChildrenToDocx(node: PMNode): ParagraphChild[] {
    const out: ParagraphChild[] = [];
    let pendingHref: string | null = null;
    let pendingRuns: RunLike[] = [];

    const flushLink = () => {
      if (pendingRuns.length === 0) return;
      if (pendingHref) {
        out.push(new ExternalHyperlink({ link: pendingHref, children: pendingRuns }));
      } else {
        out.push(...pendingRuns);
      }
      pendingHref = null;
      pendingRuns = [];
    };

    // Comment ranges sit at the paragraph level (siblings of runs/hyperlinks
    // in w:p), never nested inside a hyperlink, matching how Word itself
    // places them. `openOrder`/`openSet` track what's currently open within
    // this paragraph (marks never cross block boundaries, so every range
    // opened here is guaranteed to close before the paragraph ends);
    // `remainingAnchorsByThread`/`nextCommentNumericId`'s ledger is shared
    // module state so we know, document-wide, which occurrence is the last
    // one — that's where the single w:commentReference belongs.
    const openOrder: string[] = [];
    const openSet = new Set<string>();
    const openIsLast = new Map<string, boolean>();

    const openCommentRange = (threadId: string) => {
      const numId = commentNumericId.get(threadId);
      if (numId === undefined) return; // mark references a thread with no comments.xml entry: skip gracefully
      openOrder.push(threadId);
      openSet.add(threadId);
      const remaining = (remainingAnchorsByThread.get(threadId) ?? 1) - 1;
      remainingAnchorsByThread.set(threadId, remaining);
      openIsLast.set(threadId, remaining <= 0);
      out.push(new CommentRangeStart(numId));
    };
    const closeCommentRange = (threadId: string) => {
      const idx = openOrder.indexOf(threadId);
      if (idx !== -1) openOrder.splice(idx, 1);
      openSet.delete(threadId);
      const numId = commentNumericId.get(threadId);
      if (numId === undefined) return;
      out.push(new CommentRangeEnd(numId));
      if (openIsLast.get(threadId)) out.push(new TextRun({ children: [new CommentReference(numId)] }));
      openIsLast.delete(threadId);
    };

    node.forEach((child) => {
      const commentIds = new Set<string>();
      for (const m of child.marks) if (m.type.name === "comment") commentIds.add(String(m.attrs.id));

      const toClose = openOrder.filter((id) => !commentIds.has(id));
      const toOpen = [...commentIds].filter((id) => !openSet.has(id));
      if (toClose.length > 0 || toOpen.length > 0) {
        flushLink();
        for (let i = toClose.length - 1; i >= 0; i--) closeCommentRange(toClose[i]);
        for (const id of toOpen) openCommentRange(id);
      }

      const linkMark = child.marks.find((m) => m.type.name === "link");
      const href = linkMark && typeof linkMark.attrs.href === "string" ? linkMark.attrs.href : null;

      const run = buildRun(child);
      if (!run) return;

      if (href) {
        if (pendingRuns.length > 0 && pendingHref !== href) flushLink();
        pendingHref = href;
        pendingRuns.push(run);
      } else {
        flushLink();
        out.push(run);
      }
    });
    flushLink();
    // Force-close anything still open at paragraph end (comment marks never
    // cross block boundaries — see findCommentAnchors's docstring).
    for (let i = openOrder.length - 1; i >= 0; i--) closeCommentRange(openOrder[i]);
    return out;
  }

  const children: (Paragraph | Table)[] = [];
  doc.forEach((node) => children.push(...convertBlockNode(node, 0)));
  if (children.length === 0) {
    // A document with no blocks at all is a genuinely empty document, and a
    // .docx has to hold at least one paragraph, so this is the faithful
    // rendering of it. A document that *did* have blocks and still produced
    // nothing is a converter failure, not an empty document — writing that
    // out would replace the user's file with a blank one.
    if (doc.content.childCount > 0) {
      throw new DocxExportError(
        "OpenWord could not convert this document to Word format: the conversion produced an empty file. Nothing has been saved, so your document is unchanged — save it as an OpenWord (.owdoc) file to keep your work.",
      );
    }
    children.push(new Paragraph({}));
  }

  const file = new Document({
    sections: [{ children }],
    ...(numberingConfigs.length > 0 ? { numbering: { config: numberingConfigs } } : {}),
    ...(commentEntries.length > 0 ? { comments: { children: commentEntries } } : {}),
    ...(trackNumericId.size > 0 ? { features: { trackRevisions: true } } : {}),
  });

  let blob: Blob;
  try {
    blob = await Packer.toBlob(file);
  } catch (err) {
    throw new DocxExportError(
      `OpenWord could not write this document as a Word file. Nothing has been saved, so your document is unchanged. (${err instanceof Error ? err.message : String(err)})`,
      { cause: err },
    );
  }

  // Last line of defence before these bytes replace a file on disk: a .docx is
  // a zip, so it is never empty and always starts with the zip signature.
  // Anything else is not a document and must not be written over one.
  const header = new Uint8Array(await blob.slice(0, ZIP_MAGIC.length).arrayBuffer());
  if (blob.size === 0 || ZIP_MAGIC.some((byte, i) => header[i] !== byte)) {
    throw new DocxExportError(
      "OpenWord could not write this document as a Word file: the result was not a valid .docx. Nothing has been saved, so your document is unchanged — save it as an OpenWord (.owdoc) file to keep your work.",
    );
  }
  return blob;
}

// ---------------------------------------------------------------------------
// Comments — helpers for the comments.xml entries built in exportDocx above.
// ---------------------------------------------------------------------------

/** "Jane Doe" -> "JD", matching Word's own comment-bubble initials convention. */
function authorInitials(name: string): string | undefined {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return undefined;
  const initials = parts
    .slice(0, 3)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
  return initials || undefined;
}

/** A comment/reply's freeform text -> one Paragraph per line (comments.xml bodies are block content, not a bare string). */
function textToParagraphs(text: string): Paragraph[] {
  const lines = text.split("\n");
  if (lines.length === 0) return [new Paragraph({})];
  return lines.map((line) => new Paragraph({ children: [new TextRun({ text: line })] }));
}

// ---------------------------------------------------------------------------
// Marks -> run properties
//
// `comment`, `insertion`, and `deletion` are handled by the caller
// (inlineChildrenToDocx/buildRun above), not here. `modification` (a
// formatting-change suggestion — see trackChanges.ts / the suggest-changes
// library's schema) has no case below and is a deliberate simplification:
// OOXML's real representation of a tracked formatting change is
// `w:rPrChange` (the *previous* rPr nested inside the run's current rPr) —
// modeling that fully is a deep rabbit hole per the task brief. Since the
// run's other marks already reflect the *new* (suggested) formatting, a
// modified run just exports with that formatting applied normally, as if
// the suggestion had been accepted; only the "this was a suggested change"
// annotation itself is lost on export.
// ---------------------------------------------------------------------------

function runPropsFromMarks(marks: readonly Mark[]): IRunStylePropertiesOptions {
  const props: IRunStylePropertiesOptions = {};
  const patch: Record<string, unknown> = props;
  for (const mark of marks) {
    switch (mark.type.name) {
      case "bold":
        patch.bold = true;
        break;
      case "italic":
        patch.italics = true;
        break;
      case "underline":
        patch.underline = { type: UnderlineType.SINGLE };
        break;
      case "strike":
        patch.strike = true;
        break;
      case "superscript":
        patch.superScript = true;
        break;
      case "subscript":
        patch.subScript = true;
        break;
      case "textColor": {
        const hex = cssColorToHex(mark.attrs.color);
        if (hex) patch.color = hex;
        break;
      }
      case "highlight": {
        const highlight = nearestHighlightColor(mark.attrs.color);
        if (highlight) patch.highlight = highlight;
        break;
      }
      case "fontFamily": {
        if (typeof mark.attrs.family === "string" && mark.attrs.family.trim()) {
          patch.font = primaryFontName(mark.attrs.family);
        }
        break;
      }
      case "fontSize": {
        const halfPoints = cssFontSizeToHalfPoints(mark.attrs.size);
        if (halfPoints) patch.size = halfPoints;
        break;
      }
      // "link" is handled by the caller (grouped into an ExternalHyperlink).
      default:
        break;
    }
  }
  return props;
}

function primaryFontName(family: string): string {
  const first = family.split(",")[0]?.trim() ?? family.trim();
  return first.replace(/^["']|["']$/g, "");
}

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

function imageNodeToRun(node: PMNode): ImageRun | null {
  const attrs = node.attrs as { src?: string; alt?: string | null; title?: string | null; width?: unknown; height?: unknown };
  const decoded = decodeDataUrl(attrs.src);
  if (!decoded) {
    // e.g. an absolute filesystem path we can't read from this module. The
    // rest of the document still saves; only this image is dropped, which
    // README.md's "About .docx files" section documents.
    console.warn("exportDocx: an image could not be decoded and will be missing from the saved .docx");
    return null;
  }
  const type = mimeToDocxImageType(decoded.mimeType);
  if (!type) {
    // WebP/TIFF/SVG: OOXML's image part has no place for them here, so they
    // open but do not save — the documented one-way trip.
    console.warn(`exportDocx: ${decoded.mimeType} images cannot be written to .docx and will be missing from the saved file`);
    return null;
  }
  const sniffed = sniffImageSizePx(decoded.bytes);
  const width = parseLength(attrs.width) ?? sniffed?.width ?? 300;
  const height = parseLength(attrs.height) ?? sniffed?.height ?? 150;
  const name = (attrs.alt || attrs.title || "image").toString();
  return new ImageRun({
    type,
    data: decoded.bytes,
    transformation: { width, height },
    altText: { name, ...(attrs.title ? { title: attrs.title } : {}), ...(attrs.alt ? { description: attrs.alt } : {}) },
  });
}

function decodeDataUrl(src: string | null | undefined): { mimeType: string; bytes: Uint8Array } | null {
  if (!src) return null;
  const match = /^data:([^;,]+)(;charset=[^;,]+)?(;base64)?,(.*)$/is.exec(src.trim());
  if (!match) return null;
  const mimeType = match[1].toLowerCase();
  const isBase64 = Boolean(match[3]);
  const data = match[4];
  try {
    if (isBase64) {
      const binary = atob(data);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return { mimeType, bytes };
    }
    const decoded = decodeURIComponent(data);
    return { mimeType, bytes: new TextEncoder().encode(decoded) };
  } catch {
    return null;
  }
}

function mimeToDocxImageType(mime: string): "jpg" | "png" | "gif" | "bmp" | null {
  switch (mime) {
    case "image/png":
      return "png";
    case "image/jpeg":
    case "image/jpg":
      return "jpg";
    case "image/gif":
      return "gif";
    case "image/bmp":
    case "image/x-bmp":
      return "bmp";
    default:
      return null;
  }
}

function parseLength(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return Math.round(value);
  if (typeof value === "string") {
    const n = parseFloat(value);
    if (Number.isFinite(n) && n > 0) return Math.round(n);
  }
  return null;
}

/** Reads pixel dimensions straight out of common raster image headers (PNG/GIF/BMP/JPEG). */
function sniffImageSizePx(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length >= 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    const width = ((bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19]) >>> 0;
    const height = ((bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23]) >>> 0;
    if (width > 0 && height > 0) return { width, height };
  }
  if (bytes.length >= 10 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
    const width = bytes[6] | (bytes[7] << 8);
    const height = bytes[8] | (bytes[9] << 8);
    if (width > 0 && height > 0) return { width, height };
  }
  if (bytes.length >= 26 && bytes[0] === 0x42 && bytes[1] === 0x4d) {
    const width = (bytes[18] | (bytes[19] << 8) | (bytes[20] << 16) | (bytes[21] << 24)) >>> 0;
    const height = Math.abs(bytes[22] | (bytes[23] << 8) | (bytes[24] << 16) | (bytes[25] << 24));
    if (width > 0 && height > 0) return { width, height };
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset++;
        continue;
      }
      const marker = bytes[offset + 1];
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
        offset += 2;
        continue;
      }
      const segmentLength = (bytes[offset + 2] << 8) | bytes[offset + 3];
      const isSOF = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isSOF) {
        const height = (bytes[offset + 5] << 8) | bytes[offset + 6];
        const width = (bytes[offset + 7] << 8) | bytes[offset + 8];
        if (width > 0 && height > 0) return { width, height };
      }
      offset += 2 + segmentLength;
      if (segmentLength <= 0) break;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Lists
// ---------------------------------------------------------------------------

type ListMarker = { kind: "bullet"; level: number } | { kind: "ordered"; reference: string; level: number };

const ORDERED_FORMATS = [LevelFormat.DECIMAL, LevelFormat.LOWER_LETTER, LevelFormat.LOWER_ROMAN] as const;

function buildOrderedLevels(startAt: number, activeDepth: number): ILevelsOptions[] {
  const levels: ILevelsOptions[] = [];
  for (let level = 0; level <= 8; level++) {
    levels.push({
      level,
      format: ORDERED_FORMATS[level % ORDERED_FORMATS.length],
      text: `%${level + 1}.`,
      alignment: AlignmentType.LEFT,
      start: level === activeDepth ? startAt : 1,
      style: {
        paragraph: {
          indent: { left: 360 * (level + 1) + 360, hanging: 360 },
        },
      },
    });
  }
  return levels;
}

// ---------------------------------------------------------------------------
// Paragraph attribute mapping
// ---------------------------------------------------------------------------

const INDENT_TWIPS_PER_LEVEL = 360; // 0.25in per schema indent level, 1440 twips/in

const ALIGN_MAP: Record<string, (typeof AlignmentType)[keyof typeof AlignmentType]> = {
  left: AlignmentType.LEFT,
  center: AlignmentType.CENTER,
  right: AlignmentType.RIGHT,
  justify: AlignmentType.JUSTIFIED,
};

const HEADING_LEVELS = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
  HeadingLevel.HEADING_5,
  HeadingLevel.HEADING_6,
] as const;

function lineSpacingToDocxSpacing(lineSpacing: unknown): ISpacingProperties | undefined {
  if (typeof lineSpacing !== "string") return undefined;
  const value = parseFloat(lineSpacing);
  if (!Number.isFinite(value) || value <= 0 || Math.abs(value - 1) < 1e-9) return undefined;
  return { line: Math.round(value * 240), lineRule: LineRuleType.AUTO };
}

function cssFontSizeToHalfPoints(size: unknown): number | undefined {
  if (typeof size !== "string") return undefined;
  const match = /^(-?[\d.]+)\s*(pt|px|in|cm|mm|pc)?$/i.exec(size.trim());
  if (!match) return undefined;
  const value = parseFloat(match[1]);
  if (!Number.isFinite(value) || value <= 0) return undefined;
  const unit = (match[2] || "pt").toLowerCase();
  let points: number;
  switch (unit) {
    case "px":
      points = value * 0.75;
      break;
    case "in":
      points = value * 72;
      break;
    case "cm":
      points = value * (72 / 2.54);
      break;
    case "mm":
      points = value * (72 / 25.4);
      break;
    case "pc":
      points = value * 12;
      break;
    default:
      points = value;
  }
  const halfPoints = Math.round(points * 2);
  return halfPoints > 0 ? halfPoints : undefined;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

const DEFAULT_CELL_BORDER = { style: BorderStyle.SINGLE, size: 4, color: "999999" };
const DEFAULT_TABLE_BORDERS: ITableBordersOptions = {
  top: DEFAULT_CELL_BORDER,
  bottom: DEFAULT_CELL_BORDER,
  left: DEFAULT_CELL_BORDER,
  right: DEFAULT_CELL_BORDER,
  insideHorizontal: DEFAULT_CELL_BORDER,
  insideVertical: DEFAULT_CELL_BORDER,
};

// ---------------------------------------------------------------------------
// Color handling — our schema stores arbitrary CSS color strings, but OOXML's
// w:color/shading want hex and w:highlight only accepts a fixed named
// palette, so both need a real CSS-color parser rather than a lookup table.
// ---------------------------------------------------------------------------

function cssColorToHex(input: unknown): string | undefined {
  if (typeof input !== "string") return undefined;
  const rgb = parseCssColor(input);
  if (!rgb) return undefined;
  return rgb.map((c) => clampByte(c).toString(16).padStart(2, "0")).join("");
}

const HIGHLIGHT_RGB: [string, [number, number, number]][] = [
  [HighlightColor.BLACK, [0, 0, 0]],
  [HighlightColor.BLUE, [0, 0, 255]],
  [HighlightColor.CYAN, [0, 255, 255]],
  [HighlightColor.DARK_BLUE, [0, 0, 139]],
  [HighlightColor.DARK_CYAN, [0, 139, 139]],
  [HighlightColor.DARK_GRAY, [64, 64, 64]],
  [HighlightColor.DARK_GREEN, [0, 100, 0]],
  [HighlightColor.DARK_MAGENTA, [139, 0, 139]],
  [HighlightColor.DARK_RED, [139, 0, 0]],
  [HighlightColor.DARK_YELLOW, [128, 128, 0]],
  [HighlightColor.GREEN, [0, 255, 0]],
  [HighlightColor.LIGHT_GRAY, [211, 211, 211]],
  [HighlightColor.MAGENTA, [255, 0, 255]],
  [HighlightColor.RED, [255, 0, 0]],
  [HighlightColor.WHITE, [255, 255, 255]],
  [HighlightColor.YELLOW, [255, 255, 0]],
];

function nearestHighlightColor(input: unknown): (typeof HighlightColor)[keyof typeof HighlightColor] | undefined {
  if (typeof input !== "string") return undefined;
  const rgb = parseCssColor(input);
  if (!rgb) return undefined;
  let best: string | undefined;
  let bestDist = Infinity;
  for (const [name, [r, g, b]] of HIGHLIGHT_RGB) {
    const dist = (rgb[0] - r) ** 2 + (rgb[1] - g) ** 2 + (rgb[2] - b) ** 2;
    if (dist < bestDist) {
      bestDist = dist;
      best = name;
    }
  }
  return best as (typeof HighlightColor)[keyof typeof HighlightColor] | undefined;
}

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function parseCssColor(input: string): [number, number, number] | null {
  const value = input.trim().toLowerCase();
  let m = /^#([0-9a-f]{3})$/.exec(value);
  if (m) {
    const [r, g, b] = m[1].split("").map((c) => parseInt(c + c, 16));
    return [r, g, b];
  }
  m = /^#([0-9a-f]{6})$/.exec(value);
  if (m) {
    const n = m[1];
    return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)];
  }
  m = /^#([0-9a-f]{8})$/.exec(value);
  if (m) {
    const n = m[1];
    return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)];
  }
  m = /^rgba?\(\s*([\d.]+%?)\s*,\s*([\d.]+%?)\s*,\s*([\d.]+%?)\s*(?:,\s*[\d.]+\s*)?\)$/.exec(value);
  if (m) {
    const parseComponent = (s: string) => (s.endsWith("%") ? Math.round(parseFloat(s) * 2.55) : Math.round(parseFloat(s)));
    return [parseComponent(m[1]), parseComponent(m[2]), parseComponent(m[3])];
  }
  m = /^hsla?\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*(?:,\s*[\d.]+\s*)?\)$/.exec(value);
  if (m) {
    return hslToRgb(parseFloat(m[1]), parseFloat(m[2]) / 100, parseFloat(m[3]) / 100);
  }
  const named = CSS_NAMED_COLORS[value];
  if (named) {
    return [parseInt(named.slice(0, 2), 16), parseInt(named.slice(2, 4), 16), parseInt(named.slice(4, 6), 16)];
  }
  return null;
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const hue = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - c / 2;
  let [r, g, b] = [0, 0, 0];
  if (hue < 60) [r, g, b] = [c, x, 0];
  else if (hue < 120) [r, g, b] = [x, c, 0];
  else if (hue < 180) [r, g, b] = [0, c, x];
  else if (hue < 240) [r, g, b] = [0, x, c];
  else if (hue < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [clampByte((r + m) * 255), clampByte((g + m) * 255), clampByte((b + m) * 255)];
}

const CSS_NAMED_COLORS: Record<string, string> = {
  aliceblue: "f0f8ff", antiquewhite: "faebd7", aqua: "00ffff", aquamarine: "7fffd4", azure: "f0ffff",
  beige: "f5f5dc", bisque: "ffe4c4", black: "000000", blanchedalmond: "ffebcd", blue: "0000ff",
  blueviolet: "8a2be2", brown: "a52a2a", burlywood: "deb887", cadetblue: "5f9ea0", chartreuse: "7fff00",
  chocolate: "d2691e", coral: "ff7f50", cornflowerblue: "6495ed", cornsilk: "fff8dc", crimson: "dc143c",
  cyan: "00ffff", darkblue: "00008b", darkcyan: "008b8b", darkgoldenrod: "b8860b", darkgray: "a9a9a9",
  darkgreen: "006400", darkgrey: "a9a9a9", darkkhaki: "bdb76b", darkmagenta: "8b008b", darkolivegreen: "556b2f",
  darkorange: "ff8c00", darkorchid: "9932cc", darkred: "8b0000", darksalmon: "e9967a", darkseagreen: "8fbc8f",
  darkslateblue: "483d8b", darkslategray: "2f4f4f", darkslategrey: "2f4f4f", darkturquoise: "00ced1", darkviolet: "9400d3",
  deeppink: "ff1493", deepskyblue: "00bfff", dimgray: "696969", dimgrey: "696969", dodgerblue: "1e90ff",
  firebrick: "b22222", floralwhite: "fffaf0", forestgreen: "228b22", fuchsia: "ff00ff", gainsboro: "dcdcdc",
  ghostwhite: "f8f8ff", gold: "ffd700", goldenrod: "daa520", gray: "808080", green: "008000",
  greenyellow: "adff2f", grey: "808080", honeydew: "f0fff0", hotpink: "ff69b4", indianred: "cd5c5c",
  indigo: "4b0082", ivory: "fffff0", khaki: "f0e68c", lavender: "e6e6fa", lavenderblush: "fff0f5",
  lawngreen: "7cfc00", lemonchiffon: "fffacd", lightblue: "add8e6", lightcoral: "f08080", lightcyan: "e0ffff",
  lightgoldenrodyellow: "fafad2", lightgray: "d3d3d3", lightgreen: "90ee90", lightgrey: "d3d3d3", lightpink: "ffb6c1",
  lightsalmon: "ffa07a", lightseagreen: "20b2aa", lightskyblue: "87cefa", lightslategray: "778899", lightslategrey: "778899",
  lightsteelblue: "b0c4de", lightyellow: "ffffe0", lime: "00ff00", limegreen: "32cd32", linen: "faf0e6",
  magenta: "ff00ff", maroon: "800000", mediumaquamarine: "66cdaa", mediumblue: "0000cd", mediumorchid: "ba55d3",
  mediumpurple: "9370db", mediumseagreen: "3cb371", mediumslateblue: "7b68ee", mediumspringgreen: "00fa9a", mediumturquoise: "48d1cc",
  mediumvioletred: "c71585", midnightblue: "191970", mintcream: "f5fffa", mistyrose: "ffe4e1", moccasin: "ffe4b5",
  navajowhite: "ffdead", navy: "000080", oldlace: "fdf5e6", olive: "808000", olivedrab: "6b8e23",
  orange: "ffa500", orangered: "ff4500", orchid: "da70d6", palegoldenrod: "eee8aa", palegreen: "98fb98",
  paleturquoise: "afeeee", palevioletred: "db7093", papayawhip: "ffefd5", peachpuff: "ffdab9", peru: "cd853f",
  pink: "ffc0cb", plum: "dda0dd", powderblue: "b0e0e6", purple: "800080", rebeccapurple: "663399",
  red: "ff0000", rosybrown: "bc8f8f", royalblue: "4169e1", saddlebrown: "8b4513", salmon: "fa8072",
  sandybrown: "f4a460", seagreen: "2e8b57", seashell: "fff5ee", sienna: "a0522d", silver: "c0c0c0",
  skyblue: "87ceeb", slateblue: "6a5acd", slategray: "708090", slategrey: "708090", snow: "fffafa",
  springgreen: "00ff7f", steelblue: "4682b4", tan: "d2b48c", teal: "008080", thistle: "d8bfd8",
  tomato: "ff6347", turquoise: "40e0d0", violet: "ee82ee", wheat: "f5deb3", white: "ffffff",
  whitesmoke: "f5f5f5", yellow: "ffff00", yellowgreen: "9acd32",
};
