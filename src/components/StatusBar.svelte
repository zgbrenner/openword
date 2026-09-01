<script lang="ts">
  import { getContext } from "svelte";
  import type { EditorController } from "@/lib/editorController.svelte";
  import type { ViewState } from "@/lib/viewState.svelte";
  import type { PaginationState } from "@/lib/paginationState.svelte";
  import type { ReviewPanelState } from "@/lib/reviewPanelState.svelte";
  import { findSuggestions } from "@/editor/trackChanges";
  import * as icons from "@/icons";

  const controller = getContext<EditorController>("editor");
  const view = getContext<ViewState>("view");
  const pagination = getContext<PaginationState>("pagination");
  const reviewPanel = getContext<ReviewPanelState>("reviewPanel");

  const zoomPercent = $derived(Math.round(view.zoom * 100));
  const openCommentCount = $derived(controller.comments.filter((t) => !t.resolved).length);
  const suggestionCount = $derived.by(() => {
    void controller.snapshot;
    return findSuggestions(controller.doc, controller.suggestionMeta).length;
  });
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
    <button
      class="ow-status-item ow-status-link"
      class:active={reviewPanel.open && reviewPanel.tab === "comments"}
      title="Comments"
      onclick={() => reviewPanel.toggle("comments")}
    >
      {@html icons.iconComment}
      {openCommentCount}
    </button>
    {#if suggestionCount > 0 || controller.snapshot.suggestingMode}
      <button
        class="ow-status-item ow-status-link"
        class:active={reviewPanel.open && reviewPanel.tab === "changes"}
        title="Tracked changes"
        onclick={() => reviewPanel.toggle("changes")}
      >
        {suggestionCount} change{suggestionCount === 1 ? "" : "s"}
      </button>
    {/if}
  </div>
  <div class="ow-status-right">
    <!-- View options live here rather than in a menu: the web menu bar mirrors
         the native menu in src-tauri/src/menu.rs verbatim and that menu has no
         View entries, so the status bar (which already owns zoom) is the one
         place both platforms can carry them. -->
    <button
      class="ow-status-item ow-status-link"
      class:active={view.showRuler}
      title="Show ruler"
      aria-pressed={view.showRuler}
      onclick={view.toggleRuler}
    >
      Ruler
    </button>
    <select
      class="ow-status-select"
      title="Page size"
      aria-label="Page size"
      value={view.pageSize.name}
      onchange={(e) => view.setPageSize((e.target as HTMLSelectElement).value as "letter" | "a4")}
    >
      <option value="letter">Letter</option>
      <option value="a4">A4</option>
    </select>
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

  .ow-status-link {
    background: transparent;
    border: none;
    color: var(--ow-text-muted);
    font-size: 12px;
    cursor: pointer;
    padding: 2px 5px;
    border-radius: 3px;
  }
  .ow-status-link:hover {
    background: var(--ow-hover-bg);
    color: var(--ow-text);
  }
  .ow-status-link.active {
    background: var(--ow-active-bg);
    color: var(--ow-accent);
  }
  .ow-status-link :global(svg) {
    width: 12px;
    height: 12px;
    vertical-align: -1px;
  }

  .ow-status-btn {
    width: 20px;
    height: 20px;
  }
  .ow-status-btn :global(svg) {
    width: 13px;
    height: 13px;
  }

  .ow-status-select {
    background: var(--ow-input-bg);
    border: 1px solid var(--ow-input-border);
    border-radius: 4px;
    color: var(--ow-text-muted);
    font-size: 11px;
    padding: 1px 3px;
    cursor: pointer;
  }
  .ow-status-select:hover {
    color: var(--ow-text);
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
