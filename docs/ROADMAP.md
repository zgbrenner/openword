# OpenWord roadmap

The roadmap is ordered by risk and architectural leverage, not by the number of visible toolbar buttons.

## 0.1: professional foundation

Status: implemented in the foundation branch; the reproducible dependency, frontend-build, and Rust gates must pass before release tagging.

- Tauri 2 desktop shell and browser fallback
- Versioned `.openword` document model and migrations
- Rich editor, compact ribbon, tabs, sidebars, dialogs, and status bar
- Common professional text and paragraph formatting
- Lists, task lists, tables, images, links, page breaks, headers, and footers
- Page setup, templates, navigation, search, comments, statistics, zoom, themes, and focus mode
- Recovery snapshots and recent files
- DOCX, Markdown, HTML, and text adapters
- Print-to-PDF
- Import sanitization and native-document normalization
- Explicit combined compatibility warnings before non-native overwrite
- Local release gate with no GitHub Actions

## 0.2: document fidelity

Priority: highest.

- Preserve untouched OOXML package parts alongside normalized content
- Reapply preserved relationships, styles, themes, numbering, and metadata on DOCX export
- Introduce section nodes with independent geometry, headers, footers, and numbering
- Render visible headers and footers in the page canvas
- Implement true page layout and automatic pagination
- Add widow, orphan, keep-with-next, and page-break controls
- Improve image sizing, wrapping, captions, and anchored objects
- Add ODT and RTF adapters after the preservation layer is stable
- Build a redistributable compatibility fixture suite with round-trip scoring

## 0.3: professional review and long documents

- Tracked insertions, deletions, formatting changes, accept, reject, and compare
- Native DOCX comment import and export
- Footnotes and endnotes
- Cross-references, bookmarks, captions, and automatic tables of contents
- Citation sources and bibliography styles
- Outline numbering and multilevel legal lists
- Document inspector for styles, fields, accessibility, and compatibility
- Navigation for headings, pages, comments, tables, figures, and search results
- Versioned local snapshots and document comparison

## 0.4: productivity and extensibility

- Mail merge and reusable fields
- Template packs and organization defaults
- Plugin API for importers, exporters, commands, and inspectors
- Optional offline grammar and style checking
- Optional local writing assistance with a strict privacy boundary
- Extension signing and permission declarations
- Automatic updater with user-controlled channels

## 0.5: optional collaboration

Collaboration must remain optional so that OpenWord still works fully offline.

- Provider-neutral synchronization interface
- CRDT-backed coauthoring
- Presence, selections, comments, and conflict handling
- Encrypted remote document storage adapters
- Shared version history
- Organization policy and retention hooks

## 1.0 release criteria

- Stable native format and documented migration policy
- Strong DOCX round-trip scores across a public fixture suite
- Reliable automatic pagination and section layout
- Review, footnote, citation, reference, and accessibility workflows suitable for professional documents
- Signed Windows, macOS, and Linux bundles
- Automatic updates with rollback
- Keyboard and screen-reader audit
- Performance testing on long and image-heavy documents
- Security review of parsers, Tauri permissions, recovery, and update channels
- Clear support policy and reproducible release process

## Explicit exclusions

OpenWord does not need to reproduce every obscure Microsoft Office feature to reach 1.0. VBA macros, ActiveX, arbitrary embedded executables, and legacy binary `.doc` editing are security-heavy and low-priority unless a safe isolated design emerges.
