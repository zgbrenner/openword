import {
  OPENWORD_SCHEMA_VERSION,
  createEmptyContent,
  type OpenWordDocument,
  type PageSetup,
} from "./model";

const DEFAULT_PAGE: PageSetup = {
  size: "letter",
  orientation: "portrait",
  marginsInches: {
    top: 1,
    right: 1,
    bottom: 1,
    left: 1,
  },
};

let fallbackIdCounter = 0;

export function createId(prefix = "ow"): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  fallbackIdCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${fallbackIdCounter.toString(36)}`;
}

export function createBlankDocument(title = "Untitled document"): OpenWordDocument {
  const now = new Date().toISOString();

  return {
    schemaVersion: OPENWORD_SCHEMA_VERSION,
    id: createId("document"),
    title,
    createdAt: now,
    updatedAt: now,
    content: createEmptyContent(),
    header: createEmptyContent(),
    footer: createEmptyContent(),
    page: structuredClone(DEFAULT_PAGE),
    comments: [],
    settings: {
      defaultFontFamily: "Aptos",
      defaultFontSizePt: 11,
      spellcheck: true,
      showFormattingMarks: false,
    },
    compatibilityWarnings: [],
  };
}

export function touchDocument(document: OpenWordDocument): OpenWordDocument {
  return {
    ...document,
    updatedAt: new Date().toISOString(),
  };
}
