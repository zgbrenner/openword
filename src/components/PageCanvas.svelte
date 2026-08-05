<script lang="ts">
  import { onMount, onDestroy, getContext } from "svelte";
  import { geometryFor, computeBreaks, type PageBreak } from "@/editor/pagination";
  import type { EditorController } from "@/lib/editorController.svelte";
  import type { ViewState } from "@/lib/viewState.svelte";
  import type { PaginationState } from "@/lib/paginationState.svelte";

  const controller = getContext<EditorController>("editor");
  const view = getContext<ViewState>("view");
  const pagination = getContext<PaginationState>("pagination");

  let mountEl: HTMLDivElement;
  let resizeObserver: ResizeObserver;
  let pageBreaks = $state<PageBreak[]>([]);

  const geometry = $derived(geometryFor(view.pageSize));

  function recomputeBreaks() {
    if (!mountEl) return;
    const totalHeight = mountEl.scrollHeight;
    const inner = Math.max(0, totalHeight - geometry.marginPx * 2);
    const { breaks, pageCount: count } = computeBreaks(inner, geometry);
    pageBreaks = breaks.map((b) => ({ ...b, offsetPx: b.offsetPx + geometry.marginPx }));
    pagination.pageCount = count;
  }

  onMount(() => {
    controller.attach(mountEl);
    recomputeBreaks();
    resizeObserver = new ResizeObserver(() => recomputeBreaks());
    resizeObserver.observe(mountEl);
  });

  onDestroy(() => {
    resizeObserver?.disconnect();
  });

  $effect(() => {
    // Re-run when page size changes.
    void geometry;
    recomputeBreaks();
  });
</script>

<div class="ow-page-scroll">
  <div class="ow-page-stack" style={`transform: scale(${view.zoom}); width:${geometry.pageWidthPx}px`}>
    <div class="ow-page-wrapper" style={`width:${geometry.pageWidthPx}px`}>
      <div
        bind:this={mountEl}
        class="ow-page-content"
        style={`width:${geometry.pageWidthPx}px; min-height:${geometry.pageHeightPx}px; padding:${geometry.marginPx}px`}
      ></div>
      <div class="ow-page-breaks" aria-hidden="true">
        {#each pageBreaks as brk (brk.pageNumber)}
          <div class="ow-page-break-marker" style={`top:${brk.offsetPx}px`}>
            <span class="ow-page-break-label">Page {brk.pageNumber}</span>
          </div>
        {/each}
      </div>
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

  :global(.ow-page-content.ow-prosemirror),
  .ow-page-content {
    background: var(--ow-page-bg);
    box-shadow: var(--ow-page-shadow);
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

  .ow-page-breaks {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  .ow-page-break-marker {
    position: absolute;
    left: 0;
    right: 0;
    height: 26px;
    margin-top: -13px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .ow-page-break-marker::before {
    content: "";
    position: absolute;
    left: 0;
    right: 0;
    top: 50%;
    border-top: 2px dashed rgba(120, 128, 145, 0.45);
  }
  .ow-page-break-label {
    position: relative;
    background: var(--ow-bg);
    color: var(--ow-text-muted);
    font-size: 10px;
    padding: 2px 8px;
    border-radius: 999px;
    border: 1px solid var(--ow-chrome-border);
  }

  .ow-page-footer {
    text-align: center;
    color: var(--ow-text-muted);
    font-size: 11px;
    margin-top: 10px;
  }
</style>
