import type { OpenWordDocument } from "../document/model";

export interface ImportResult {
  document: OpenWordDocument;
  warnings: string[];
}

export interface ExportResult<T> {
  data: T;
  warnings: string[];
}
