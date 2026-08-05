import JSZip from "jszip";
import type { WriterFormat } from "./protocol";
import "./package_preservation_policy.js";
import "./package_preservation_vault.js";

export type PackageClassification =
  | "writer-owned"
  | "preserve-opaque"
  | "drop-signature"
  | "blocked-executable";

export interface PackageEntry {
  path: string;
  bytes: Uint8Array;
}

export interface PreservedPackageEntry extends PackageEntry {
  classification: PackageClassification;
}

export interface PackagePreservationSnapshot {
  format: WriterFormat;
  entries: readonly PreservedPackageEntry[];
}

export interface PackageCompatibilityReport {
  restored: readonly string[];
  writerWon: readonly string[];
  droppedSignatures: readonly string[];
  blockedExecutables: readonly string[];
  metadataRepaired: readonly string[];
  notCarriedAcrossFormat: readonly string[];
  formatChanged: boolean;
  warnings: readonly string[];
}

export interface PackageMergeResult {
  bytes: Uint8Array;
  preservation: PackagePreservationSnapshot;
  compatibilityReport: PackageCompatibilityReport;
}

interface VaultMergeReport {
  restored: readonly string[];
  writerWon: readonly string[];
  droppedSignatures: readonly string[];
  blockedExecutables: readonly string[];
}

interface PackageVault {
  capture(format: WriterFormat, entries: PackageEntry[]): PackagePreservationSnapshot;
  merge(
    snapshot: PackagePreservationSnapshot,
    writerEntries: PackageEntry[],
  ): { entries: readonly PackageEntry[]; report: VaultMergeReport };
  resolveRelationshipTarget(relationshipPath: string, target: string): string | null;
}

declare global {
  // Populated by the two side-effect imports above. Keeping the policy in
  // plain JavaScript lets the exact same tested code run in Node and Vite.
  // eslint-disable-next-line no-var
  var OPENWORD_PACKAGE_VAULT: PackageVault;
}

const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();
const CONTENT_TYPES_NS = "http://schemas.openxmlformats.org/package/2006/content-types";
const RELATIONSHIPS_NS = "http://schemas.openxmlformats.org/package/2006/relationships";
const ODF_MANIFEST_NS = "urn:oasis:names:tc:opendocument:xmlns:manifest:1.0";

function vault(): PackageVault {
  if (!globalThis.OPENWORD_PACKAGE_VAULT) throw new Error("Package preservation vault is unavailable");
  return globalThis.OPENWORD_PACKAGE_VAULT;
}

async function readArchiveEntries(zip: JSZip): Promise<PackageEntry[]> {
  const files = Object.values(zip.files)
    .filter((file) => !file.dir)
    .sort((left, right) => left.name.localeCompare(right.name));
  return Promise.all(
    files.map(async (file) => ({ path: file.name, bytes: await file.async("uint8array") })),
  );
}

function originalEntry(snapshot: PackagePreservationSnapshot, path: string): PreservedPackageEntry | undefined {
  return snapshot.entries.find((entry) => entry.path === path);
}

function parseXml(bytes: Uint8Array, label: string): XMLDocument {
  const document = new DOMParser().parseFromString(textDecoder.decode(bytes), "application/xml");
  const parserError = document.getElementsByTagName("parsererror")[0];
  if (parserError) throw new Error(`Invalid XML in ${label}: ${parserError.textContent ?? "parse error"}`);
  return document;
}

function serializeXml(document: XMLDocument): Uint8Array {
  return textEncoder.encode(new XMLSerializer().serializeToString(document));
}

function relationshipSignature(element: Element): string {
  return [
    element.getAttribute("Type") ?? "",
    element.getAttribute("Target") ?? "",
    element.getAttribute("TargetMode") ?? "",
  ].join("\u0000");
}

function nextRelationshipId(usedIds: Set<string>): string {
  let index = 1;
  while (usedIds.has(`rIdOpenWord${index}`)) index += 1;
  const id = `rIdOpenWord${index}`;
  usedIds.add(id);
  return id;
}

function extensionOf(path: string): string | null {
  const file = path.split("/").pop() ?? path;
  const dot = file.lastIndexOf(".");
  return dot > 0 && dot < file.length - 1 ? file.slice(dot + 1).toLowerCase() : null;
}

