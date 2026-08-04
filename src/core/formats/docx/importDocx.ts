import mammoth from "mammoth";
import { createBlankDocument, createId } from "../../document/factory";
import { sanitizeHtml } from "../../security/sanitize";
import { htmlFragmentToContent } from "../html";
import type { ImportResult } from "../types";

const MAX_DOCX_BYTES = 50 * 1024 * 1024;

function exactArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

export async function importDocx(
  bytes: Uint8Array,
  filename = "Imported document.docx",
): Promise<ImportResult> {
  if (bytes.byteLength === 0) {
    throw new Error("The selected DOCX file is empty.");
  }
  if (bytes.byteLength > MAX_DOCX_BYTES) {
    throw new Error("This DOCX file is larger than OpenWord's 50 MB safety limit.");
  }

  try {
    const result = await mammoth.convertToHtml(
      { arrayBuffer: exactArrayBuffer(bytes) },
      {
        externalFileAccess: false,
        includeDefaultStyleMap: true,
        ignoreEmptyParagraphs: false,
        styleMap: [
          "p[style-name='Title'] => h1.openword-title:fresh",
          "p[style-name='Subtitle'] => p.openword-subtitle:fresh",
          "p[style-name='Quote'] => blockquote > p:fresh",
          "p[style-name='Intense Quote'] => blockquote > p:fresh",
          "u => u",
          "highlight => mark",
          "comment-reference => sup.comment-reference",
        ],
        convertImage: mammoth.images.imgElement(async (image) => ({
          src: `data:${image.contentType};base64,${await image.readAsBase64String()}`,
        })),
      },
    );

    const clean = sanitizeHtml(result.value);
    const title = filename.replace(/\.docx$/i, "") || "Imported document";
    const document = createBlankDocument(title);
    document.content = htmlFragmentToContent(clean);
    document.source = {
      format: "docx",
      importedAt: new Date().toISOString(),
    };

    const warnings = result.messages.map((message) => message.message);
    const fidelityWarning =
      "DOCX import preserves semantic content and common formatting, but complex floating objects, section-specific layout, tracked changes, and some Word fields may be simplified.";

    warnings.unshift(fidelityWarning);
    document.compatibilityWarnings = [
      {
        id: createId("warning"),
        code: "docx-semantic-import",
        message: fidelityWarning,
        severity: "warning",
        source: filename,
      },
      ...result.messages.map((message) => ({
        id: createId("warning"),
        code: `mammoth-${message.type}`,
        message: message.message,
        severity: message.type === "error" ? ("warning" as const) : ("info" as const),
        source: filename,
      })),
    ];

    return { document, warnings };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown DOCX conversion error";
    throw new Error(`OpenWord could not import ${filename}: ${message}`);
  }
}
