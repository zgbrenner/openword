# OpenWord Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a working Tauri word processor with a professional ribbon interface, a versioned native document format, rich editing, comments, recovery, and DOCX/Markdown/HTML/TXT/PDF interchange.

**Architecture:** A React/Tiptap editor owns a normalized rich-document tree wrapped by a versioned `OpenWordDocument` envelope. File formats, recovery storage, commands, and native Tauri operations are isolated behind typed adapters so that future high-fidelity OOXML preservation and collaboration providers do not require an editor rewrite.

**Tech Stack:** Tauri 2, Rust, React 19, TypeScript, Vite, Tiptap 3/ProseMirror, Zustand, Mammoth, docx, Marked, Turndown, DOMPurify, Lucide React, Vitest, Testing Library.

## Global Constraints

- Core editing and conversion must work without a server, cloud account, API key, or telemetry.
- `.openword` is the only lossless native format; DOCX and Markdown adapters must surface compatibility warnings.
- Imported HTML must be sanitized before it reaches the editor.
- The browser development build must remain functional without Tauri.
- Tauri capabilities must grant only required dialog, filesystem, and opener access.
- Do not create GitHub Actions workflows; `npm run verify` is the local release gate.
- Keep feature modules focused and avoid files that combine editor setup, persistence, and UI rendering.

---

## Planned file map

```text
src/
  app/App.tsx                         Application composition
  app/useKeyboardShortcuts.ts        Global shortcut routing
  components/backstage/Backstage.tsx File, template, and export surface
  components/editor/DocumentEditor.tsx Tiptap lifecycle and model synchronization
  components/editor/EditorCanvas.tsx Page-like editing surface
  components/editor/extensions/      Custom comment, page-break, paragraph-style extensions
  components/ribbon/Ribbon.tsx        Ribbon tab shell
  components/ribbon/*Tab.tsx          Home/Insert/Layout/Review/View commands
  components/shell/TitleBar.tsx        Document identity and quick-access commands
  components/shell/DocumentTabs.tsx    Multi-document tab strip
  components/sidebar/NavigationSidebar.tsx Heading outline
  components/sidebar/ReviewSidebar.tsx Comment threads and warnings
  components/status/StatusBar.tsx      Counts, layout, zoom, save state
  components/dialogs/                 Find/replace, command palette, page setup, link dialogs
  core/document/model.ts              Versioned document types
  core/document/factory.ts            Blank documents and IDs
  core/document/migrations.ts         Schema upgrades and validation
  core/document/templates.ts          Built-in document templates
  core/document/stats.ts              Word/character/paragraph/reading statistics
  core/document/search.ts             Pure find/replace transforms
  core/formats/                       Native, Markdown, HTML, text, and DOCX adapters
  core/security/sanitize.ts           HTML allowlist
  core/storage/recovery.ts             Local autosave snapshots and recent metadata
  core/platform/files.ts               Browser/Tauri file operations
  core/commands/registry.ts            Searchable command registry
  store/workspaceStore.ts              Tabs, active document, dirty state, and UI preferences
  styles/                              Tokens, shell, ribbon, editor, print, and dark mode
src-tauri/
  src/lib.rs                           Tauri plugin initialization
  src/main.rs                          Desktop entrypoint
  capabilities/default.json            Minimal permissions
  tauri.conf.json                       Product and build configuration
scripts/verify.mjs                      Ordered local release checks
```

---

### Task 1: Project and Tauri shell

