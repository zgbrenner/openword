// v2 pagination: real reflow via measure -> decorate -> (browser re-lays-out).
//
// We keep ONE ProseMirror document / ONE contenteditable (see ARCHITECTURE.md
// "Pagination" — a genuine multi-container-per-page architecture is a v3
// rewrite). Instead we make the single flowing column LOOK like separate
// pages by measuring, after each doc-changing update, the rendered top
// offset of every top-level block and pushing (via a `margin-top` node
// decoration) any block that would otherwise straddle a page boundary down
// to the top of the next page's content area. Decorations are purely
// visual — Decoration.node only adds a `style` attribute to the block's
// existing DOM node, it never touches document positions — so selection,
// editing, gapCursor/dropCursor and prosemirror-tables all keep working
// unmodified.
//
// Algorithm (see measure() below for the full derivation in comments):
//   1. Walk state.doc's top-level children in order. For each one, read its
//      rendered top/height via getBoundingClientRect (unscaled by the
//      current zoom — see PaginationRuntime).
//   2. Because the DOM may already carry margin-top decorations from the
//      previous pass, subtract out that block's own previously-applied
//      margin (cumulatively) to recover its "natural" flow position, i.e.
//      the position it would render at with zero pagination decorations.
//      This is what keeps the whole thing a single measure-and-decorate
//      pass per doc change instead of an iterative remeasure loop: we
//      always compute the *next* decoration set from ground truth, never
//      incrementally on top of our own previous output, so nothing can
//      runaway/oscillate.
//   3. Accumulate natural height against the page's content budget
//      (geometry.contentHeightPerPagePx). A block that would cross the
//      budget gets pushed (whole node, never split) to the exact top of
//      the next page's content area.
//   4. An explicit `page_break` node forces the *next* block to start a new
//      page in addition to overflow-based breaks (see forcePageBreakNext
//      below) — matching Word's behavior where the break itself just sits
//      inline and everything after it jumps.
//   5. A block taller than one full page is a documented limitation (see
//      ARCHITECTURE.md): it is never split, so it overflows past the page
//      boundary. We still advance the page-count bookkeeping by however
//      many page-heights its natural height spans, so later content and
//      the page counter stay roughly sane.

import { Plugin, PluginKey } from "prosemirror-state";
import type { EditorState, Transaction } from "prosemirror-state";
import { Decoration, DecorationSet, type EditorView } from "prosemirror-view";
import { schema } from "./schema";
import type { PageGeometry } from "./pagination";

export interface PaginationPluginState {
  decorations: DecorationSet;
  pageCount: number;
}

export const paginationPluginKey = new PluginKey<PaginationPluginState>("ow-pagination");

/** Sub-pixel tolerance so float rounding across passes can't cause flicker. */
const EPS = 0.5;

/**
 * Mutable, long-lived control channel between the Svelte layer (which knows
 * about page size / zoom, both plain Svelte state, not ProseMirror state)
 * and the plugin instance (which is recreated every time buildEditorState()
 * runs, e.g. on File > Open). Owned by EditorController so it survives
 * across document reloads; the plugin's view() re-binds itself to whatever
 * runtime instance it was constructed with on every mount.
 */
export class PaginationRuntime {
  private geometry: PageGeometry;
  private zoom: number;
  private scheduler: (() => void) | null = null;
  private onPageCountCb: (count: number) => void;

  constructor(geometry: PageGeometry, zoom: number, onPageCount: (count: number) => void = () => {}) {
    this.geometry = geometry;
    this.zoom = zoom;
    this.onPageCountCb = onPageCount;
  }

  getConfig(): { geometry: PageGeometry; zoom: number } {
    return { geometry: this.geometry, zoom: this.zoom };
  }

  /** Called by the Svelte layer whenever page size or zoom changes. */
  setGeometry(geometry: PageGeometry, zoom: number) {
    this.geometry = geometry;
    this.zoom = zoom;
    this.scheduler?.();
  }

  reportPageCount(count: number) {
    this.onPageCountCb(count);
  }

  /** @internal wired up by the plugin's view() on mount. */
  _bindScheduler(fn: () => void) {
    this.scheduler = fn;
  }

  /** @internal */
  _unbindScheduler(fn: () => void) {
    if (this.scheduler === fn) this.scheduler = null;
  }
}

