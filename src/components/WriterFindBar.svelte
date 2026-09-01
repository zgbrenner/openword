<script lang="ts">
  import type { WriterClient } from "@/writer/client";

  let { client, onclose, onerror }: {
    client: WriterClient | null;
    onclose: () => void;
    onerror: (error: unknown) => void;
  } = $props();

  let query = $state("");
  let replacement = $state("");
  let matchCase = $state(false);
  let wholeWords = $state(false);
  let busy = $state(false);
  let status = $state("");
  let searchInput = $state<HTMLInputElement | undefined>();

  const disabled = $derived(client === null || query.length === 0);

  // Autofocus the search input as soon as the bar mounts.
  $effect(() => {
    searchInput?.focus();
  });

  async function run(action: (active: WriterClient) => Promise<void>): Promise<void> {
    // Ignore re-entrant triggers while a call is in flight.
    if (busy || client === null || query.length === 0) return;
    busy = true;
    try {
      await action(client);
    } catch (error) {
      onerror(error);
    } finally {
      busy = false;
    }
  }

  function findStep(backwards: boolean): void {
    void run(async (active) => {
      const result = await active.find({ query, matchCase, wholeWords, backwards });
      if (!result.found) status = "No matches";
      else if (result.wrapped) status = "Reached the end — continued from the start";
      else status = "";
    });
  }

  function replaceCurrent(): void {
    void run(async (active) => {
      const result = await active.replaceNext({ query, replacement, matchCase, wholeWords });
      if (result.replaced && !result.found) status = "Replaced — no more matches";
      else if (!result.found) status = "No matches";
      else if (result.wrapped) status = "Reached the end — continued from the start";
      else status = "";
    });
  }

  function replaceEverywhere(): void {
    void run(async (active) => {
      const result = await active.replaceAll({ query, replacement, matchCase, wholeWords });
      status = result.replaced === 1 ? "Replaced 1 occurrence" : `Replaced ${result.replaced} occurrences`;
    });
  }

  function handleBarKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      event.preventDefault();
      onclose();
    }
  }

  function handleSearchKeydown(event: KeyboardEvent): void {
    if (event.key === "Enter") {
      event.preventDefault();
      findStep(event.shiftKey);
    }
  }

  function handleReplaceKeydown(event: KeyboardEvent): void {
    if (event.key === "Enter") {
      event.preventDefault();
      replaceCurrent();
    }
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="find-bar" role="search" aria-label="Find and replace" onkeydown={handleBarKeydown}>
  <div class="cluster">
    <input
      class="text"
      type="text"
      placeholder="Find in document"
      aria-label="Find in document"
      spellcheck="false"
      autocomplete="off"
      bind:value={query}
      bind:this={searchInput}
      onkeydown={handleSearchKeydown}
    />
    <button
      class="nav"
      type="button"
      aria-label="Previous match"
      title="Previous match (Shift+Enter)"
      {disabled}
      onclick={() => findStep(true)}
    >
      <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3 5 8l5 5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" /></svg>
    </button>
    <button
      class="nav"
      type="button"
      aria-label="Next match"
      title="Next match (Enter)"
      {disabled}
      onclick={() => findStep(false)}
    >
      <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3 5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" /></svg>
    </button>
  </div>

  <label class="check">
    <input type="checkbox" bind:checked={matchCase} disabled={client === null} />
    <span>Match case</span>
  </label>
  <label class="check">
    <input type="checkbox" bind:checked={wholeWords} disabled={client === null} />
    <span>Whole words</span>
  </label>

  <div class="cluster">
    <input
      class="text"
      type="text"
      placeholder="Replace with"
      aria-label="Replace with"
      spellcheck="false"
      autocomplete="off"
      bind:value={replacement}
      onkeydown={handleReplaceKeydown}
    />
    <button class="action" type="button" {disabled} onclick={replaceCurrent}>Replace</button>
    <button class="action" type="button" {disabled} onclick={replaceEverywhere}>Replace all</button>
  </div>

  <div class="status" role="status" aria-live="polite">{status}</div>

  <button class="close" type="button" aria-label="Close find and replace" title="Close (Esc)" onclick={onclose}>
    <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 4 8 8m0-8-8 8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" /></svg>
  </button>
</div>

<style>
  .find-bar {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 4px 10px;
    width: 100%;
    min-height: 36px;
    padding: 3px 8px;
    border-bottom: 1px solid var(--ow-chrome-border);
    background: var(--ow-chrome-bg);
    color: var(--ow-text);
    font-size: 12px;
  }
  .cluster {
    display: flex;
    align-items: center;
    gap: 3px;
  }
  .text {
    width: 190px;
    height: 26px;
    padding: 0 8px;
    border: 1px solid var(--ow-input-border);
    border-radius: var(--ow-radius, 5px);
    background: var(--ow-input-bg);
    color: var(--ow-text);
    font-size: 12px;
    font-family: inherit;
  }
  .text::placeholder {
    color: var(--ow-text-muted);
  }
  button {
    border: none;
    background: transparent;
    color: var(--ow-text);
    font-family: inherit;
    cursor: pointer;
  }
  .nav,
  .close {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border-radius: var(--ow-radius, 5px);
    flex: none;
  }
  .nav svg,
  .close svg {
    width: 14px;
    height: 14px;
  }
  .action {
    height: 26px;
    padding: 0 9px;
    border: 1px solid var(--ow-chrome-border);
    border-radius: var(--ow-radius, 5px);
    background: var(--ow-hover-bg);
    font-size: 11.5px;
    white-space: nowrap;
  }
  .nav:hover:not(:disabled),
  .close:hover {
    background: var(--ow-hover-bg);
  }
  .action:hover:not(:disabled) {
    background: var(--ow-active-bg);
  }
  button:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .check {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 11px;
    color: var(--ow-text-muted);
    white-space: nowrap;
    cursor: pointer;
    user-select: none;
  }
  .check input {
    margin: 0;
    accent-color: var(--ow-accent);
  }
  .check input:disabled + span {
    opacity: 0.5;
  }
  .status {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: right;
    font-size: 11px;
    color: var(--ow-text-muted);
  }
  input:focus-visible,
  button:focus-visible {
    outline: 2px solid var(--ow-accent);
    outline-offset: 1px;
  }

  /* On narrow screens the bar folds into two tight rows: find on the first, replace on the second. */
  @media (max-width: 760px) {
    .find-bar {
      row-gap: 3px;
      padding-top: 4px;
      padding-bottom: 4px;
    }
    .text {
      width: 150px;
    }
    .status {
      flex-basis: 100%;
      order: 10;
      text-align: left;
    }
    .status:empty {
      display: none;
    }
  }
</style>
