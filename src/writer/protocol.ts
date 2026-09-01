export type WriterFormat = "docx" | "odt";
export type ParagraphAlignment = "left" | "center" | "right" | "justify";

/**
 * Word-facing quick styles. The worker maps each key onto the corresponding
 * Writer paragraph style name and refuses anything outside this list.
 */
export type ParagraphQuickStyle =
  | "normal"
  | "title"
  | "subtitle"
  | "heading1"
  | "heading2"
  | "heading3"
  | "quote";
export type PageOrientation = "portrait" | "landscape";
export type PageMarginPreset = "normal" | "narrow" | "moderate" | "wide" | "custom";
export type PagePaperSize = "letter" | "a4" | "legal" | "custom";

export type WriterCommand =
  | { type: "format.toggleBold" }
  | { type: "format.toggleItalic" }
  | { type: "format.toggleUnderline" }
  | { type: "format.toggleStrikethrough" }
  | { type: "format.toggleSubscript" }
  | { type: "format.toggleSuperscript" }
  | { type: "format.clearFormatting" }
  | { type: "format.setFontFamily"; fontFamily: string }
  | { type: "format.setFontSize"; fontSize: number }
  | { type: "paragraph.applyStyle"; style: ParagraphQuickStyle }
  | { type: "view.setZoom"; percent: number }
  | { type: "history.undo" }
  | { type: "history.redo" }
  | { type: "paragraph.alignLeft" }
  | { type: "paragraph.alignCenter" }
  | { type: "paragraph.alignRight" }
  | { type: "paragraph.alignJustify" }
  | { type: "list.toggleBullets" }
  | { type: "list.toggleNumbering" }
  | { type: "insert.pageBreak" }
  | { type: "field.insertPageNumber" }
  | { type: "header.edit" }
  | { type: "footer.edit" }
  | { type: "header.setEnabled"; enabled: boolean }
  | { type: "footer.setEnabled"; enabled: boolean }
  | { type: "pageStyle.setDifferentFirstPage"; enabled: boolean }
  | { type: "pageStyle.setDifferentOddEven"; enabled: boolean }
  | { type: "pageStyle.setOrientation"; orientation: PageOrientation }
  | {
      type: "pageStyle.setMargins";
      preset: Exclude<PageMarginPreset, "custom">;
    }
  | {
      type: "pageStyle.setPaperSize";
      paperSize: Exclude<PagePaperSize, "custom">;
    }
  | { type: "review.toggleTrackChanges" }
  | { type: "review.previousChange" }
  | { type: "review.nextChange" }
  | { type: "review.acceptChange" }
  | { type: "review.rejectChange" }
  | { type: "review.acceptAllChanges" }
  | { type: "review.rejectAllChanges" };

export type WriterRequestMethod =
  | "engine.ping"
  | "document.new"
  | "document.open"
  | "document.save"
  | "document.snapshot"
  | "document.exportPdf"
  | "command.execute"
  | "search.find"
  | "search.replaceNext"
  | "search.replaceAll";

export interface WriterSearchOptions {
  query: string;
  matchCase: boolean;
  wholeWords: boolean;
  backwards?: boolean;
}

export interface WriterReplaceOptions extends WriterSearchOptions {
  replacement: string;
}

/** Result of a single find step; `wrapped` means the search passed the document edge. */
export interface WriterFindResult {
  found: boolean;
  wrapped: boolean;
}

export interface WriterReplaceNextResult extends WriterFindResult {
  replaced: boolean;
}

export interface WriterReplaceAllResult {
  replaced: number;
}

export interface WriterRequest {
  kind: "request";
  id: string;
  method: WriterRequestMethod;
  params?: unknown;
}

export interface WriterError {
  code:
    | "ENGINE_UNAVAILABLE"
    | "TIMEOUT"
    | "INVALID_REQUEST"
    | "OPEN_FAILED"
    | "SAVE_FAILED"
    | "COMMAND_FAILED";
  message: string;
  detail?: string;
}

export type WriterResponse =
  | { kind: "response"; id: string; ok: true; result?: unknown }
  | { kind: "response"; id: string; ok: false; error: WriterError };

export type WriterEvent =
  | { kind: "event"; event: "engine.ready"; payload: { version: string } }
  | { kind: "event"; event: "document.changed"; payload: { dirty: boolean } }
  | {
      kind: "event";
      event: "document.statistics";
      payload: { pageLabel: string; pageTooltip: string; wordCountLabel: string };
    }
  | {
      kind: "event";
      event: "review.state";
      payload: { trackChangesEnabled: boolean };
    }
  | {
      kind: "event";
      event: "selection.formatting";
      payload: {
        bold: boolean;
        italic: boolean;
        underline: boolean;
        strikethrough: boolean;
        subscript: boolean;
        superscript: boolean;
        fontFamily: string;
        fontSize: number | null;
      };
    }
  | {
      kind: "event";
      event: "selection.paragraph";
      payload: {
        alignment: ParagraphAlignment;
        bullets: boolean;
        numbering: boolean;
        styleName: string;
      };
    }
  | { kind: "event"; event: "view.zoom"; payload: { percent: number } }
  | {
      kind: "event";
      event: "selection.pageStyle";
      payload: {
        pageStyleName: string;
        headerEnabled: boolean;
        footerEnabled: boolean;
        differentFirstPage: boolean;
        differentOddEven: boolean;
        orientation: PageOrientation;
        marginPreset: PageMarginPreset;
        paperSize: PagePaperSize;
      };
    }
  | { kind: "event"; event: "engine.failure"; payload: WriterError };

export function isWriterResponse(value: unknown): value is WriterResponse {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  if (candidate.kind !== "response" || typeof candidate.id !== "string" || typeof candidate.ok !== "boolean") {
    return false;
  }
  if (candidate.ok) return true;
  const error = candidate.error;
  return (
    !!error &&
    typeof error === "object" &&
    typeof (error as Record<string, unknown>).code === "string" &&
    typeof (error as Record<string, unknown>).message === "string"
  );
}

export function isWriterEvent(value: unknown): value is WriterEvent {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return candidate.kind === "event" && typeof candidate.event === "string" && "payload" in candidate;
}
