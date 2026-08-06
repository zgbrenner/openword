/* SPDX-License-Identifier: Apache-2.0 */
"use strict";

var OPENWORD_PACKAGE_PRESERVATION = Object.freeze({
  normalize(path) {
    if (typeof path !== "string") throw new Error("unsafe package path");
    const normalized = path.replaceAll("\\", "/").replace(/^\/+/, "").replace(/\/{2,}/g, "/");
    const segments = normalized.split("/");
    if (!normalized || segments.some((segment) => !segment || segment === "." || segment === "..")) {
      throw new Error(`unsafe package path: ${path}`);
    }
    return normalized;
  },

  classify(format, inputPath) {
    const path = this.normalize(inputPath);
    const lower = path.toLowerCase();
    if (format !== "docx" && format !== "odt") {
      throw new Error(`unsupported package format: ${String(format)}`);
    }

    if (format === "docx") {
      if (
        lower.startsWith("_xmlsignatures/") ||
        lower === "_xmlsignatures/origin.sigs" ||
        lower.endsWith(".p7s")
      ) {
        return "drop-signature";
      }
      if (
        lower === "word/vbaproject.bin" ||
        lower === "word/vbadata.xml" ||
        lower.startsWith("word/activex/") ||
        lower.startsWith("customui/")
      ) {
        return "blocked-executable";
      }

      const writerOwned =
        path === "[Content_Types].xml" ||
        lower === "_rels/.rels" ||
        lower.startsWith("docprops/") ||
        lower === "word/document.xml" ||
        lower === "word/_rels/document.xml.rels" ||
        lower === "word/styles.xml" ||
        lower === "word/styleswitheffects.xml" ||
        lower === "word/numbering.xml" ||
        lower === "word/settings.xml" ||
        lower === "word/websettings.xml" ||
        lower === "word/fonttable.xml" ||
        lower.startsWith("word/theme/") ||
        /^word\/(header|footer)\d+\.xml$/i.test(path) ||
        /^word\/_rels\/(header|footer)\d+\.xml\.rels$/i.test(path) ||
        /^word\/(comments|commentsextended|commentsids|people|footnotes|endnotes)\.xml$/i.test(path) ||
        /^word\/_rels\/(comments|footnotes|endnotes)\.xml\.rels$/i.test(path);
      return writerOwned ? "writer-owned" : "preserve-opaque";
    }

    if (
      lower === "meta-inf/documentsignatures.xml" ||
      lower === "meta-inf/macrosignatures.xml" ||
      lower.startsWith("meta-inf/signatures")
    ) {
      return "drop-signature";
    }
    if (
      lower.startsWith("scripts/") ||
      lower.startsWith("basic/") ||
      lower.startsWith("dialogs/")
    ) {
      return "blocked-executable";
    }

    const writerOwned =
      lower === "mimetype" ||
      lower === "content.xml" ||
      lower === "styles.xml" ||
      lower === "settings.xml" ||
      lower === "meta.xml" ||
      lower === "meta-inf/manifest.xml" ||
      lower === "thumbnails/thumbnail.png";
    return writerOwned ? "writer-owned" : "preserve-opaque";
  },

  action(classification, writerHasEntry) {
    if (classification === "preserve-opaque") return writerHasEntry ? "writer-won" : "restore";
    if (classification === "drop-signature") return "drop-signature";
    if (classification === "blocked-executable") return "block-executable";
    return "writer-won";
  },
});

globalThis.OPENWORD_PACKAGE_PRESERVATION = OPENWORD_PACKAGE_PRESERVATION;
