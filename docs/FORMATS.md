# OpenWord formats and compatibility

## Native `.openword` format

An `.openword` file is UTF-8 JSON. It is designed for transparency, migration, source control, and local recovery rather than binary compactness.

Top-level shape:

```ts
interface OpenWordDocument {
  schemaVersion: 1;
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  author?: string;
  content: ProseMirrorJSON;
  header: ProseMirrorJSON;
  footer: ProseMirrorJSON;
  page: PageSetup;
  comments: CommentThread[];
  settings: DocumentSettings;
  source?: DocumentSource;
  compatibilityWarnings: CompatibilityWarning[];
}
```

The exact TypeScript definitions live in `src/core/document/model.ts`.

### Guarantees

- Schema version 1 documents are migrated and normalized when opened.
- A future schema version is rejected rather than guessed at.
- Unsafe URLs, remote images, unsupported image types, invalid styles, unknown marks, and unknown nodes are removed or simplified with warnings.
- Existing and generated warnings are deduplicated by code and message.
- Saving to `.openword` retains compatibility warnings as document metadata.

### Non-goals

The native file is not currently a ZIP package, an OOXML dialect, or a format intended for direct use by Microsoft Word. Embedded images are stored as data URLs, which favors portability over file size.

## Support matrix

| Format | Import | Export | Round-trip expectation |
|---|---|---|---|
| `.openword` | Yes | Yes | Lossless for supported schema 1 content |
| `.docx` | Yes | Yes | Semantic and common formatting, not perfect OOXML preservation |
| `.md`, `.markdown` | Yes | Yes | Strong structural fidelity; Word-only layout and review data cannot fit |
| `.html`, `.htm` | Yes | Yes | Sanitized structural fidelity; external resources are removed |
| `.txt` | Yes | Yes | Plain text only |
| `.pdf` | No | Through print dialog | Output only |
| `.doc` | No | No | Not supported |
| `.odt` | No | No | Planned adapter candidate |
| `.rtf` | No | No | Planned adapter candidate |

## DOCX import

OpenWord uses semantic conversion rather than mounting a Word rendering engine. It currently preserves or recognizes common:

- Paragraphs and headings
- Bold, italic, underline, strikethrough, and hyperlinks
- Common named styles
- Ordered and unordered lists
- Tables
- Embedded images
- Basic quotes and code-like blocks

Import always records a semantic-fidelity warning. Complex structures may be simplified, including:

- Floating and anchored objects
- Section-specific geometry and headers or footers
- Tracked changes
- Native comments and replies
- Fields, content controls, cross-references, and automatic numbering details
- Footnotes and endnotes
- SmartArt, charts, shapes, equations, and embedded objects
- Theme and style inheritance not expressible in the native tree

External-file access is disabled during conversion. The importer rejects empty files and files larger than 50 MB.

## DOCX export

Current export covers:

- Standard paragraphs and headings 1 through 6
- Title, subtitle, and quote styles
- Common inline text formatting and colors
- Hyperlinks
- Ordered, unordered, nested, and task lists
- Tables with row and column spans
- Supported embedded data images
- Horizontal rules and page breaks
- Paper size, orientation, and margins
- Text headers and footers
- Automatic page number footer when no custom footer exists

OpenWord comments are not currently emitted as native Word comment threads. The exporter reports this and any unsupported node simplification.

## Markdown

Markdown is a first-class interchange format, not the internal document model.

OpenWord supports GitHub-flavored tables and task lists. It preserves page breaks as:

```markdown
<!-- pagebreak -->
```

Underline, highlight, and comment anchors may be represented as inline HTML. Full comment-thread bodies, page geometry, headers, footers, and most document-layout metadata cannot be represented in ordinary Markdown.

## HTML

HTML is sanitized before conversion. Scripts, event handlers, embedded objects, unsafe links, and remote images are removed. Supported local images must be embedded data images.

Export produces a standalone UTF-8 document with basic print-friendly styles. It is intended for readable interchange, not exact browser reproduction of the editor chrome.

## Plain text

Each line imports as a paragraph. Export flattens rich structure to readable text and removes formatting, images, comments, tables, and layout data.

## PDF

OpenWord uses the operating system's print pipeline. Select **File → Print / PDF**, then choose the platform's PDF destination. This avoids shipping a separate browser or PDF renderer, but exact output can vary slightly by operating system and webview.

## Warning policy

When saving to DOCX, Markdown, HTML, or text, OpenWord combines:

1. Compatibility notices recorded during import or native normalization
2. New warnings produced by the destination adapter

The user must explicitly continue before the file is written. Native `.openword` saves do not require this confirmation because warnings remain inside the file and the native model is the source of truth.
