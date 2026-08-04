<script lang="ts">
  import { getContext } from "svelte";
  import type { EditorController } from "@/lib/editorController.svelte";
  import { findAll, replaceMatch, replaceAll, selectMatch, type Match } from "@/lib/findReplace";

  let { open = $bindable(false), withReplace = $bindable(false) }: { open?: boolean; withReplace?: boolean } = $props();

  const controller = getContext<EditorController>("editor");

  let query = $state("");
  let replacement = $state("");
  let matchIndex = $state(0);
  let queryInput = $state<HTMLInputElement | undefined>();

  const matches = $derived<Match[]>(query ? findAll(controller.doc, query) : []);

  $effect(() => {
    if (matches.length === 0) {
      matchIndex = 0;
      return;
    }
    if (matchIndex >= matches.length) matchIndex = 0;
    if (controller.view) selectMatch(controller.view, matches[matchIndex]);
  });

  $effect(() => {
    if (open) queryInput?.focus();
  });

  function next() {
    if (matches.length === 0) return;
    matchIndex = (matchIndex + 1) % matches.length;
    if (controller.view) selectMatch(controller.view, matches[matchIndex]);
  }

  function prev() {
    if (matches.length === 0) return;
    matchIndex = (matchIndex - 1 + matches.length) % matches.length;
    if (controller.view) selectMatch(controller.view, matches[matchIndex]);
  }

  function doReplace() {
    if (!controller.view || matches.length === 0) return;
    replaceMatch(controller.view, matches[matchIndex], replacement);
  }

  function doReplaceAll() {
    if (!controller.view) return;
    replaceAll(controller.view, query, replacement);
  }

  function close() {
    open = false;
    controller.focus();
  }
</script>

{#if open}
  <div class="ow-find-bar" role="search">
    <div class="ow-find-row">
      <input
        type="text"
        placeholder="Find in document"
        bind:value={query}
        bind:this={queryInput}
        onkeydown={(e) => {
          if (e.key === "Enter") (e.shiftKey ? prev() : next());
          if (e.key === "Escape") close();
        }}
      />
      <span class="ow-find-count">{matches.length ? `${matchIndex + 1}/${matches.length}` : "0/0"}</span>
      <button class="ow-icon-btn ow-find-nav" title="Previous (Shift+Enter)" onclick={prev} disabled={!matches.length}>▲</button>
      <button class="ow-icon-btn ow-find-nav" title="Next (Enter)" onclick={next} disabled={!matches.length}>▼</button>
      <button class="ow-icon-btn" title="Close (Esc)" onclick={close}>✕</button>
    </div>
    {#if withReplace}
      <div class="ow-find-row">
        <input type="text" placeholder="Replace with" bind:value={replacement} />
        <button class="ow-btn-small" onclick={doReplace} disabled={!matches.length}>Replace</button>
        <button class="ow-btn-small" onclick={doReplaceAll} disabled={!matches.length}>Replace all</button>
      </div>
    {/if}
  </div>
{/if}

<style>
  .ow-find-bar {
    position: absolute;
    top: 8px;
    right: 20px;
    z-index: 30;
    background: var(--ow-chrome-bg);
    border: 1px solid var(--ow-chrome-border);
    border-radius: 8px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .ow-find-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .ow-find-row input {
    background: var(--ow-input-bg);
    border: 1px solid var(--ow-input-border);
    border-radius: 5px;
    color: var(--ow-text);
    padding: 5px 8px;
    font-size: 13px;
    width: 200px;
  }
  .ow-find-count {
    font-size: 11px;
    color: var(--ow-text-muted);
    min-width: 34px;
    text-align: center;
  }
  .ow-btn-small {
    background: var(--ow-hover-bg);
    border: 1px solid var(--ow-chrome-border);
    border-radius: 5px;
    padding: 5px 8px;
    font-size: 12px;
    cursor: pointer;
    color: var(--ow-text);
  }
  .ow-btn-small:hover {
    background: var(--ow-active-bg);
  }
  .ow-find-nav {
    font-size: 9px;
  }
</style>
