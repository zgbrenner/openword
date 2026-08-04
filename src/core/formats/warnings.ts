import type { FileFormat, OpenWordDocument } from "../document/model";

const FORMAT_WARNINGS: Partial<Record<FileFormat, string[]>> = {
  docx: ["DOCX export is semantic and may simplify unsupported OpenWord structures."],
  markdown: ["Markdown cannot preserve page geometry, headers, footers, comments, or advanced table formatting."],
  html: ["HTML cannot preserve OpenWord recovery metadata or exact printed layout."],
  text: ["Plain text removes all rich formatting and embedded media."],
};

export function collectSaveWarnings(
  document: OpenWordDocument,
  format: FileFormat,
  adapterWarnings: string[] = [],
): string[] {
  if (format === "openword") return [];
  const combined = [
    ...document.compatibilityWarnings.map((warning) => warning.message),
    ...(FORMAT_WARNINGS[format] ?? []),
    ...adapterWarnings,
  ];
  return [...new Set(combined.map((warning) => warning.trim()).filter(Boolean))];
}
