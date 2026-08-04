import type { JSONContent } from "@tiptap/core";
import { createBlankDocument, createId } from "./factory";
import {
  OPENWORD_SCHEMA_VERSION,
  cloneContent,
  createEmptyContent,
  type OpenWordDocument,
  type PageSetup,
} from "./model";
import { normalizeDocumentContent } from "./normalize";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isJsonContent(value: unknown): value is JSONContent {
  return isRecord(value) && typeof value.type === "string";
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readPageSetup(value: unknown, fallback: PageSetup): PageSetup {
  if (!isRecord(value)) return structuredClone(fallback);

  const margins = isRecord(value.marginsInches) ? value.marginsInches : {};
  const size =
    value.size === "a4" ||
    value.size === "legal" ||
    value.size === "custom" ||
    value.size === "letter"
      ? value.size
      : fallback.size;
  const orientation =
    value.orientation === "landscape" || value.orientation === "portrait"
      ? value.orientation
      : fallback.orientation;

  return {
    size,
    orientation,
    marginsInches: {
      top: numberOr(margins.top, fallback.marginsInches.top),
      right: numberOr(margins.right, fallback.marginsInches.right),
      bottom: numberOr(margins.bottom, fallback.marginsInches.bottom),
      left: numberOr(margins.left, fallback.marginsInches.left),
    },
    customWidthInches: numberOr(value.customWidthInches, fallback.customWidthInches ?? 8.5),
    customHeightInches: numberOr(value.customHeightInches, fallback.customHeightInches ?? 11),
  };
}

export function migrateDocument(input: unknown): OpenWordDocument {
  if (!isRecord(input)) {
    throw new Error("This file does not contain a valid OpenWord document.");
  }

  const title = typeof input.title === "string" && input.title.trim() ? input.title : "Untitled document";
  const base = createBlankDocument(title);
  const schemaVersion =
    typeof input.schemaVersion === "number" ? input.schemaVersion : 0;

  if (schemaVersion > OPENWORD_SCHEMA_VERSION) {
    throw new Error(
      `This document uses OpenWord schema ${schemaVersion}, but this app supports schema ${OPENWORD_SCHEMA_VERSION}.`,
    );
  }

  const contentResult = normalizeDocumentContent(
    isJsonContent(input.content) ? cloneContent(input.content) : createEmptyContent(),
  );
  const headerResult = normalizeDocumentContent(
    isJsonContent(input.header) ? cloneContent(input.header) : createEmptyContent(),
  );
  const footerResult = normalizeDocumentContent(
    isJsonContent(input.footer) ? cloneContent(input.footer) : createEmptyContent(),
  );
  const normalizationWarnings = [...new Set([
    ...contentResult.warnings,
    ...headerResult.warnings,
    ...footerResult.warnings,
  ])];

  const existingWarnings = Array.isArray(input.compatibilityWarnings)
    ? (input.compatibilityWarnings.filter(isRecord) as unknown as OpenWordDocument["compatibilityWarnings"])
    : [];
  const generatedWarnings = normalizationWarnings.map((message) => ({
    id: createId("warning"),
    code: "native-content-simplified",
    message,
    severity: "warning" as const,
    source: title,
  }));
  const compatibilityWarnings = [
    ...new Map(
      [...existingWarnings, ...generatedWarnings].map((warning) => [
        `${warning.code}\u0000${warning.message}`,
        warning,
      ]),
    ).values(),
  ];

  return {
    ...base,
    id: typeof input.id === "string" && input.id ? input.id : base.id,
    title,
    createdAt:
      typeof input.createdAt === "string" ? input.createdAt : base.createdAt,
    updatedAt:
      typeof input.updatedAt === "string" ? input.updatedAt : base.updatedAt,
    author: typeof input.author === "string" ? input.author : undefined,
    content: contentResult.content,
    header: headerResult.content,
    footer: footerResult.content,
    page: readPageSetup(input.page, base.page),
    comments: Array.isArray(input.comments)
      ? (input.comments.filter(isRecord) as unknown as OpenWordDocument["comments"])
      : [],
    settings: {
      defaultFontFamily:
        isRecord(input.settings) && typeof input.settings.defaultFontFamily === "string"
          ? input.settings.defaultFontFamily
          : base.settings.defaultFontFamily,
      defaultFontSizePt:
        isRecord(input.settings)
          ? numberOr(input.settings.defaultFontSizePt, base.settings.defaultFontSizePt)
          : base.settings.defaultFontSizePt,
      spellcheck:
        isRecord(input.settings) && typeof input.settings.spellcheck === "boolean"
          ? input.settings.spellcheck
          : base.settings.spellcheck,
      showFormattingMarks:
        isRecord(input.settings) && typeof input.settings.showFormattingMarks === "boolean"
          ? input.settings.showFormattingMarks
          : base.settings.showFormattingMarks,
    },
    source: isRecord(input.source)
      ? {
          format:
            input.source.format === "docx" ||
            input.source.format === "markdown" ||
            input.source.format === "html" ||
            input.source.format === "text"
              ? input.source.format
              : "openword",
          path: typeof input.source.path === "string" ? input.source.path : undefined,
          importedAt:
            typeof input.source.importedAt === "string" ? input.source.importedAt : undefined,
        }
      : undefined,
    compatibilityWarnings,
    schemaVersion: OPENWORD_SCHEMA_VERSION,
  };
}
