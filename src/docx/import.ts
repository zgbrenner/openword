// DOCX import: reads a .docx (OOXML-in-a-zip) file with JSZip + DOMParser and
// builds an OpenWord ProseMirror document. This is a best-effort v1 converter,
// not a fidelity-preserving one: a *valid* file carrying a feature this
// importer doesn't model still opens, with the unmodeled shape dropped and its
// text kept. README.md's "About .docx files" section is the contract for what
// round-trips, what is dropped, and what changes on the way through.
//
// A file we genuinely cannot read is the opposite case and always throws a
// DocxImportError with a message written for the user. That distinction is
// load-bearing: the caller catches, shows the message, and keeps the document
// already on screen. Returning an empty document instead would put a blank
// page in front of the user under their file's name, and the next save would
// write that blank page back over the original.

import JSZip from "jszip";
import { docFromJSON, type LoadedDocument } from "../editor/document";
import type { CommentThread, CommentEntry } from "../editor/comments";
import type { SuggestionMetaStore } from "../editor/trackChanges";

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * A .docx that could not be read at all. `message` is shown verbatim to the
 * user by the caller's error dialog, so it says what is wrong with the file
 * in plain language rather than quoting a parser.
 */
export class DocxImportError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "DocxImportError";
  }
}

export async function importDocx(bytes: Uint8Array | ArrayBuffer): Promise<LoadedDocument> {
  // A .docx is a zip archive. Anything else — a PDF, a stray .doc, a
  // truncated download — fails here, before we have any content to lose.
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch (err) {
    throw new DocxImportError(
      "This file is not a readable Word document. A .docx file is a zip archive, and this one could not be opened as one — it may be damaged, or it may not be a .docx file at all.",
      { cause: err },
    );
  }

  try {
    const documentFile = zip.file("word/document.xml");
    if (!documentFile) {
      throw new DocxImportError(
        "This Word document is missing the part that holds its text (word/document.xml), so there is nothing to open. The file is incomplete or damaged.",
      );
    }
    const documentXml = await documentFile.async("string");

    const relsFile = zip.file("word/_rels/document.xml.rels");
    const relsXml = relsFile ? await relsFile.async("string") : undefined;
    const rels = parseRelationships(relsXml);

    const numberingFile = zip.file("word/numbering.xml");
    const numberingXml = numberingFile ? await numberingFile.async("string") : undefined;
    const numberingDefs = parseNumbering(numberingXml);

    const stylesFile = zip.file("word/styles.xml");
    const stylesXml = stylesFile ? await stylesFile.async("string") : undefined;
    const styleDefs = parseStyles(stylesXml);

    const media = await loadMedia(zip, rels);

    const commentsFile = zip.file("word/comments.xml");
    const commentsXml = commentsFile ? await commentsFile.async("string") : undefined;
    const commentsExtendedFile = zip.file("word/commentsExtended.xml");
    const commentsExtendedXml = commentsExtendedFile ? await commentsExtendedFile.async("string") : undefined;
    const { threads: comments, numericToThreadId } = parseComments(commentsXml, commentsExtendedXml);

    // Track changes: w:ins/w:del only carry an id/author/date on the XML
    // element itself (no side-store there, unlike our PM schema) — resolve
    // each distinct (kind, w:id, author, w:date) combination to one fresh PM
    // suggestion id, and collect the author/date into a SuggestionMetaStore
    // as we go, mirroring src/editor/trackChanges.ts's id-keyed side-store.
    const suggestionMeta: SuggestionMetaStore = {};
    const suggestionIdMap = new Map<string, number>();
    let nextSuggestionId = 1;
    const resolveSuggestionId = (kind: "insertion" | "deletion", wId: string, author: string, dateStr: string): number => {
      const key = `${kind}|${wId}|${author}|${dateStr}`;
      let id = suggestionIdMap.get(key);
      if (id === undefined) {
        id = nextSuggestionId++;
        suggestionIdMap.set(key, id);
        suggestionMeta[String(id)] = { author: author || "Unknown", date: parseOoxmlDate(dateStr) };
      }
      return id;
    };

    const xmlDoc = parseXmlPart(documentXml);
    if (!xmlDoc) {
      throw new DocxImportError(
        "The part of this Word document that holds its text (word/document.xml) is not valid XML, so it cannot be read. The file is damaged.",
      );
    }
    const bodyEl = findChild(xmlDoc.documentElement, "body");
    if (!bodyEl) {
      throw new DocxImportError(
        "The part of this Word document that holds its text (word/document.xml) has no document body in it, so there is nothing to open. The file is damaged, or it was written by a program OpenWord does not understand.",
      );
    }

    const ctx: ImportContext = {
      rels,
      media,
      numberingDefs,
      styleDefs,
      commentThreadIdByNumericId: numericToThreadId,
      resolveSuggestionId,
    };
    const content = convertBody(bodyEl, ctx);
    // A body holding no paragraphs or tables is a legitimate empty Word
    // document, and an empty paragraph is its faithful representation. This is
    // not a fallback for a failed conversion: every <w:p> that is read
    // produces at least one block, so text cannot go missing here.
    if (content.length === 0) content.push({ type: "paragraph" });

    let doc: LoadedDocument["doc"];
    try {
      doc = docFromJSON({ type: "doc", content });
    } catch (err) {
      throw new DocxImportError(
        "OpenWord read this Word document but could not turn it into an editable document. This is a bug in OpenWord's Word converter, not damage to your file — the file has been left untouched.",
        { cause: err },
      );
    }

    return { doc, comments, suggestionMeta };
  } catch (err) {
    // Everything above either produced the whole document or explained why it
    // could not. Anything unexpected that lands here (an unreadable zip entry,
    // a decompression failure) is still a file we cannot open, so it is
    // reported rather than swallowed: handing back an empty document would
    // show the user a blank page under their file's name and let the next
    // save overwrite the original with it.
    if (err instanceof DocxImportError) throw err;
    throw new DocxImportError(
      `OpenWord could not read this Word document. The file may be damaged. (${err instanceof Error ? err.message : String(err)})`,
      { cause: err },
    );
  }
}

