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
  <div class="ow-writer-group compact" aria-label="File and history">
    <button type="button" title="Save" disabled={!client || !state.ready} on:click={onsave}>Save</button>
    <button type="button" title="Undo" disabled={!client || !state.ready} on:click={() => execute({ type: "history.undo" })}>Undo</button>
    <button type="button" title="Redo" disabled={!client || !state.ready} on:click={() => execute({ type: "history.redo" })}>Redo</button>
  </div>

  <span class="ow-writer-separator" aria-hidden="true"></span>

  <div class="ow-writer-group" aria-label="Font">
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

  <span class="ow-writer-separator" aria-hidden="true"></span>

  <div class="ow-writer-group" aria-label="Paragraph">
    <button
      type="button"
      class:active={state.alignment === "left"}
      aria-pressed={state.alignment === "left"}
      title="Align left"
      disabled={!client || !state.ready}
      on:click={() => execute({ type: "paragraph.alignLeft" })}
    >L</button>
    <button
      type="button"
      class:active={state.alignment === "center"}
      aria-pressed={state.alignment === "center"}
      title="Center"
      disabled={!client || !state.ready}
      on:click={() => execute({ type: "paragraph.alignCenter" })}
    >C</button>
    <button
      type="button"
      class:active={state.alignment === "right"}
      aria-pressed={state.alignment === "right"}
      title="Align right"
      disabled={!client || !state.ready}
      on:click={() => execute({ type: "paragraph.alignRight" })}
    >R</button>
    <button
      type="button"
      class:active={state.alignment === "justify"}
      aria-pressed={state.alignment === "justify"}
      title="Justify"
      disabled={!client || !state.ready}
      on:click={() => execute({ type: "paragraph.alignJustify" })}
    >J</button>
    <button
      type="button"
      class:active={state.bullets}
      aria-pressed={state.bullets}
      title="Bullets"
      disabled={!client || !state.ready}
      on:click={() => execute({ type: "list.toggleBullets" })}
    >• List</button>
    <button
      type="button"
      class:active={state.numbering}
      aria-pressed={state.numbering}
      title="Numbering"
      disabled={!client || !state.ready}
      on:click={() => execute({ type: "list.toggleNumbering" })}
    >1. List</button>
  </div>

  <span class="ow-writer-separator" aria-hidden="true"></span>

  <div class="ow-writer-group" aria-label="Insert">
    <button
      type="button"
      title="Page break"
      disabled={!client || !state.ready}
      on:click={() => execute({ type: "insert.pageBreak" })}
    >Page break</button>
  </div>

  <span class="ow-writer-separator" aria-hidden="true"></span>

  <div class="ow-writer-group" aria-label="Header and footer">
    <button
      type="button"
      title="Edit header"
      disabled={!client || !state.ready}
      on:click={() => execute({ type: "header.edit" })}
    >Edit header</button>
    <button
      type="button"
      title="Edit footer"
      disabled={!client || !state.ready}
      on:click={() => execute({ type: "footer.edit" })}
    >Edit footer</button>
    <button
      type="button"
      class:active={state.headerEnabled}
      aria-pressed={state.headerEnabled}
      title="Header"
      disabled={!client || !state.ready}
      on:click={() => execute({ type: "header.setEnabled", enabled: !state.headerEnabled })}
    >Header</button>
    <button
      type="button"
      class:active={state.footerEnabled}
      aria-pressed={state.footerEnabled}
      title="Footer"
      disabled={!client || !state.ready}
      on:click={() => execute({ type: "footer.setEnabled", enabled: !state.footerEnabled })}
    >Footer</button>
    <button
      type="button"
      class:active={state.differentFirstPage}
      aria-pressed={state.differentFirstPage}
      title="Different first page"
      disabled={!client || !state.ready}
      on:click={() => execute({
        type: "pageStyle.setDifferentFirstPage",
        enabled: !state.differentFirstPage,
      })}
    >Different first</button>
    <button
      type="button"
      class:active={state.differentOddEven}
      aria-pressed={state.differentOddEven}
      title="Different odd and even pages"
      disabled={!client || !state.ready}
      on:click={() => execute({
        type: "pageStyle.setDifferentOddEven",
        enabled: !state.differentOddEven,
      })}
    >Odd & even</button>
  </div>
</nav>

<style>
  .ow-writer-home {
    min-height: 44px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    border-bottom: 1px solid var(--ow-chrome-border);
    background: var(--ow-chrome-bg);
    overflow-x: auto;
    scrollbar-width: none;
  }

  .ow-writer-home::-webkit-scrollbar { display: none; }

  .ow-writer-group {
    display: flex;
    align-items: center;
    gap: 3px;
    flex: none;
  }

  button {
    min-width: 30px;
    height: 30px;
    padding: 0 9px;
    border: 0;
    border-radius: var(--ow-radius);
    background: transparent;
    color: var(--ow-text);
    font-size: 12px;
    cursor: pointer;
    white-space: nowrap;
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
    height: 26px;
    background: var(--ow-divider);
    flex: none;
  }

  @media (max-width: 820px) {
    .ow-writer-group.compact button {
      max-width: 34px;
      overflow: hidden;
      text-indent: -999px;
      position: relative;
    }

    .ow-writer-group.compact button::after {
      content: attr(title);
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      text-indent: 0;
      font-size: 10px;
    }
  }
</style>
