import { Packer } from "docx";
import type { OpenWordDocument } from "../../document/model";
import type { ExportResult } from "../types";
import { modelToDocx } from "./modelToDocx";

export async function exportDocx(
  document: OpenWordDocument,
): Promise<ExportResult<Uint8Array>> {
  const converted = modelToDocx(document);
  const blob = await Packer.toBlob(converted.file);
  return {
    data: new Uint8Array(await blob.arrayBuffer()),
    warnings: converted.warnings,
  };
}