/**
 * Read back the margin-top (px) this plugin baked into a block's DOM node
 * on the previous pass, if any. We read it straight off the live DOM's
 * inline style rather than querying our own DecorationSet: `Decoration`
 * doesn't publicly expose its `spec` on the objects `DecorationSet.find()`
 * returns (only `from`/`to` are public), and — a sharper problem —
 * `DecorationSet.find(pos, pos)` uses a closed-interval overlap test
 * (`from <= pos && to >= pos`), which also matches the *previous* sibling's
 * decoration when its `to` lands exactly on this block's `from` (adjacent
 * top-level nodes are always contiguous in ProseMirror, so that happens on
 * every block). Reading `dom.style.marginTop` sidesteps both issues: our
 * decoration is the only thing that ever sets an inline `margin-top` on
 * these nodes (the schema's own `toDOM` only ever sets align/indent/line
 * -height inline styles), so it's an unambiguous, per-element source of
 * truth for exactly what's currently baked into that one node.
 */
function bakedMarginAt(dom: HTMLElement): number {
  const raw = dom.style.marginTop;
  if (!raw) return 0;
  const value = parseFloat(raw);
  return Number.isFinite(value) ? value : 0;
}

function measure(view: EditorView, runtime: PaginationRuntime) {
  const { geometry, zoom: rawZoom } = runtime.getConfig();
  const zoom = rawZoom > 0 ? rawZoom : 1;
  const state = view.state;
  const pState = paginationPluginKey.getState(state);
  if (!pState) return;

  const pageContentHeight = geometry.contentHeightPerPagePx;
  if (!(pageContentHeight > 0)) {
    // Degenerate geometry (shouldn't happen with real page sizes) — bail
    // out to a single page rather than dividing by zero / looping forever.
    if (pState.decorations !== DecorationSet.empty || pState.pageCount !== 1) {
      dispatchResult(view, DecorationSet.empty, 1);
    }
    runtime.reportPageCount(1);
    return;
  }

  const marginPx = geometry.marginPx;
  const gapHeight = 2 * marginPx; // bottom margin of page N + top margin of page N+1
  const pageAdvance = geometry.pageHeightPx + gapHeight; // rendered content-start-to-content-start distance
  const contentRect = view.dom.getBoundingClientRect();

  // Reference origin is view.dom's own top edge. Note view.dom (the actual
  // contenteditable ProseMirror creates) is a *child* PageCanvas's mount div
  // — EditorView(place, ...) appends its dom into `place` rather than using
  // it directly — and the page's top margin is CSS padding on that outer
  // wrapper, not on view.dom itself. So view.dom's top edge already *is*
  // page 1's content-area start; no marginPx offset needed here.
  let pageContentStartNatural = 0;
  let pageCount = 1;
  let cumulativeBaked = 0;
  let forcePageBreakNext = false;
  const decorations: Decoration[] = [];

  state.doc.forEach((node, offset) => {
    const pos = offset;
    const dom = view.nodeDOM(pos);
    if (!(dom instanceof HTMLElement)) return;

    cumulativeBaked += bakedMarginAt(dom);

    const rect = dom.getBoundingClientRect();
    const naturalTop = (rect.top - contentRect.top) / zoom - cumulativeBaked;
    const height = rect.height / zoom;

    const forceBreak = forcePageBreakNext;
    forcePageBreakNext = node.type === schema.nodes.page_break;

    let offsetWithinPage = naturalTop - pageContentStartNatural;
    let bottomWithinPage = offsetWithinPage + height;

    if ((forceBreak || bottomWithinPage > pageContentHeight + EPS) && offsetWithinPage > EPS) {
      const push = Math.round((pageAdvance - offsetWithinPage) * 100) / 100;
      decorations.push(
        Decoration.node(
          pos,
          pos + node.nodeSize,
          { style: `margin-top: ${push}px` },
          { owPagination: true, margin: push },
        ),
      );
      pageContentStartNatural = naturalTop;
      pageCount += 1;
      offsetWithinPage = 0;
      bottomWithinPage = height;
    }

    // A block taller than one page's content budget (huge image/table): we
    // never split it (see module doc comment / ARCHITECTURE.md), just let
    // it overflow. Advance the natural-space bookkeeping and page count by
    // however many page-heights it spans so later blocks and the page
    // counter stay reasonable. We can't know exactly which page its bottom
    // visually lands on relative to the sheet stack (that would require
    // solving the same line-level reflow this whole approach defers to
    // v3), so force the *next* block onto a fresh page rather than risk it
    // rendering inside whatever gap the oversized block's overflow crosses.
    if (bottomWithinPage > pageContentHeight + EPS) {
      const additionalPages = Math.max(0, Math.ceil((bottomWithinPage - EPS) / pageContentHeight) - 1);
      if (additionalPages > 0) {
        pageContentStartNatural += additionalPages * pageContentHeight;
        pageCount += additionalPages;
        forcePageBreakNext = true;
      }
    }
  });

  if (forcePageBreakNext) pageCount += 1; // trailing page break -> one more (empty) page

  const unchanged =
    decorations.length === 0 && pState.decorations === DecorationSet.empty && pState.pageCount === pageCount;
  if (!unchanged) {
    const newSet = decorations.length ? DecorationSet.create(state.doc, decorations) : DecorationSet.empty;
    dispatchResult(view, newSet, pageCount);
  }
  runtime.reportPageCount(pageCount);
}

