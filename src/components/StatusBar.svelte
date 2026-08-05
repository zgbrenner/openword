<script lang="ts">
  import { getContext } from "svelte";
  import type { EditorController } from "@/lib/editorController.svelte";
  import type { ViewState } from "@/lib/viewState.svelte";
  import type { PaginationState } from "@/lib/paginationState.svelte";
  import * as icons from "@/icons";

  const controller = getContext<EditorController>("editor");
  const view = getContext<ViewState>("view");
  const pagination = getContext<PaginationState>("pagination");

  const zoomPercent = $derived(Math.round(view.zoom * 100));
</script>

<div class="ow-status-bar">
  <div class="ow-status-left">
    <span class="ow-status-item" title="Word count">
      {@html icons.iconWordCount}
      {controller.snapshot.wordCount.words} word{controller.snapshot.wordCount.words === 1 ? "" : "s"}
    </span>
    <span class="ow-status-item">{pagination.pageCount} page{pagination.pageCount === 1 ? "" : "s"}</span>
    <span class="ow-status-item ow-status-save" class:dirty={controller.dirty}>
      {controller.dirty ? "Unsaved changes" : "Saved"}
    </span>
  </div>
  <div class="ow-status-right">
    <button class="ow-icon-btn ow-status-btn" title="Zoom out" onclick={view.zoomOut}>{@html icons.iconZoomOut}</button>
    <input
      type="range"
      min="50"
      max="200"
      step="5"
      value={zoomPercent}
      class="ow-zoom-slider"
      oninput={(e) => (view.zoom = Number((e.target as HTMLInputElement).value) / 100)}
      aria-label="Zoom"
    />
    <button class="ow-icon-btn ow-status-btn" title="Zoom in" onclick={view.zoomIn}>{@html icons.iconZoomIn}</button>
    <button class="ow-zoom-label" title="Reset zoom" onclick={view.zoomReset}>{zoomPercent}%</button>
  </div>
</div>

<style>
  .ow-status-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 26px;
    padding: 0 12px;
    background: var(--ow-chrome-bg);
    border-top: 1px solid var(--ow-chrome-border);
    font-size: 12px;
    color: var(--ow-text-muted);
    flex: none;
    -webkit-app-region: no-drag;
  }

  .ow-status-left,
  .ow-status-right {
    display: flex;
    align-items: center;
    gap: 14px;
  }

  .ow-status-item {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .ow-status-item :global(svg) {
    width: 13px;
    height: 13px;
  }

  .ow-status-save.dirty {
    color: #b5872f;
  }

  .ow-status-btn {
    width: 20px;
    height: 20px;
  }
  .ow-status-btn :global(svg) {
    width: 13px;
    height: 13px;
  }

  .ow-zoom-slider {
    width: 90px;
    accent-color: var(--ow-accent);
  }

  .ow-zoom-label {
    width: 42px;
    background: transparent;
    border: none;
    color: var(--ow-text-muted);
    cursor: pointer;
    font-size: 12px;
  }
  .ow-zoom-label:hover {
    color: var(--ow-text);
  }
</style>
