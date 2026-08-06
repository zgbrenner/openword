import type {
  PageMarginPreset,
  PageOrientation,
  PagePaperSize,
  ParagraphAlignment,
  WriterError,
  WriterEvent,
  WriterFormat,
} from "./protocol";

export class WriterState {
  ready = $state(false);
  dirty = $state(false);
  requiresSaveAs = $state(false);
  failure = $state<WriterError | null>(null);
  engineVersion = $state<string | null>(null);
  pageLabel = $state("");
  pageTooltip = $state("");
  wordCountLabel = $state("");
  bold = $state(false);
  italic = $state(false);
  underline = $state(false);
  alignment = $state<ParagraphAlignment>("left");
  bullets = $state(false);
  numbering = $state(false);
  pageStyleName = $state("Default Page Style");
  headerEnabled = $state(false);
  footerEnabled = $state(false);
  differentFirstPage = $state(false);
  differentOddEven = $state(false);
  orientation = $state<PageOrientation>("portrait");
  marginPreset = $state<PageMarginPreset>("normal");
  paperSize = $state<PagePaperSize>("letter");
  fileName = $state("Document1.docx");
  filePath = $state<string | null>(null);
  format = $state<WriterFormat>("docx");

  apply(event: WriterEvent): void {
    switch (event.event) {
      case "engine.ready":
        this.ready = true;
        this.failure = null;
        this.engineVersion = event.payload.version;
        break;
      case "document.changed":
        this.dirty = this.requiresSaveAs || event.payload.dirty;
        break;
      case "document.statistics":
        this.pageLabel = event.payload.pageLabel;
        this.pageTooltip = event.payload.pageTooltip;
        this.wordCountLabel = event.payload.wordCountLabel;
        break;
      case "selection.formatting":
        this.bold = event.payload.bold;
        this.italic = event.payload.italic;
        this.underline = event.payload.underline;
        break;
      case "selection.paragraph":
        this.alignment = event.payload.alignment;
        this.bullets = event.payload.bullets;
        this.numbering = event.payload.numbering;
        break;
      case "selection.pageStyle":
        this.pageStyleName = event.payload.pageStyleName;
        this.headerEnabled = event.payload.headerEnabled;
        this.footerEnabled = event.payload.footerEnabled;
        this.differentFirstPage = event.payload.differentFirstPage;
        this.differentOddEven = event.payload.differentOddEven;
        this.orientation = event.payload.orientation;
        this.marginPreset = event.payload.marginPreset;
        this.paperSize = event.payload.paperSize;
        break;
      case "engine.failure":
        this.ready = false;
        this.failure = event.payload;
        break;
    }
  }

  setDocument(path: string | null, fileName: string, format: WriterFormat): void {
    this.filePath = path;
    this.fileName = fileName;
    this.format = format;
    this.requiresSaveAs = path === null && fileName !== "Document1.docx";
    this.dirty = this.requiresSaveAs;
  }

  setStartupFailure(error: unknown): void {
    this.ready = false;
    this.failure = {
      code: "ENGINE_UNAVAILABLE",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}
