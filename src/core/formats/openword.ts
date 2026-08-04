import { migrateDocument } from "../document/migrations";
import type { OpenWordDocument } from "../document/model";
import type { ExportResult, ImportResult } from "./types";

const decoder = new TextDecoder("utf-8", { fatal: true });
const encoder = new TextEncoder();

export function importOpenWord(bytes: Uint8Array, filename = "document.openword"): ImportResult {
  try {
    const document = migrateDocument(JSON.parse(decoder.decode(bytes)) as unknown);
    document.source = { format: "openword", importedAt: new Date().toISOString() };
    return {
      document,
      warnings: document.compatibilityWarnings.map((warning) => warning.message),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown native-format error";
    throw new Error(`OpenWord could not import ${filename}: ${message}`);
  }
}

export function exportOpenWord(document: OpenWordDocument): ExportResult<Uint8Array> {
  const serialized: OpenWordDocument = {
    ...document,
    source: document.source ? { ...document.source, format: "openword" } : { format: "openword" },
  };
  return {
    data: encoder.encode(`${JSON.stringify(serialized, null, 2)}\n`),
    warnings: [],
  };
}