**Files:**
- Create: `package.json`, `index.html`, `vite.config.ts`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`, `eslint.config.js`
- Create: `src/main.tsx`, `src/vite-env.d.ts`
- Create: `src-tauri/Cargo.toml`, `src-tauri/build.rs`, `src-tauri/src/lib.rs`, `src-tauri/src/main.rs`, `src-tauri/tauri.conf.json`, `src-tauri/capabilities/default.json`
- Create: `scripts/verify.mjs`

**Interfaces:**
- Produces: `npm run dev`, `npm run build`, `npm run tauri`, `npm run test`, `npm run verify`
- Produces: Tauri plugins for dialog, filesystem, opener, and store

- [ ] Write a smoke test that imports the root application and expects the OpenWord product name.
- [ ] Run the test and confirm it fails because the application does not exist.
- [ ] Add the Vite/React and Tauri entrypoints, minimal root application, strict TypeScript settings, and local verification script.
- [ ] Run type checking, the smoke test, Vite build, Rust formatting, and `cargo check`.
- [ ] Commit with `chore: scaffold Tauri React application`.

### Task 2: Versioned document model and templates

**Files:**
- Create: `src/core/document/model.ts`
- Create: `src/core/document/factory.ts`
- Create: `src/core/document/migrations.ts`
- Create: `src/core/document/templates.ts`
- Test: `src/core/document/document.test.ts`

**Interfaces:**
- Produces: `OpenWordDocument`, `PageSetup`, `CommentThread`, `CompatibilityWarning`, `createBlankDocument()`, `migrateDocument(input)`, `createDocumentFromTemplate(templateId)`

- [ ] Write tests for a blank document, stable required fields, unique IDs, all built-in templates, and migration from an unversioned legacy object.
- [ ] Run tests and verify missing exports fail.
- [ ] Implement schema version 1, factory defaults, runtime guards, migrations, and blank/report/letter/legal-memo/meeting-notes templates.
- [ ] Run focused tests and type checking.
- [ ] Commit with `feat: add native document model and templates`.

### Task 3: Recovery, statistics, and search transforms

**Files:**
- Create: `src/core/storage/recovery.ts`
- Create: `src/core/document/stats.ts`
- Create: `src/core/document/search.ts`
- Test: `src/core/document/productivity.test.ts`

**Interfaces:**
- Produces: `saveRecoverySnapshot(document)`, `loadRecoverySnapshots()`, `removeRecoverySnapshot(id)`, `calculateDocumentStats(content)`, `replaceTextInDocument(content, query, replacement, options)`

- [ ] Write tests covering empty documents, Unicode words, paragraph counts, case-sensitive replacement, whole-word replacement, and recovery corruption handling.
- [ ] Run tests and verify failure.
- [ ] Implement pure JSON-tree traversal and defensive local-storage persistence.
- [ ] Run focused tests and type checking.
- [ ] Commit with `feat: add recovery and productivity services`.

### Task 4: Editor extensions and page canvas

**Files:**
- Create: `src/components/editor/extensions/PageBreak.ts`
- Create: `src/components/editor/extensions/CommentMark.ts`
- Create: `src/components/editor/extensions/ParagraphStyle.ts`
- Create: `src/components/editor/editorExtensions.ts`
- Create: `src/components/editor/EditorCanvas.tsx`
- Create: `src/components/editor/DocumentEditor.tsx`
- Create: `src/styles/editor.css`
- Test: `src/components/editor/DocumentEditor.test.tsx`

**Interfaces:**
- Produces: `createEditorExtensions()`, commands `setPageBreak()`, `setCommentMark(id)`, `unsetCommentMark()`, `setParagraphStyle(style)`
- Consumes: `OpenWordDocument.content`

- [ ] Write a component test that renders editable content and a unit test that parses/renders a page-break node.
- [ ] Run tests and confirm failure.
- [ ] Configure StarterKit, TableKit, TextStyleKit, Highlight, Image, TextAlign, Superscript, Subscript, TaskList/TaskItem, placeholders, custom comments, and custom page breaks without duplicate extensions.
- [ ] Implement a page-like canvas that respects page size, margins, zoom, spellcheck, print styles, and formatting-mark classes.
- [ ] Run focused tests, type checking, and the production build.
- [ ] Commit with `feat: add professional rich text editor core`.

### Task 5: Workspace store and multi-document lifecycle

**Files:**
- Create: `src/store/workspaceStore.ts`
- Create: `src/store/selectors.ts`
- Test: `src/store/workspaceStore.test.ts`

**Interfaces:**
- Produces: `useWorkspaceStore`, `openDocument(document, file?)`, `updateActiveContent(content)`, `markSaved(id, file)`, `closeDocument(id)`, `setActiveDocument(id)`, `setZoom(number)`, `toggleSidebar(kind)`

- [ ] Write tests for opening, switching, editing, dirty state, closing, and guaranteeing at least one tab.
- [ ] Run tests and confirm failure.
- [ ] Implement immutable tab state, active selection, UI preferences, recent entries, and debounced recovery scheduling.
- [ ] Run store tests and type checking.
- [ ] Commit with `feat: add multi-document workspace state`.

### Task 6: Native and browser file platform

**Files:**
- Create: `src/core/platform/files.ts`
- Create: `src/core/platform/tauri.ts`
- Create: `src/core/formats/types.ts`
- Create: `src/core/formats/openword.ts`
- Create: `src/core/formats/html.ts`
- Create: `src/core/formats/text.ts`
- Create: `src/core/security/sanitize.ts`
- Test: `src/core/formats/basicFormats.test.ts`

**Interfaces:**
- Produces: `pickDocumentFile()`, `saveDocumentFile(options)`, `readNativeFile(path)`, `writeNativeFile(path, bytes)`, `importOpenWord(bytes)`, `exportOpenWord(document)`, `importHtml(text)`, `exportHtml(document)`, `importText(text)`, `exportText(document)`

- [ ] Write tests for native format round trips, schema migration, HTML sanitization, and plain-text paragraph conversion.
- [ ] Run tests and confirm failure.
- [ ] Implement a runtime Tauri detector, native dialogs/filesystem operations, browser file picker/download fallback, DOMPurify allowlist, and basic adapters.
- [ ] Run focused tests and production build.
- [ ] Commit with `feat: add secure local file adapters`.

### Task 7: Markdown import and export

**Files:**
- Create: `src/core/formats/markdown.ts`
- Test: `src/core/formats/markdown.test.ts`

**Interfaces:**
- Produces: `importMarkdown(markdown): ImportResult`, `exportMarkdown(document): ExportResult<string>`
- Consumes: sanitized HTML adapter and normalized content

- [ ] Write round-trip tests for headings, emphasis, lists, task lists, links, tables, blockquotes, code, horizontal rules, and page-break comments.
- [ ] Run tests and confirm failure.
- [ ] Implement Marked-to-sanitized-HTML import and Turndown/GFM export with custom rules for page breaks, underline, highlight, and comments.
- [ ] Run tests and type checking.
- [ ] Commit with `feat: add Markdown interchange`.

### Task 8: DOCX import and export

**Files:**
- Create: `src/core/formats/docx/importDocx.ts`
- Create: `src/core/formats/docx/exportDocx.ts`
- Create: `src/core/formats/docx/modelToDocx.ts`
- Create: `src/core/formats/docx/imageData.ts`
- Test: `src/core/formats/docx/docx.test.ts`

**Interfaces:**
- Produces: `importDocx(bytes): Promise<ImportResult>`, `exportDocx(document): Promise<ExportResult<Uint8Array>>`
- Consumes: Mammoth browser conversion, sanitized HTML, `docx` OOXML generation, page setup, header/footer, and normalized document JSON

- [ ] Write tests that import a fixture with headings, lists, a table, image, footnote, and comments; write export tests that inspect the generated ZIP entries and document XML.
- [ ] Run tests and confirm failure.
- [ ] Implement DOCX import with external access disabled, size limits, custom style maps, warning translation, and sanitization.
- [ ] Implement model-to-DOCX conversion for paragraphs, heading styles, inline marks, lists, task items, tables, images, page breaks, page geometry, headers, footers, hyperlinks, and compatibility warnings for unsupported nodes.
- [ ] Run focused tests and production build.
- [ ] Commit with `feat: add DOCX import and export`.

### Task 9: Professional shell, ribbon, sidebars, and status bar

**Files:**
- Create: `src/app/App.tsx`
- Create: `src/components/shell/TitleBar.tsx`, `src/components/shell/DocumentTabs.tsx`
- Create: `src/components/ribbon/Ribbon.tsx`, `HomeTab.tsx`, `InsertTab.tsx`, `LayoutTab.tsx`, `ReviewTab.tsx`, `ViewTab.tsx`
- Create: `src/components/sidebar/NavigationSidebar.tsx`, `ReviewSidebar.tsx`
- Create: `src/components/status/StatusBar.tsx`
- Create: `src/components/common/IconButton.tsx`, `SelectControl.tsx`, `RibbonGroup.tsx`
- Create: `src/styles/tokens.css`, `src/styles/global.css`, `src/styles/shell.css`, `src/styles/ribbon.css`
- Test: `src/app/App.test.tsx`

**Interfaces:**
- Consumes: active editor, workspace store, command registry, file commands, statistics, comments, page settings
- Produces: keyboard-accessible application shell and command surfaces

- [ ] Write tests for ribbon tab switching, document tab switching, status counts, sidebar toggles, and disabled command states.
- [ ] Run tests and confirm failure.
- [ ] Implement the title bar, compact ribbon, tab strip, sidebars, page workspace, status bar, dark mode, responsive behavior, and reduced-motion behavior.
- [ ] Connect all implemented editor commands and ensure icon-only controls have accessible names.
- [ ] Run component tests, type checking, and production build.
- [ ] Commit with `feat: add professional OpenWord workspace`.

### Task 10: Backstage, commands, review tools, and export flow

**Files:**
- Create: `src/core/commands/registry.ts`, `src/core/commands/types.ts`
- Create: `src/components/backstage/Backstage.tsx`
- Create: `src/components/dialogs/CommandPalette.tsx`, `FindReplaceDialog.tsx`, `PageSetupDialog.tsx`, `LinkDialog.tsx`
- Create: `src/core/document/comments.ts`
- Create: `src/app/useKeyboardShortcuts.ts`
- Test: `src/components/productivityFlows.test.tsx`

**Interfaces:**
- Produces: `getCommands(context)`, `addCommentFromSelection(editor, document, text)`, `resolveComment(id)`, new/open/save/save-as/export/print flows, command palette, find/replace, and page setup

- [ ] Write tests for command search, comment creation/resolution, find/replace state, and save/export format selection.
- [ ] Run tests and confirm failure.
- [ ] Implement File backstage with templates/recent/export, searchable commands, review sidebar actions, keyboard shortcuts, conversion warning confirmation, and `window.print()` PDF flow.
- [ ] Run focused tests and the complete frontend gate.
- [ ] Commit with `feat: add file and review workflows`.

### Task 11: Documentation, fixtures, icons, and release verification

**Files:**
- Replace: `README.md`
- Create: `LICENSE`, `CONTRIBUTING.md`, `SECURITY.md`, `docs/ARCHITECTURE.md`, `docs/FORMATS.md`, `docs/ROADMAP.md`
- Create: `src-tauri/icons/*`
- Create: `tests/fixtures/*`
- Modify: `scripts/verify.mjs`

**Interfaces:**
- Produces: reproducible local setup, build, validation, architecture, format, and contribution instructions

- [ ] Add fixtures and run the complete test suite.
- [ ] Generate platform icons and verify Tauri configuration references existing files.
- [ ] Document implemented features, known conversion limits, architecture, security reporting, and the no-GitHub-Actions release process.
- [ ] Run `npm run verify` and `cargo check`; record any environment-only blocker exactly.
- [ ] Manually inspect the built frontend at desktop and narrow widths for overflow and unusable controls.
- [ ] Commit with `docs: complete OpenWord foundation release`.

### Task 12: Final repository review and integration

**Files:**
- Review all files changed on `feat/openword-foundation`

**Interfaces:**
- Produces: a merge-ready pull request and merged `main` only after verification

- [ ] Scan for secrets, placeholder text, unimplemented buttons presented as functional, unsafe imported HTML paths, and accidental GitHub Actions workflows.
- [ ] Compare the code against every foundation success criterion in the design spec.
- [ ] Run the full local verification gate again from a clean checkout where the environment permits.
- [ ] Open a pull request with implemented features, test evidence, known limitations, and follow-up milestones.
- [ ] Review the PR diff and merge with squash only if the final gate remains clean.
