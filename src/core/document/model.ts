import type { JSONContent } from "@tiptap/core";

export const OPENWORD_SCHEMA_VERSION = 1 as const;

export type PageSize = "letter" | "a4" | "legal" | "custom";
export type PageOrientation = "portrait" | "landscape";
export type LayoutMode = "print" | "web";
export type SidebarKind = "navigation" | "review";
export type FileFormat = "openword" | "docx" | "markdown" | "html" | "text" | "pdf";

export interface PageMargins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface PageSetup {
  size: PageSize;
  orientation: PageOrientation;
  marginsInches: PageMargins;
  customWidthInches?: number;
  customHeightInches?: number;
}

export interface DocumentSettings {
  defaultFontFamily: string;
  defaultFontSizePt: number;
  spellcheck: boolean;
  showFormattingMarks: boolean;
}

export interface DocumentSource {
  format: Exclude<FileFormat, "pdf">;
  path?: string;
  importedAt?: string;
}

export type CompatibilityWarningSeverity = "info" | "warning";

export interface CompatibilityWarning {
  id: string;
  code: string;
  message: string;
  severity: CompatibilityWarningSeverity;
  source?: string;
}

export interface CommentReply {
  id: string;
  author: string;
  body: string;
  createdAt: string;
}

export interface CommentThread {
  id: string;
  author: string;
  body: string;
  createdAt: string;
  resolvedAt?: string;
  replies: CommentReply[];
}

export interface OpenWordDocument {
  schemaVersion: typeof OPENWORD_SCHEMA_VERSION;
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  author?: string;
  content: JSONContent;
  header: JSONContent;
  footer: JSONContent;
  page: PageSetup;
  comments: CommentThread[];
  settings: DocumentSettings;
  source?: DocumentSource;
  compatibilityWarnings: CompatibilityWarning[];
}

export interface FileDescriptor {
  name: string;
  format: Exclude<FileFormat, "pdf">;
  path?: string;
}

export interface OpenDocumentTab {
  id: string;
  document: OpenWordDocument;
  file?: FileDescriptor;
  dirty: boolean;
  lastSavedAt?: string;
}

export const EMPTY_DOC_CONTENT: JSONContent = {
  type: "doc",
  content: [{ type: "paragraph" }],
};

export function cloneContent(content: JSONContent): JSONContent {
  return JSON.parse(JSON.stringify(content)) as JSONContent;
}

export function createEmptyContent(): JSONContent {
  return cloneContent(EMPTY_DOC_CONTENT);
}
