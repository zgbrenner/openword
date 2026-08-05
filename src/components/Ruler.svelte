<script lang="ts">
  import { getContext } from "svelte";
  import { geometryFor, CSS_PX_PER_INCH } from "@/editor/pagination";
  import type { ViewState } from "@/lib/viewState.svelte";
  import type { EditorController } from "@/lib/editorController.svelte";

  const view = getContext<ViewState>("view");
  const controller = getContext<EditorController>("editor");

  const geometry = $derived(geometryFor(view.pageSize));
  const widthIn = $derived(view.pageSize.widthIn);
  const ticks = $derived(Array.from({ length: Math.floor(widthIn) + 1 }, (_, i) => i));

  let dragging = $state(false);

  function indentToPx(indent: number) {
    return indent * 24;
  }

  function onIndentPointerDown(e: PointerEvent) {
    dragging = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  // Pointer capture (set above) routes subsequent move/up events to this same
  // element regardless of where the cursor physically is, so these handlers
  // stay on the handle itself rather than needing a listener on the track.
  function onIndentPointerMove(e: PointerEvent) {
    if (!dragging) return;
    const track = (e.currentTarget as HTMLElement).closest(".ow-ruler-track") as HTMLElement;
    const rect = track.getBoundingClientRect();
    const relativeX = (e.clientX - rect.left) / view.zoom;
    const level = Math.round(relativeX / 24);
    const current = controller.snapshot.block.indent;
    const clamped = Math.max(0, Math.min(8, level));
    if (clamped > current) controller.indent();
    else if (clamped < current) controller.outdent();
  }

  function onIndentPointerUp(e: PointerEvent) {
    dragging = false;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  }
</script>

{#if view.showRuler}
  <div class="ow-ruler" style={`width:${geometry.pageWidthPx * view.zoom}px`}>
    <div class="ow-ruler-margin ow-ruler-margin-left" style={`width:${geometry.marginPx * view.zoom}px`}></div>
    <div
      class="ow-ruler-track"
      style={`left:${geometry.marginPx * view.zoom}px; width:${geometry.contentWidthPx * view.zoom}px`}
    >
      {#each ticks as inch (inch)}
        <div class="ow-ruler-tick" style={`left:${inch * CSS_PX_PER_INCH * view.zoom}px`}>
          {#if inch > 0}<span>{inch}</span>{/if}
        </div>
      {/each}
      <div
        class="ow-ruler-indent"
        style={`left:${indentToPx(controller.snapshot.block.indent) * view.zoom}px`}
        title="Drag to change indent"
        onpointerdown={onIndentPointerDown}
        onpointermove={onIndentPointerMove}
        onpointerup={onIndentPointerUp}
        role="slider"
        aria-label="Paragraph indent"
        aria-valuenow={controller.snapshot.block.indent}
        aria-valuemin={0}
        aria-valuemax={8}
        tabindex="0"
      >
        <svg width="12" height="10" viewBox="0 0 12 10"><path d="M0 0 L12 0 L6 10 Z" fill="currentColor"/></svg>
      </div>
    </div>
    <div class="ow-ruler-margin ow-ruler-margin-right" style={`width:${geometry.marginPx * view.zoom}px`}></div>
  </div>
{/if}

<style>
  .ow-ruler {
    display: flex;
    height: 22px;
    margin: 6px auto 0;
    position: relative;
    background: var(--ow-chrome-bg);
    border: 1px solid var(--ow-chrome-border);
    border-bottom: none;
    border-radius: 4px 4px 0 0;
    font-size: 10px;
    color: var(--ow-text-muted);
    user-select: none;
  }
  .ow-ruler-margin {
    background: var(--ow-hover-bg);
    flex: none;
  }
  .ow-ruler-margin-left {
    border-radius: 4px 0 0 0;
  }
  .ow-ruler-margin-right {
    border-radius: 0 4px 0 0;
  }
  .ow-ruler-track {
    position: absolute;
    top: 0;
    height: 100%;
  }
  .ow-ruler-tick {
    position: absolute;
    top: 0;
    bottom: 0;
    border-left: 1px solid var(--ow-chrome-border);
  }
  .ow-ruler-tick span {
    position: absolute;
    left: 3px;
    top: 4px;
  }
  .ow-ruler-indent {
    position: absolute;
    top: 10px;
    color: var(--ow-accent);
    cursor: ew-resize;
    transform: translateX(-6px);
    touch-action: none;
  }
</style>
