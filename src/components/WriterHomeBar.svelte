<script lang="ts">
  import type { WriterClient } from "@/writer/client";
  import type { WriterCommand } from "@/writer/protocol";
  import type { WriterState } from "@/writer/state.svelte";

  export let client: WriterClient | null;
  export let state: WriterState;
  export let onsave: () => void;

  async function execute(command: WriterCommand) {
    if (!client || !state.ready) return;
    await client.execute(command);
    requestAnimationFrame(() => document.getElementById("qtcanvas")?.focus());
  }
</script>

<nav class="ow-writer-home" aria-label="Home">
  <div class="ow-writer-group" aria-label="File and history">
    <button type="button" title="Save" disabled={!client || !state.ready} on:click={onsave}>Save</button>
    <button type="button" title="Undo" disabled={!client || !state.ready} on:click={() => execute({ type: "history.undo" })}>Undo</button>
    <button type="button" title="Redo" disabled={!client || !state.ready} on:click={() => execute({ type: "history.redo" })}>Redo</button>
  </div>

  <span class="ow-writer-separator" aria-hidden="true"></span>

  <div class="ow-writer-group" aria-label="Font formatting">
    <button
      type="button"
      class:active={state.bold}
      aria-pressed={state.bold}
      title="Bold"
      disabled={!client || !state.ready}
      on:click={() => execute({ type: "format.toggleBold" })}
    ><strong>B</strong></button>
    <button
      type="button"
      class:active={state.italic}
      aria-pressed={state.italic}
      title="Italic"
      disabled={!client || !state.ready}
      on:click={() => execute({ type: "format.toggleItalic" })}
    ><em>I</em></button>
    <button
      type="button"
      class:active={state.underline}
      aria-pressed={state.underline}
      title="Underline"
      disabled={!client || !state.ready}
      on:click={() => execute({ type: "format.toggleUnderline" })}
    ><u>U</u></button>
  </div>
</nav>

<style>
  .ow-writer-home {
    height: 40px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 10px;
    border-bottom: 1px solid var(--ow-chrome-border);
    background: var(--ow-chrome-bg);
  }

  .ow-writer-group {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  button {
    min-width: 30px;
    height: 30px;
    padding: 0 9px;
    border: 0;
    border-radius: var(--ow-radius);
    background: transparent;
    color: var(--ow-text);
    cursor: pointer;
  }

  button:hover:not(:disabled) {
    background: var(--ow-hover-bg);
  }

  button.active {
    color: var(--ow-accent);
    background: var(--ow-active-bg);
  }

  button:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .ow-writer-separator {
    width: 1px;
    height: 24px;
    background: var(--ow-divider);
  }
</style>