async function mergeDocxContentTypes(
  zip: JSZip,
  snapshot: PackagePreservationSnapshot,
  restoredPaths: Set<string>,
  metadataRepaired: string[],
  warnings: string[],
): Promise<void> {
  const path = "[Content_Types].xml";
  const original = originalEntry(snapshot, path);
  const outputFile = zip.file(path);
  if (!original || !outputFile || restoredPaths.size === 0) return;

  try {
    const originalDocument = parseXml(original.bytes, `original ${path}`);
    const outputDocument = parseXml(await outputFile.async("uint8array"), `Writer ${path}`);
    const outputRoot = outputDocument.documentElement;
    const existingDefaults = new Set(
      Array.from(outputDocument.getElementsByTagNameNS(CONTENT_TYPES_NS, "Default"))
        .map((element) => (element.getAttribute("Extension") ?? "").toLowerCase()),
    );
    const existingOverrides = new Set(
      Array.from(outputDocument.getElementsByTagNameNS(CONTENT_TYPES_NS, "Override"))
        .map((element) => (element.getAttribute("PartName") ?? "").replace(/^\//, "")),
    );
    const restoredExtensions = new Set(
      Array.from(restoredPaths).map(extensionOf).filter((value): value is string => Boolean(value)),
    );
    let changed = false;

    for (const element of Array.from(originalDocument.getElementsByTagNameNS(CONTENT_TYPES_NS, "Default"))) {
      const extension = (element.getAttribute("Extension") ?? "").toLowerCase();
      if (extension && restoredExtensions.has(extension) && !existingDefaults.has(extension)) {
        outputRoot.appendChild(outputDocument.importNode(element, true));
        existingDefaults.add(extension);
        changed = true;
      }
    }
    for (const element of Array.from(originalDocument.getElementsByTagNameNS(CONTENT_TYPES_NS, "Override"))) {
      const partName = (element.getAttribute("PartName") ?? "").replace(/^\//, "");
      if (restoredPaths.has(partName) && !existingOverrides.has(partName)) {
        outputRoot.appendChild(outputDocument.importNode(element, true));
        existingOverrides.add(partName);
        changed = true;
      }
    }

    if (changed) {
      zip.file(path, serializeXml(outputDocument));
      metadataRepaired.push(path);
    }
  } catch (error) {
    warnings.push(error instanceof Error ? error.message : String(error));
  }
}

async function mergeDocxRelationships(
  zip: JSZip,
  snapshot: PackagePreservationSnapshot,
  restoredPaths: Set<string>,
  metadataRepaired: string[],
  warnings: string[],
): Promise<void> {
  if (restoredPaths.size === 0) return;
  const relationshipEntries = snapshot.entries.filter((entry) => entry.path.endsWith(".rels"));

  for (const original of relationshipEntries) {
    const outputFile = zip.file(original.path);
    if (!outputFile) continue;

    try {
      const originalDocument = parseXml(original.bytes, `original ${original.path}`);
      const outputDocument = parseXml(await outputFile.async("uint8array"), `Writer ${original.path}`);
      const outputRoot = outputDocument.documentElement;
      const outputRelationships = Array.from(
        outputDocument.getElementsByTagNameNS(RELATIONSHIPS_NS, "Relationship"),
      );
      const existing = new Set(outputRelationships.map(relationshipSignature));
      const usedIds = new Set(outputRelationships.map((element) => element.getAttribute("Id") ?? ""));
      let changed = false;

      for (const relationship of Array.from(
        originalDocument.getElementsByTagNameNS(RELATIONSHIPS_NS, "Relationship"),
      )) {
        if ((relationship.getAttribute("TargetMode") ?? "").toLowerCase() === "external") continue;
        const target = relationship.getAttribute("Target");
        if (!target) continue;
        const resolvedTarget = vault().resolveRelationshipTarget(original.path, target);
        if (!resolvedTarget || !restoredPaths.has(resolvedTarget)) continue;
        const signature = relationshipSignature(relationship);
        if (existing.has(signature)) continue;

        const clone = outputDocument.importNode(relationship, true) as Element;
        const requestedId = clone.getAttribute("Id") ?? "";
        if (!requestedId || usedIds.has(requestedId)) clone.setAttribute("Id", nextRelationshipId(usedIds));
        else usedIds.add(requestedId);
        outputRoot.appendChild(clone);
        existing.add(signature);
        changed = true;
      }

      if (changed) {
        zip.file(original.path, serializeXml(outputDocument));
        metadataRepaired.push(original.path);
      }
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : String(error));
    }
  }
}

function manifestFullPath(element: Element): string {
  return (
    element.getAttributeNS(ODF_MANIFEST_NS, "full-path") ??
    element.getAttribute("manifest:full-path") ??
    ""
  );
}

async function mergeOdtManifest(
  zip: JSZip,
  snapshot: PackagePreservationSnapshot,
  restoredPaths: Set<string>,
  metadataRepaired: string[],
  warnings: string[],
): Promise<void> {
  const path = "META-INF/manifest.xml";
  const original = originalEntry(snapshot, path);
  const outputFile = zip.file(path);
  if (!original || !outputFile || restoredPaths.size === 0) return;

  try {
    const originalDocument = parseXml(original.bytes, `original ${path}`);
    const outputDocument = parseXml(await outputFile.async("uint8array"), `Writer ${path}`);
    const outputRoot = outputDocument.documentElement;
    const existing = new Set(
      Array.from(outputDocument.getElementsByTagNameNS(ODF_MANIFEST_NS, "file-entry"))
        .map(manifestFullPath),
    );
    let changed = false;

    for (const fileEntry of Array.from(
      originalDocument.getElementsByTagNameNS(ODF_MANIFEST_NS, "file-entry"),
    )) {
      const fullPath = manifestFullPath(fileEntry);
      const required =
        restoredPaths.has(fullPath) ||
        (fullPath.endsWith("/") && Array.from(restoredPaths).some((item) => item.startsWith(fullPath)));
      if (!required || existing.has(fullPath)) continue;
      outputRoot.appendChild(outputDocument.importNode(fileEntry, true));
      existing.add(fullPath);
      changed = true;
    }

    if (changed) {
      zip.file(path, serializeXml(outputDocument));
      metadataRepaired.push(path);
    }
  } catch (error) {
    warnings.push(error instanceof Error ? error.message : String(error));
  }
}

function freezeReport(
  base: VaultMergeReport,
  options: {
    metadataRepaired?: string[];
    notCarriedAcrossFormat?: string[];
    formatChanged?: boolean;
    warnings?: string[];
  } = {},
): PackageCompatibilityReport {
  return Object.freeze({
    restored: Object.freeze([...base.restored]),
    writerWon: Object.freeze([...base.writerWon]),
    droppedSignatures: Object.freeze([...base.droppedSignatures]),
    blockedExecutables: Object.freeze([...base.blockedExecutables]),
    metadataRepaired: Object.freeze([...(options.metadataRepaired ?? [])]),
    notCarriedAcrossFormat: Object.freeze([...(options.notCarriedAcrossFormat ?? [])]),
    formatChanged: options.formatChanged ?? false,
    warnings: Object.freeze([...(options.warnings ?? [])]),
  });
}

async function archiveFromEntries(entries: readonly PackageEntry[], format: WriterFormat): Promise<JSZip> {
  const zip = new JSZip();
  const mimetype = format === "odt" ? entries.find((entry) => entry.path === "mimetype") : undefined;
  if (mimetype) zip.file(mimetype.path, mimetype.bytes, { compression: "STORE", createFolders: false });
  for (const entry of entries) {
    if (mimetype && entry.path === mimetype.path) continue;
    zip.file(entry.path, entry.bytes, { createFolders: true });
  }
  return zip;
}

async function generateArchive(zip: JSZip): Promise<Uint8Array> {
  return zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
    platform: "UNIX",
    streamFiles: true,
  });
}