function dispatchResult(view: EditorView, decorations: DecorationSet, pageCount: number) {
  // Deliberately NOT going through view.dispatch — this editor's
  // dispatchTransaction is wired (in editorView.ts) to mark the document
  // dirty and recompute snapshots/suggestion metadata on every transaction.
  // A pagination remeasure is a pure rendering side effect, not a document
  // edit, so we bypass that pipeline with the lower-level updateState call
  // (still the standard, public ProseMirror way to apply a transaction to a
  // view without going through a custom dispatch hook).
  const tr: Transaction = view.state.tr.setMeta(paginationPluginKey, { decorations, pageCount });
  tr.setMeta("addToHistory", false);
  view.updateState(view.state.apply(tr));
}

export function paginationPlugin(runtime: PaginationRuntime): Plugin<PaginationPluginState> {
  return new Plugin<PaginationPluginState>({
    key: paginationPluginKey,
    state: {
      init: (): PaginationPluginState => ({ decorations: DecorationSet.empty, pageCount: 1 }),
      apply(tr, value): PaginationPluginState {
        const meta = tr.getMeta(paginationPluginKey);
        if (meta) return meta as PaginationPluginState;
        if (!tr.docChanged) return value;
        return { decorations: value.decorations.map(tr.mapping, tr.doc), pageCount: value.pageCount };
      },
    },
    props: {
      decorations(state: EditorState) {
        return paginationPluginKey.getState(state)?.decorations ?? DecorationSet.empty;
      },
    },
    view(editorView) {
      let rafId: number | null = null;
      let destroyed = false;

      function scheduleMeasure() {
        if (destroyed || rafId != null) return;
        rafId = requestAnimationFrame(() => {
          rafId = null;
          if (!destroyed) measure(editorView, runtime);
        });
      }

      // Initial measurement on mount (covers documents loaded before the
      // Svelte layer has a chance to push a geometry update).
      scheduleMeasure();
      runtime._bindScheduler(scheduleMeasure);

      // Content can change height without a doc-changing transaction — an
      // <img> finishing an async decode, or a web font swapping in. Catch
      // those too. This can also fire once as an echo of our own decoration
      // pass (adding margin-top grows view.dom's own height); that's safe,
      // not a runaway: measure()'s "unchanged" check makes the follow-up
      // pass a no-op once positions have already converged.
      const resizeObserver = new ResizeObserver(() => scheduleMeasure());
      resizeObserver.observe(editorView.dom);

      return {
        update(view, prevState) {
          // Only doc changes need remeasuring here — page size/zoom changes
          // come in through runtime.setGeometry() (see PageCanvas.svelte),
          // which calls the same scheduler directly. Skipping remeasure on
          // our own decoration-only updates (doc unchanged) is what keeps
          // this a single measure-and-decorate pass instead of a loop.
          if (view.state.doc !== prevState.doc) scheduleMeasure();
        },
        destroy() {
          resizeObserver.disconnect();
          destroyed = true;
          if (rafId != null) cancelAnimationFrame(rafId);
          runtime._unbindScheduler(scheduleMeasure);
        },
      };
    },
  });
}
