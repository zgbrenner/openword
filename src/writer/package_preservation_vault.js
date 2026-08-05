/* SPDX-License-Identifier: Apache-2.0 */
"use strict";

var OPENWORD_PACKAGE_VAULT = Object.freeze({
  capture(format, inputEntries) {
    if (!Array.isArray(inputEntries)) throw new Error("package entries must be an array");
    const seen = new Set();
    const entries = inputEntries.map((input) => {
      const path = OPENWORD_PACKAGE_PRESERVATION.normalize(input.path);
      if (seen.has(path)) throw new Error(`duplicate package entry: ${path}`);
      seen.add(path);
      if (!(input.bytes instanceof Uint8Array)) throw new Error(`package entry is not binary: ${path}`);
      return Object.freeze({
        path,
        bytes: new Uint8Array(input.bytes),
        classification: OPENWORD_PACKAGE_PRESERVATION.classify(format, path),
      });
    });
    return Object.freeze({ format, entries: Object.freeze(entries) });
  },

  merge(snapshot, writerEntries) {
    if (!snapshot || !Array.isArray(snapshot.entries)) throw new Error("invalid package snapshot");
    if (!Array.isArray(writerEntries)) throw new Error("Writer entries must be an array");

    const output = [];
    const writerPaths = new Set();
    for (const input of writerEntries) {
      const path = OPENWORD_PACKAGE_PRESERVATION.normalize(input.path);
      if (writerPaths.has(path)) throw new Error(`duplicate Writer package entry: ${path}`);
      writerPaths.add(path);
      if (!(input.bytes instanceof Uint8Array)) throw new Error(`Writer entry is not binary: ${path}`);
      output.push(Object.freeze({ path, bytes: new Uint8Array(input.bytes) }));
    }

    const restored = [];
    const writerWon = [];
    const droppedSignatures = [];
    const blockedExecutables = [];

    for (const original of snapshot.entries) {
      const action = OPENWORD_PACKAGE_PRESERVATION.action(
        original.classification,
        writerPaths.has(original.path),
      );
      switch (action) {
        case "restore":
          output.push(Object.freeze({ path: original.path, bytes: new Uint8Array(original.bytes) }));
          restored.push(original.path);
          break;
        case "drop-signature":
          droppedSignatures.push(original.path);
          break;
        case "block-executable":
          blockedExecutables.push(original.path);
          break;
        default:
          if (writerPaths.has(original.path) || original.classification === "writer-owned") {
            writerWon.push(original.path);
          }
      }
    }

    const report = Object.freeze({
      restored: Object.freeze(restored),
      writerWon: Object.freeze(writerWon),
      droppedSignatures: Object.freeze(droppedSignatures),
      blockedExecutables: Object.freeze(blockedExecutables),
    });
    return Object.freeze({ entries: Object.freeze(output), report });
  },

  resolveRelationshipTarget(relationshipPath, target) {
    const relsPath = OPENWORD_PACKAGE_PRESERVATION.normalize(relationshipPath);
    if (typeof target !== "string" || !target) throw new Error("unsafe relationship target");
    if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("//")) return null;

    let ownerPath;
    if (relsPath === "_rels/.rels") {
      ownerPath = "";
    } else {
      const marker = "/_rels/";
      const markerIndex = relsPath.lastIndexOf(marker);
      if (markerIndex < 0 || !relsPath.endsWith(".rels")) {
        throw new Error(`invalid relationship part: ${relsPath}`);
      }
      const directory = relsPath.slice(0, markerIndex);
      const file = relsPath.slice(markerIndex + marker.length, -".rels".length);
      ownerPath = directory ? `${directory}/${file}` : file;
    }

    const baseSegments = ownerPath ? ownerPath.split("/").slice(0, -1) : [];
    const cleanTarget = target.split(/[?#]/, 1)[0].replaceAll("\\", "/");
    const targetSegments = cleanTarget.startsWith("/") ? [] : [...baseSegments];
    for (const segment of cleanTarget.replace(/^\/+/, "").split("/")) {
      if (!segment || segment === ".") continue;
      if (segment === "..") {
        if (!targetSegments.length) throw new Error(`unsafe relationship target: ${target}`);
        targetSegments.pop();
      } else {
        targetSegments.push(segment);
      }
    }
    if (!targetSegments.length) throw new Error(`unsafe relationship target: ${target}`);
    return OPENWORD_PACKAGE_PRESERVATION.normalize(targetSegments.join("/"));
  },
});

globalThis.OPENWORD_PACKAGE_VAULT = OPENWORD_PACKAGE_VAULT;
