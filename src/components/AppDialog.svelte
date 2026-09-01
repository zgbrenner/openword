<script lang="ts">
  import { appDialogs, sanitizeFileName } from "@/lib/appDialogs.svelte";

  let dialogEl = $state<HTMLElement | undefined>();
  let name = $state("");
  let format = $state("");

  const active = $derived(appDialogs.active);
  const nameValid = $derived(sanitizeFileName(name) !== null);

  // Re-seed the Save As fields and place initial focus each time a dialog
  // becomes active (including the next dialog from the queue).
  $effect(() => {
    const dialog = appDialogs.active;
    if (!dialog) return;
    if (dialog.type === "saveAs") {
      name = dialog.request.baseName;
      format = dialog.request.formats[0]?.value ?? "";
    }
    requestAnimationFrame(() => {
      dialogEl?.querySelector<HTMLElement>("[data-initial-focus]")?.focus();
    });
  });

  function confirmPrimary(): void {
    if (!active) return;
    if (active.type === "message") appDialogs.confirmMessage();
    else if (active.type === "ask") appDialogs.answer(true);
    else if (nameValid) appDialogs.confirmSaveAs(name, format);
  }

  // Focus never leaves the dialog while it is open.
  function trapFocus(event: KeyboardEvent): void {
    if (!dialogEl) return;
    const focusable = Array.from(
      dialogEl.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled)"),
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const current = document.activeElement;
    const inside = current instanceof HTMLElement && dialogEl.contains(current);
    if (event.shiftKey ? current === first || !inside : current === last || !inside) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    }
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      event.preventDefault();
      appDialogs.cancel();
    } else if (event.key === "Enter") {
      // A focused button keeps its native Enter activation (e.g. "No").
      if (event.target instanceof HTMLButtonElement) return;
      event.preventDefault();
      confirmPrimary();
    } else if (event.key === "Tab") {
      trapFocus(event);
    }
  }
</script>

{#if active}
  <div class="overlay">
    <div
      class="dialog"
      role={active.type === "saveAs" ? "dialog" : "alertdialog"}
      onkeydown={handleKeydown}
      aria-modal="true"
      aria-labelledby="ow-dialog-title"
      aria-describedby={active.type !== "saveAs" || active.request.note ? "ow-dialog-detail" : undefined}
      bind:this={dialogEl}
    >
      <h2 id="ow-dialog-title" class={active.type !== "saveAs" ? active.kind : "info"}>{active.title}</h2>

      {#if active.type === "saveAs"}
        <label class="field">
          <span>File name</span>
          <input data-initial-focus type="text" spellcheck="false" autocomplete="off" bind:value={name} />
        </label>
        {#if !nameValid}
          <p class="invalid">Enter a file name without / or \ characters.</p>
        {/if}
        <fieldset class="formats">
          <legend>Format</legend>
          {#each active.request.formats as option (option.value)}
            <label class="format-option">
              <input type="radio" name="ow-saveas-format" value={option.value} bind:group={format} />
              <span>{option.label}</span>
            </label>
          {/each}
        </fieldset>
        {#if active.request.note}
          <p id="ow-dialog-detail" class="detail note">{active.request.note}</p>
        {/if}
        <div class="buttons">
          <button type="button" onclick={() => appDialogs.cancel()}>Cancel</button>
          <button type="button" class="primary" disabled={!nameValid} onclick={confirmPrimary}>Save</button>
        </div>
      {:else}
        <p id="ow-dialog-detail" class="detail">{active.detail}</p>
        <div class="buttons">
          {#if active.type === "ask"}
            <button type="button" onclick={() => appDialogs.answer(false)}>No</button>
            <button data-initial-focus type="button" class="primary" onclick={confirmPrimary}>Yes</button>
          {:else}
            <button data-initial-focus type="button" class="primary" onclick={confirmPrimary}>OK</button>
          {/if}
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 100;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding: 12vh 16px 16px;
    background: rgba(20, 24, 38, 0.35);
  }
  .dialog {
    width: min(420px, 100%);
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 14px 16px;
    border: 1px solid var(--ow-chrome-border);
    border-radius: 8px;
    background: var(--ow-chrome-bg);
    color: var(--ow-text);
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.25);
  }
  h2 {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
  }
  h2.error { color: var(--ow-danger); }
  h2.warning { color: var(--ow-accent); }
  .detail {
    margin: 0;
    font-size: 12px;
    line-height: 1.45;
    white-space: pre-wrap;
    overflow-wrap: break-word;
  }
  .note { color: var(--ow-text-muted); }
  .invalid {
    margin: 0;
    color: var(--ow-danger);
    font-size: 11px;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 11px;
    color: var(--ow-text-muted);
  }
  .field input {
    height: 28px;
    padding: 0 8px;
    border: 1px solid var(--ow-input-border);
    border-radius: 5px;
    background: var(--ow-input-bg);
    color: var(--ow-text);
    font-size: 13px;
    font-family: inherit;
  }
  .formats {
    display: flex;
    flex-direction: column;
    gap: 5px;
    margin: 0;
    padding: 8px 10px 9px;
    border: 1px solid var(--ow-divider);
    border-radius: 5px;
  }
  .formats legend {
    padding: 0 4px;
    color: var(--ow-text-muted);
    font-size: 10.5px;
  }
  .format-option {
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: 12px;
    cursor: pointer;
  }
  .format-option input { margin: 0; accent-color: var(--ow-accent); }
  .buttons {
    display: flex;
    justify-content: flex-end;
    gap: 7px;
    margin-top: 2px;
  }
  .buttons button {
    min-width: 66px;
    height: 27px;
    padding: 0 12px;
    border: 1px solid var(--ow-chrome-border);
    border-radius: 5px;
    background: var(--ow-hover-bg);
    color: var(--ow-text);
    font-size: 12px;
    cursor: pointer;
  }
  .buttons button:hover:not(:disabled) { background: var(--ow-active-bg); }
  .buttons button.primary {
    border-color: var(--ow-accent);
    background: var(--ow-accent);
    color: #ffffff;
  }
  .buttons button.primary:hover:not(:disabled) { filter: brightness(1.06); background: var(--ow-accent); }
  .buttons button:disabled { opacity: 0.45; cursor: default; }
</style>
