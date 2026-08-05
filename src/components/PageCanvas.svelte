<script lang="ts">
  import { onMount, getContext } from "svelte";
  import { geometryFor } from "@/editor/pagination";
  import type { EditorController } from "@/lib/editorController.svelte";
  import type { ViewState } from "@/lib/viewState.svelte";
  import type { PaginationState } from "@/lib/paginationState.svelte";

  const controller = getContext<EditorController>("editor");
  const view = getContext<ViewState>("view");
  const pagination = getContext<PaginationState>("pagination");

  let mountEl: HTMLDivElement;

  const geometry = $derived(geometryFor(view.pageSize));
  // Real gray gap between two separate page sheets: bottom margin of page N
  // + top margin of page N+1 (see paginationPlugin.ts's measure(), which
  // reflows content using this exact same constant so the ProseMirror
  // content's decorated gaps line up with the sheet gaps drawn here).
  const gapHeight = $derived(2 * geometry.marginPx);
  // Vertical distance from one page sheet's top-left to the next's.
  const pageAdvance = $derived(geometry.pageHeightPx + gapHeight);
  const pageIndices = $derived(Array.from({ length: pagination.pageCount }, (_, i) => i));
  const stackHeight = $derived(pagination.pageCount * pageAdvance - gapHeight);

  onMount(() => {
    controller.attach(mountEl);
  });

  // Page size and zoom are plain Svelte state, not ProseMirror transactions
  // — the pagination plugin can't see them change on its own, so push
  // updates in explicitly. Re-runs whenever `geometry` (derived from
  // view.pageSize) or view.zoom changes.
  $effect(() => {
    controller.setPaginationGeometry(geometry, view.zoom);
  });
</script>

<div class="ow-page-scroll">
  <div class="ow-page-stack" style={`transform: scale(${view.zoom}); width:${geometry.pageWidthPx}px`}>
    <div class="ow-page-wrapper" style={`width:${geometry.pageWidthPx}px; min-height:${stackHeight}px`}>
      {#each pageIndices as n (n)}
        <div
          class="ow-page-sheet"
          aria-hidden="true"
          style={`top:${n * pageAdvance}px; width:${geometry.pageWidthPx}px; height:${geometry.pageHeightPx}px`}
        ></div>
      {/each}
      <div
        bind:this={mountEl}
        class="ow-page-content"
        style={`width:${geometry.pageWidthPx}px; padding:${geometry.marginPx}px`}
      ></div>
    </div>
    <div class="ow-page-footer">{pagination.pageCount} page{pagination.pageCount === 1 ? "" : "s"}</div>
  </div>
</div>

<style>
  .ow-page-scroll {
    flex: 1;
    overflow: auto;
    background: var(--ow-bg);
    display: flex;
    justify-content: center;
    padding: 28px 24px 80px;
  }

  .ow-page-stack {
    transform-origin: top center;
    flex: none;
  }

  .ow-page-wrapper {
    position: relative;
    flex: none;
  }

  /* v2 pagination: separate white "sheet" rectangles, one per page, with a
     real gray gap (var(--ow-bg) shows through) between them — see
     paginationPlugin.ts for the content-side reflow that keeps text out of
     these gaps. Purely decorative background, behind the actual editable
     content below. */
  .ow-page-sheet {
    position: absolute;
    left: 0;
    background: var(--ow-page-bg);
    box-shadow: var(--ow-page-shadow);
    border-radius: 2px;
    pointer-events: none;
  }

  :global(.ow-page-content.ow-prosemirror),
  .ow-page-content {
    position: relative;
    z-index: 1;
    background: transparent;
    color: #14161c;
    font-family: var(--ow-font-doc);
    font-size: 12pt;
    line-height: 1.4;
    outline: none;
  }

  :global(.ow-prosemirror p) {
    margin: 0 0 8pt 0;
  }

  :global(.ow-prosemirror h1),
  :global(.ow-prosemirror h2),
  :global(.ow-prosemirror h3),
  :global(.ow-prosemirror h4),
  :global(.ow-prosemirror h5),
  :global(.ow-prosemirror h6) {
    margin: 16pt 0 8pt 0;
    font-weight: 600;
    line-height: 1.2;
  }
  :global(.ow-prosemirror h1) { font-size: 22pt; }
  :global(.ow-prosemirror h2) { font-size: 18pt; }
  :global(.ow-prosemirror h3) { font-size: 15pt; }
  :global(.ow-prosemirror h4) { font-size: 13pt; }
  :global(.ow-prosemirror h5) { font-size: 12pt; }
  :global(.ow-prosemirror h6) { font-size: 11pt; }

  :global(.ow-prosemirror table) {
    border-collapse: collapse;
    margin: 8pt 0;
    table-layout: fixed;
    width: 100%;
  }
  :global(.ow-prosemirror td),
  :global(.ow-prosemirror th) {
    border: 1px solid #b9bec9;
    padding: 4pt 6pt;
    vertical-align: top;
  }
  :global(.ow-prosemirror th) {
    background: #f3f4f7;
    font-weight: 600;
  }

  :global(.ow-prosemirror img) {
    max-width: 100%;
  }

  :global(.ow-page-break) {
    border-top: 1px dashed #9aa0ac;
    margin: 10pt 0;
    padding-top: 2pt;
    font-size: 8pt;
    color: #9aa0ac;
    user-select: none;
  }

  :global(.ow-prosemirror ul),
  :global(.ow-prosemirror ol) {
    margin: 0 0 8pt 0;
    padding-left: 26px;
  }

  /* Comment anchors and track-changes marks — baseline styling; the
     dedicated review UI (margin cards, per-change accept/reject) layers
     interaction on top of this, not visual replacement. */
  :global(.ow-prosemirror .ow-comment-anchor) {
    background: rgba(255, 212, 60, 0.35);
    border-bottom: 2px solid rgba(214, 158, 0, 0.7);
  }
  :global(.ow-prosemirror .ow-comment-anchor.ow-comment-resolved) {
    background: transparent;
    border-bottom-color: rgba(154, 160, 172, 0.5);
  }
  :global(.ow-prosemirror ins[data-id]) {
    color: #1a7f37;
    background: rgba(26, 127, 55, 0.08);
    text-decoration: underline;
    text-decoration-color: #1a7f37;
  }
  :global(.ow-prosemirror del[data-id]) {
    color: #c0392b;
    background: rgba(192, 57, 43, 0.08);
    text-decoration: line-through;
    text-decoration-color: #c0392b;
  }

  .ow-page-footer {
    text-align: center;
    color: var(--ow-text-muted);
    font-size: 11px;
    margin-top: 10px;
  }
</style>