export async function capturePackage(
  bytes: Uint8Array,
  format: WriterFormat,
): Promise<PackagePreservationSnapshot> {
  const zip = await JSZip.loadAsync(bytes, { createFolders: false });
  return vault().capture(format, await readArchiveEntries(zip));
}

export async function mergeWriterPackage(
  writerBytes: Uint8Array,
  format: WriterFormat,
  preservation: PackagePreservationSnapshot | null,
): Promise<PackageMergeResult> {
  const writerZip = await JSZip.loadAsync(writerBytes, { createFolders: false });
  const writerEntries = await readArchiveEntries(writerZip);

  if (!preservation || preservation.format !== format) {
    const emptySnapshot = vault().capture(format, []);
    const filtered = vault().merge(emptySnapshot, writerEntries);
    const outputZip = await archiveFromEntries(filtered.entries, format);
    const bytes = await generateArchive(outputZip);
    const notCarriedAcrossFormat = preservation
      ? preservation.entries
          .filter((entry) => entry.classification === "preserve-opaque")
          .map((entry) => entry.path)
      : [];
    return {
      bytes,
      preservation: await capturePackage(bytes, format),
      compatibilityReport: freezeReport(filtered.report, {
        formatChanged: Boolean(preservation),
        notCarriedAcrossFormat,
        warnings: preservation
          ? ["Opaque package parts were not copied across document formats."]
          : [],
      }),
    };
  }

  const merged = vault().merge(preservation, writerEntries);
  const outputZip = await archiveFromEntries(merged.entries, format);
  const restoredPaths = new Set(merged.report.restored);
  const metadataRepaired: string[] = [];
  const warnings: string[] = [];

  if (format === "docx") {
    await mergeDocxContentTypes(outputZip, preservation, restoredPaths, metadataRepaired, warnings);
    await mergeDocxRelationships(outputZip, preservation, restoredPaths, metadataRepaired, warnings);
  } else {
    await mergeOdtManifest(outputZip, preservation, restoredPaths, metadataRepaired, warnings);
  }

  const bytes = await generateArchive(outputZip);
  return {
    bytes,
    preservation: await capturePackage(bytes, format),
    compatibilityReport: freezeReport(merged.report, { metadataRepaired, warnings }),
  };
}