/**
 * Parses one XML part of the package. DOMParser does not throw on malformed
 * XML — it returns a document containing a <parsererror> element instead — so
 * well-formedness has to be checked explicitly. Returns null when the input is
 * not well-formed XML; callers decide whether that part is fatal (the main
 * document) or merely degrades the import (numbering, styles, comments).
 */
function parseXmlPart(xml: string): Document | null {
  let parsed: Document;
  try {
    parsed = new DOMParser().parseFromString(xml, "application/xml");
  } catch {
    return null; // non-conforming DOMParser implementations throw instead
  }
  if (parsed.getElementsByTagName("parsererror").length > 0) return null;
  const root = parsed.documentElement;
  if (!root || localName(root) === "parsererror") return null;
  return parsed;
}

function parseOoxmlDate(dateStr: string | null | undefined): number {
  if (!dateStr) return Date.now();
  const t = Date.parse(dateStr);
  return Number.isFinite(t) ? t : Date.now();
}

function genId(prefix: string): string {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${random}`;
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
  styleDefs: Map<string, StyleDef>;
  commentThreadIdByNumericId: Map<number, string>; // w:comment/@w:id -> reconstructed CommentThread.id
  resolveSuggestionId: (kind: "insertion" | "deletion", wId: string, author: string, dateStr: string) => number;
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

// Every parser below reads a *secondary* part. None of them carries body text,
// so a missing or malformed one costs presentation (a link's target, a list's
// numbering format, a comment thread) but never the document's words — which
// is why they degrade instead of throwing the way the main document part does.
// They do say so on the console rather than failing silently.

function parseRelationships(relsXml: string | undefined): Map<string, RelInfo> {
  const map = new Map<string, RelInfo>();
  if (!relsXml) return map;
  try {
    const doc = parseXmlPart(relsXml);
    if (!doc) {
      console.warn("importDocx: word/_rels/document.xml.rels is not valid XML; hyperlink targets and images will be missing");
      return map;
    }
    for (const rel of Array.from(doc.getElementsByTagName("Relationship"))) {
      const id = rel.getAttribute("Id");
      const target = rel.getAttribute("Target");
      const type = rel.getAttribute("Type") || "";
      if (id && target) map.set(id, { target, type });
    }
  } catch (err) {
    console.warn("importDocx: could not read the relationships part; hyperlink targets and images will be missing", err);
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
    } catch (err) {
      // Unreadable media part: skip this one image and keep the rest of the
      // import going. The document's text is unaffected, so refusing to open
      // the file over one bad image would lose far more than it saves.
      console.warn(`importDocx: could not read the image at ${path}; it will be missing from the document`, err);
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
    const doc = parseXmlPart(numberingXml);
    if (!doc) {
      console.warn("importDocx: word/numbering.xml is not valid XML; numbered lists will import as bullets");
      return result;
    }
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
  } catch (err) {
    // Degrade to "no numbering info": lists still import, as bullets.
    console.warn("importDocx: could not read word/numbering.xml; numbered lists will import as bullets", err);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Styles (word/styles.xml) — only as much as numbering resolution needs: a
// paragraph style can declare its own w:numPr, and styles can chain via
// w:basedOn. A paragraph with no direct w:numPr on itself still needs to be
// recognized as a list item when its w:pStyle (or an ancestor in the
// w:basedOn chain) carries one — direct w:numPr on the paragraph always
// wins per OOXML precedence; this is purely the fallback for when it's
// absent. Character/table/numbering styles are irrelevant here and skipped.
// ---------------------------------------------------------------------------

interface StyleDef {
  basedOn: string | null;
  numId: string | null;
  ilvl: number;
}

function parseStyles(stylesXml: string | undefined): Map<string, StyleDef> {
  const result = new Map<string, StyleDef>();
  if (!stylesXml) return result;
  try {
    const doc = parseXmlPart(stylesXml);
    if (!doc) {
      console.warn("importDocx: word/styles.xml is not valid XML; list numbering inherited from a paragraph style will be missing");
      return result;
    }
    for (const styleEl of findChildren(doc.documentElement, "style")) {
      if (styleEl.getAttribute("w:type") !== "paragraph") continue;
      const styleId = styleEl.getAttribute("w:styleId");
      if (!styleId) continue;
      const pPr = findChild(styleEl, "pPr");
      const basedOn = findChild(styleEl, "basedOn")?.getAttribute("w:val") || null;
      const numPr = findChild(pPr, "numPr");
      const numId = numPr ? findChild(numPr, "numId")?.getAttribute("w:val") || null : null;
      const ilvl = numPr ? Math.max(0, parseInt(findChild(numPr, "ilvl")?.getAttribute("w:val") || "0", 10) || 0) : 0;
      result.set(styleId, { basedOn, numId, ilvl });
    }
  } catch (err) {
    // Degrade to "no style-level numbering info"; direct w:numPr still works.
    console.warn("importDocx: could not read word/styles.xml; list numbering inherited from a paragraph style will be missing", err);
  }
  return result;
}

/** Walks a style's w:basedOn chain for the nearest w:numPr, since a style itself might not define one directly. */
function resolveStyleNumPr(styleId: string | null, styles: Map<string, StyleDef>): { numId: string; ilvl: number } | null {
  let current = styleId;
  const seen = new Set<string>();
  while (current && !seen.has(current)) {
    seen.add(current); // cycle guard against malformed styles.xml (basedOn loops)
    const def = styles.get(current);
    if (!def) return null;
    if (def.numId) return { numId: def.numId, ilvl: def.ilvl };
    current = def.basedOn;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Comments (word/comments.xml + word/commentsExtended.xml)
//
// A plain (unthreaded) comment is one <w:comment> with no reply structure —
// the common case, including every comment.xml Word itself writes when
// there are no replies. Reply threading is a *second*, optional part
// (commentsExtended.xml, using w15:paraId/w15:paraIdParent) that links
// <w:comment> elements to each other via the w14:paraId Word stamps on each
// comment body's last paragraph — there's no parent-id on <w:comment>
// itself. We reconstruct that graph, then flatten each root + its
// descendants into one CommentThread (entries in comments.xml order),
// falling back to "every comment is its own thread" when commentsExtended
// is absent/malformed or a comment has no paraId to key off of.
// ---------------------------------------------------------------------------

interface CommentDef {
  id: number;
  author: string;
  date: number;
  text: string;
  paraId: string | null;
}

function parseComments(
  commentsXml: string | undefined,
  commentsExtendedXml: string | undefined,
): { threads: CommentThread[]; numericToThreadId: Map<number, string> } {
  const numericToThreadId = new Map<number, string>();
  if (!commentsXml) return { threads: [], numericToThreadId };
  try {
    const doc = parseXmlPart(commentsXml);
    if (!doc) {
      console.warn("importDocx: word/comments.xml is not valid XML; the document will open without its comments");
      return { threads: [], numericToThreadId };
    }
    const root = doc.documentElement;

    const defs = new Map<number, CommentDef>();
    const order: number[] = [];
    for (const commentEl of findChildren(root, "comment")) {
      const idRaw = commentEl.getAttribute("w:id");
      if (idRaw === null) continue;
      const id = parseInt(idRaw, 10);
      if (!Number.isFinite(id)) continue;
      const author = commentEl.getAttribute("w:author") || "Unknown";
      const date = parseOoxmlDate(commentEl.getAttribute("w:date"));
      const paragraphs = findChildren(commentEl, "p");
      const text = paragraphs
        .map((p) => (p.textContent || "").trim())
        .join("\n")
        .trim();
      let paraId: string | null = null;
      for (let i = paragraphs.length - 1; i >= 0; i--) {
        const pid = paragraphs[i].getAttribute("w14:paraId");
        if (pid) {
          paraId = pid;
          break;
        }
      }
      defs.set(id, { id, author, date, text, paraId });
      order.push(id);
    }
    if (defs.size === 0) return { threads: [], numericToThreadId };

    const exByParaId = new Map<string, { parentParaId: string | null; done: boolean }>();
    if (commentsExtendedXml) {
      try {
        const exDoc = parseXmlPart(commentsExtendedXml);
        if (exDoc) {
          for (const ex of findChildren(exDoc.documentElement, "commentEx")) {
            const paraId = ex.getAttribute("w15:paraId");
            if (!paraId) continue;
            exByParaId.set(paraId, {
              parentParaId: ex.getAttribute("w15:paraIdParent") || null,
              done: ex.getAttribute("w15:done") === "1",
            });
          }
        } else {
          // Only the reply *threading* lives here — every comment itself is
          // still in comments.xml, so this falls back to flat comments below
          // rather than losing any of them.
          console.warn("importDocx: word/commentsExtended.xml is not valid XML; comment replies will import as separate comments");
        }
      } catch (err) {
        console.warn("importDocx: could not read word/commentsExtended.xml; comment replies will import as separate comments", err);
      }
    }

    const paraIdToCommentId = new Map<string, number>();
    for (const def of defs.values()) if (def.paraId) paraIdToCommentId.set(def.paraId, def.id);

    const parentOf = new Map<number, number | null>();
    const doneOf = new Map<number, boolean>();
    for (const def of defs.values()) {
      let parent: number | null = null;
      let done = false;
      if (def.paraId) {
        const ex = exByParaId.get(def.paraId);
        if (ex) {
          done = ex.done;
          if (ex.parentParaId) parent = paraIdToCommentId.get(ex.parentParaId) ?? null;
        }
      }
      parentOf.set(def.id, parent);
      doneOf.set(def.id, done);
    }

    const isDescendantOrSelf = (candidateId: number, rootId: number): boolean => {
      let current: number | null = candidateId;
      const seen = new Set<number>();
      while (current !== null) {
        if (current === rootId) return true;
        if (seen.has(current)) return false; // cycle guard against malformed threading data
        seen.add(current);
        current = parentOf.get(current) ?? null;
      }
      return false;
    };

    const threads: CommentThread[] = [];
    const visited = new Set<number>();
    for (const id of order) {
      if (parentOf.get(id)) continue; // has a parent: folded into its root's thread below
      if (visited.has(id)) continue;
      const memberIds = order.filter((candidateId) => isDescendantOrSelf(candidateId, id));
      for (const m of memberIds) visited.add(m);
      const threadId = genId("comment");
      const entries: CommentEntry[] = memberIds.map((mid) => {
        const def = defs.get(mid)!;
        return { id: genId("entry"), author: def.author, text: def.text, createdAt: def.date };
      });
      const resolved = memberIds.some((mid) => doneOf.get(mid));
      threads.push({ id: threadId, resolved, entries });
      for (const mid of memberIds) numericToThreadId.set(mid, threadId);
    }
    // Defensive: a reply whose parent id doesn't resolve to any known
    // comment (malformed threading data) still gets a thread of its own
    // rather than being silently dropped.
    for (const id of order) {
      if (visited.has(id)) continue;
      const def = defs.get(id)!;
      const threadId = genId("comment");
      threads.push({
        id: threadId,
        resolved: doneOf.get(id) || false,
        entries: [{ id: genId("entry"), author: def.author, text: def.text, createdAt: def.date }],
      });
      numericToThreadId.set(id, threadId);
      visited.add(id);
    }

    return { threads, numericToThreadId };
  } catch (err) {
    // Comments are an annotation on the text, not the text: opening the
    // document without them beats refusing to open it at all.
    console.warn("importDocx: could not read word/comments.xml; the document will open without its comments", err);
    return { threads: [], numericToThreadId: new Map() };
  }
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

function readNumPr(
  pPr: Element | null,
  defs: Map<string, NumDef>,
  styleNumPr: { numId: string; ilvl: number } | null,
): { level: number; kind: "bullet_list" | "ordered_list"; start: number } | null {
  const numPr = findChild(pPr, "numPr");
  let numId = numPr ? findChild(numPr, "numId")?.getAttribute("w:val") || null : null;
  let level = numPr ? Math.max(0, parseInt(findChild(numPr, "ilvl")?.getAttribute("w:val") || "0", 10) || 0) : 0;
  if (numPr && numId === "0") return null; // explicit "no numbering" override of an inherited style — direct numPr wins
  if (!numId) {
    // No direct w:numPr on the paragraph itself: fall back to whatever its
    // paragraph style (w:pStyle, walking w:basedOn) declares — see the note
    // above parseStyles/resolveStyleNumPr.
    if (!styleNumPr) return null;
    numId = styleNumPr.numId;
    level = styleNumPr.ilvl;
  }
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

  // w:commentRangeStart/End are siblings of w:r (and w:hyperlink) at the
  // paragraph level, not nested inside a run — this is a simple mutable
  // "currently open" stack, shared across the whole `walk` recursion for
  // this paragraph (comment ranges never cross paragraph boundaries, so it
  // never needs to survive past this buildParagraphBlocks call).
  const activeCommentIds: string[] = [];

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
        case "r": {
          const runMarks =
            activeCommentIds.length > 0
              ? [...marks, ...activeCommentIds.map((id) => ({ type: "comment", attrs: { id } }))]
              : marks;
          processRun(child, runMarks);
          break;
        }
        case "hyperlink": {
          const rId = child.getAttribute("r:id");
          const anchor = child.getAttribute("w:anchor");
          let href: string | null = null;
          if (rId) href = ctx.rels.get(rId)?.target ?? null;
          else if (anchor) href = `#${anchor}`;
          walk(child, href ? [...marks, { type: "link", attrs: { href } }] : marks);
          break;
        }
        case "ins": {
          const id = ctx.resolveSuggestionId(
            "insertion",
            child.getAttribute("w:id") || "",
            child.getAttribute("w:author") || "",
            child.getAttribute("w:date") || "",
          );
          walk(child, [...marks, { type: "insertion", attrs: { id } }]);
          break;
        }
        case "del": {
          const id = ctx.resolveSuggestionId(
            "deletion",
            child.getAttribute("w:id") || "",
            child.getAttribute("w:author") || "",
            child.getAttribute("w:date") || "",
          );
          walk(child, [...marks, { type: "deletion", attrs: { id } }]);
          break;
        }
        case "moveFrom":
        case "moveTo": {
          // A tracked move is a tracked delete at the old location plus a
          // tracked insert at the new one. We don't model the pairing, but
          // the runs inside carry the text, so treating each half as the
          // corresponding suggestion keeps the words instead of dropping them.
          const kind = local === "moveTo" ? "insertion" : "deletion";
          const id = ctx.resolveSuggestionId(
            kind,
            child.getAttribute("w:id") || "",
            child.getAttribute("w:author") || "",
            child.getAttribute("w:date") || "",
          );
          walk(child, [...marks, { type: kind, attrs: { id } }]);
          break;
        }
        case "smartTag":
        case "customXml":
          // Non-tracked-change wrappers we don't model: drop the metadata,
          // keep the content. Skipping the element outright would take the
          // runs nested inside it with it.
          walk(child, marks);
          break;
        case "sdt": {
          const content = findChild(child, "sdtContent");
          if (content) walk(content, marks);
          break;
        }
        case "commentRangeStart": {
          const numId = parseInt(child.getAttribute("w:id") || "", 10);
          const threadId = Number.isFinite(numId) ? ctx.commentThreadIdByNumericId.get(numId) : undefined;
          if (threadId) activeCommentIds.push(threadId);
          break;
        }
        case "commentRangeEnd": {
          const numId = parseInt(child.getAttribute("w:id") || "", 10);
          const threadId = Number.isFinite(numId) ? ctx.commentThreadIdByNumericId.get(numId) : undefined;
          if (threadId) {
            const idx = activeCommentIds.lastIndexOf(threadId);
            if (idx !== -1) activeCommentIds.splice(idx, 1);
          }
          break;
        }
        default:
          break; // bookmarks, proofErr, and other unknown elements: skip
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
  const styleId = findChild(pPr, "pStyle")?.getAttribute("w:val") || null;
  const styleNumPr = resolveStyleNumPr(styleId, ctx.styleDefs);
  const numInfo = headingLevel === null ? readNumPr(pPr, ctx.numberingDefs, styleNumPr) : null;

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
      const collectCellContent = (parent: Element) => {
        for (const child of Array.from(parent.children)) {
          const local = localName(child);
          if (local === "p") {
            const pPr = findChild(child, "pPr");
            const cellParagraphAttrs = { align: readAlign(pPr), indent: readIndent(pPr), lineSpacing: readLineSpacing(pPr) };
            blocks.push(...buildParagraphBlocks(child, cellParagraphAttrs, readHeadingLevel(pPr), ctx));
          } else if (local === "tbl") {
            const nested = convertTable(child, ctx);
            if (nested) blocks.push(nested);
          } else if (local === "sdt") {
            // Content controls and custom-XML wrappers hold ordinary
            // paragraphs; recurse so a cell's text isn't lost with the wrapper.
            const content = findChild(child, "sdtContent");
            if (content) collectCellContent(content);
          } else if (local === "customXml") {
            collectCellContent(child);
          }
        }
      };
      collectCellContent(tc);
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
  } else if (local === "customXml") {
    // A custom-XML wrapper carries no formatting of its own but does wrap
    // real paragraphs and tables: recurse rather than dropping its contents.
    for (const inner of Array.from(child.children)) processBodyChild(inner, ctx, listState, out);
  }
  // else: sectPr, body-level bookmarks, proofing marks, etc. — these carry no
  // body text, so skipping them loses nothing the user typed.
}

function convertBody(bodyEl: Element, ctx: ImportContext): unknown[] {
  const out: unknown[] = [];
  const listState = createListState(out);
  for (const child of Array.from(bodyEl.children)) {
    try {
      processBodyChild(child, ctx, listState, out);
    } catch (err) {
      // Shapes this importer doesn't model are skipped quietly inside
      // processBodyChild — that is the best-effort contract and never lands
      // here. Reaching this point means converting real body content failed
      // outright, so the document we'd hand back would be missing text with
      // nothing on screen to say so, and the next save would write that
      // shortened document over the user's original. Refuse the file instead.
      throw new DocxImportError(
        `OpenWord could not read part of this Word document's contents (<${child.nodeName}>). Rather than open it with text missing, OpenWord has left the file closed.`,
        { cause: err },
      );
    }
  }
  listState.flush();
  return out;
}
