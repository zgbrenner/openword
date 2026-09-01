// Test harness for the DOCX filters.
//
// `src/docx/import.ts` and `src/docx/export.ts` are TypeScript, and these
// suites are plain `.mjs` run by `node --test`. Elsewhere in tests/editor the
// seam is a hand-written `.js` module with a `.d.ts` beside it (see
// src/editor/document_file.js), but the filters are far too large to split
// that way, so this module loads the real sources instead:
//
//   * Node 24 strips the types itself, so no build step is needed.
//   * A synchronous resolve hook supplies the extensions the sources omit
//     (`../editor/document` -> `document.ts`, `./document_file` -> `.js`),
//     which is the only thing Node's own resolver can't do here.
//   * `DOMParser` is a browser global with no Node equivalent, so it is
//     shimmed below over a small strict XML parser. It mirrors the one
//     DOMParser behaviour the importer depends on: malformed XML is never
//     thrown, it comes back as a document containing <parsererror>.
//
// Everything else — JSZip, the OOXML walk, ProseMirror, the `docx` package —
// is the real shipping code.

import { registerHooks } from "node:module";

// ---------------------------------------------------------------------------
// Minimal XML DOM, enough for the filters' use of it
// ---------------------------------------------------------------------------

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (whole, body) => {
    if (body[0] !== "#") return ENTITIES[body] ?? whole;
    const code = body[1] === "x" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
    return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
  });
}

class ShimElement {
  constructor(tagName, attributes) {
    this.tagName = tagName;
    this.nodeName = tagName;
    this.localName = tagName.includes(":") ? tagName.slice(tagName.indexOf(":") + 1) : tagName;
    this.attributes = attributes;
    this.children = [];
    this.childNodes = [];
  }

  getAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null;
  }

  get textContent() {
    return this.childNodes.map((node) => (typeof node === "string" ? node : node.textContent)).join("");
  }

  getElementsByTagName(name) {
    const found = [];
    const visit = (element) => {
      for (const child of element.children) {
        if (child.tagName === name || child.localName === name) found.push(child);
        visit(child);
      }
    };
    visit(this);
    return found;
  }
}

class ShimDocument {
  constructor(documentElement) {
    this.documentElement = documentElement;
  }

  getElementsByTagName(name) {
    const root = this.documentElement;
    if (!root) return [];
    const self = root.tagName === name || root.localName === name ? [root] : [];
    return [...self, ...root.getElementsByTagName(name)];
  }
}

const NAME = /[A-Za-z_:][-A-Za-z0-9._:]*/y;

/** Throws on any input that is not well-formed XML. */
function parseXmlDocument(source) {
  let at = 0;
  let root = null;
  const open = [];

  const fail = (message) => {
    throw new Error(`${message} (at offset ${at})`);
  };
  const skipSpace = () => {
    while (at < source.length && /\s/.test(source[at])) at += 1;
  };
  const readName = () => {
    NAME.lastIndex = at;
    const match = NAME.exec(source);
    if (!match) fail("expected an element or attribute name");
    at = NAME.lastIndex;
    return match[0];
  };
  const addText = (text) => {
    if (open.length === 0) {
      if (text.trim()) fail("text outside the root element");
      return;
    }
    open[open.length - 1].childNodes.push(text);
  };

  while (at < source.length) {
    if (source.startsWith("<?", at)) {
      const end = source.indexOf("?>", at);
      if (end === -1) fail("unterminated processing instruction");
      at = end + 2;
    } else if (source.startsWith("<!--", at)) {
      const end = source.indexOf("-->", at);
      if (end === -1) fail("unterminated comment");
      at = end + 3;
    } else if (source.startsWith("<![CDATA[", at)) {
      const end = source.indexOf("]]>", at);
      if (end === -1) fail("unterminated CDATA section");
      addText(source.slice(at + 9, end));
      at = end + 3;
    } else if (source.startsWith("<!", at)) {
      const end = source.indexOf(">", at);
      if (end === -1) fail("unterminated declaration");
      at = end + 1;
    } else if (source.startsWith("</", at)) {
      at += 2;
      const name = readName();
      skipSpace();
      if (source[at] !== ">") fail("malformed closing tag");
      at += 1;
      const element = open.pop();
      if (!element) fail(`closing tag </${name}> has no opening tag`);
      if (element.tagName !== name) fail(`closing tag </${name}> does not match <${element.tagName}>`);
    } else if (source[at] === "<") {
      at += 1;
      const name = readName();
      const attributes = {};
      let selfClosing = false;
      for (;;) {
        skipSpace();
        if (at >= source.length) fail("unterminated opening tag");
        if (source.startsWith("/>", at)) {
          at += 2;
          selfClosing = true;
          break;
        }
        if (source[at] === ">") {
          at += 1;
          break;
        }
        const attribute = readName();
        skipSpace();
        if (source[at] !== "=") fail(`attribute ${attribute} has no value`);
        at += 1;
        skipSpace();
        const quote = source[at];
        if (quote !== '"' && quote !== "'") fail(`attribute ${attribute} has an unquoted value`);
        at += 1;
        const end = source.indexOf(quote, at);
        if (end === -1) fail(`unterminated value for attribute ${attribute}`);
        attributes[attribute] = decodeEntities(source.slice(at, end));
        at = end + 1;
      }
      const element = new ShimElement(name, attributes);
      const parent = open[open.length - 1];
      if (parent) {
        parent.children.push(element);
        parent.childNodes.push(element);
      } else if (root) {
        fail("more than one root element");
      } else {
        root = element;
      }
      if (!selfClosing) open.push(element);
    } else {
      const next = source.indexOf("<", at);
      const end = next === -1 ? source.length : next;
      addText(decodeEntities(source.slice(at, end)));
      at = end;
    }
  }

  if (open.length > 0) fail(`element <${open[open.length - 1].tagName}> is never closed`);
  if (!root) fail("no root element");
  return new ShimDocument(root);
}

class DOMParserShim {
  parseFromString(source) {
    try {
      return parseXmlDocument(source);
    } catch (error) {
      // What a browser does: hand back a document whose content is a
      // <parsererror> element rather than throwing.
      const element = new ShimElement("parsererror", {});
      element.childNodes.push(String(error?.message ?? error));
      return new ShimDocument(element);
    }
  }
}

if (!globalThis.DOMParser) globalThis.DOMParser = DOMParserShim;

// ---------------------------------------------------------------------------
// Loading the real TypeScript sources
// ---------------------------------------------------------------------------

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (!specifier.startsWith(".")) throw error;
      for (const extension of [".ts", ".js"]) {
        try {
          return nextResolve(specifier + extension, context);
        } catch {
          // try the next extension
        }
      }
      throw error;
    }
  },
});

const sourceUrl = (path) => new URL(`../../src/${path}`, import.meta.url).href;

export const { importDocx, DocxImportError } = await import(sourceUrl("docx/import.ts"));
export const { exportDocx, DocxExportError } = await import(sourceUrl("docx/export.ts"));
export const { docFromJSON, emptyDoc } = await import(sourceUrl("editor/document.ts"));

// Exported so a test can prove the shim itself behaves the way the importer
// assumes a DOMParser behaves.
export { DOMParserShim };
