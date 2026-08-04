# Changelog

All notable changes to OpenWord are documented here.

## 0.1.0: foundation release candidate

Date: 2026-08-04

### Added

- Tauri 2 and React application foundation
- Versioned local `.openword` format with migrations and security normalization
- Professional multi-document editing workspace and compact ribbon
- Rich text, paragraph, list, table, image, link, page, header, and footer tools
- Templates, navigation, search, comments, statistics, themes, focus mode, and zoom
- Recovery snapshots and recent-file support
- DOCX, Markdown, HTML, and text import and export
- Print-to-PDF workflow
- Compatibility review and warning confirmation before non-native overwrite
- Local frontend and Tauri release gates without GitHub Actions

### Known limitations

- DOCX conversion is semantic rather than a perfect OOXML package round trip
- The editor does not yet perform true automatic pagination or section layout
- Native tracked changes, citations, footnotes, and live collaboration are not implemented
