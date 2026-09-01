<script lang="ts">
  import { getContext, untrack } from "svelte";
  import type { EditorController } from "@/lib/editorController.svelte";
  import { findAll, replaceMatch, replaceAll, selectMatch, type Match } from "@/lib/findReplace";

  let { open = $bindable(false), withReplace = $bindable(false) }: { open?: boolean; withReplace?: boolean } = $props();

  const controller = getContext<EditorController>("editor");

  let query = $state("");
  let replacement = $state("");
  let matchIndex = $state(0);
  let queryInput = $state<HTMLInputElement | undefined>();

  // controller.doc reads through the EditorView, which is not $state, so the
  // match list has to be pinned to the snapshot the controller republishes on
  // every transaction. Without that, every position below survives the edit
  // that invalidated it: after one Replace the remaining matches still point
  // at the pre-replacement document, and selecting one can address a position
  // past the end of the new document.
  const matches = $derived.by<Match[]>(() => {
    void controller.snapshot;
    return query ? findAll(controller.doc, query) : [];
  });

  // Display only: the live index can briefly sit past the end of a shrinking
  // match list, and "0/0" is what an empty result reads as.
  const displayIndex = $derived(matches.length === 0 ? 0 : Math.min(matchIndex, matches.length - 1) + 1);

  $effect(() => {
    if (!open) return;
    queryInput?.focus();
    // Reopening the bar on a query typed earlier jumps back to the first
    // match. Untracked deliberately: this effect must depend on `open` alone.
    // Reading the query or the match list here would make an effect that
    // dispatches a selection re-run on the transaction it just dispatched,
    // which is a loop — every other selection is driven from an event handler.
    untrack(() => goTo(0));
  });

  /**
   * Positions read straight out of the live document rather than out of the
   * rendered `matches`. Every navigation and replacement goes through this:
   * a reactive list is still a list captured at render time, and a single
   * replacement shifts, merges or removes everything after it.
   */
  function liveMatches(): Match[] {
    return query ? findAll(controller.doc, query) : [];
  }

  function clampIndex(index: number, length: number): number {
    if (length === 0) return 0;
    return ((index % length) + length) % length;
  }

  /** Wrap `index` into the live match list and select whatever is there now. */
  function goTo(index: number): void {
    const live = liveMatches();
    if (live.length === 0) {
      matchIndex = 0;
      return;
    }
    matchIndex = clampIndex(index, live.length);
    if (controller.view) selectMatch(controller.view, live[matchIndex]);
  }

  function next(): void {
    goTo(matchIndex + 1);
  }

  function prev(): void {
    goTo(matchIndex - 1);
  }

  function onQueryInput(value: string): void {
    query = value;
    goTo(0);
  }

  function doReplace(): void {
    const live = liveMatches();
    if (!controller.view || live.length === 0) return;
    const target = live[clampIndex(matchIndex, live.length)];
    replaceMatch(controller.view, target, replacement);
    // Re-find against the rewritten document and land on the first occurrence
    // that starts after the text just written — never on a stale position, and
    // never on the replacement itself when it happens to contain the query.
    const after = target.from + replacement.length;
    const remaining = liveMatches();
    const following = remaining.findIndex((m) => m.from >= after);
    goTo(following === -1 ? 0 : following);
  }

  function doReplaceAll(): void {
    if (!controller.view) return;
    replaceAll(controller.view, query, replacement);
    matchIndex = 0;
  }

  function close(): void {
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
        value={query}
        bind:this={queryInput}
        oninput={(e) => onQueryInput((e.target as HTMLInputElement).value)}
        onkeydown={(e) => {
          if (e.key === "Enter") (e.shiftKey ? prev() : next());
          if (e.key === "Escape") close();
        }}
      />
      <span class="ow-find-count">{matches.length ? `${displayIndex}/${matches.length}` : "0/0"}</span>
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
