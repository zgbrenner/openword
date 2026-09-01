<script lang="ts">
  import { APP_MENUS, isSeparator } from "@/lib/menuDefinition";
  import { isMacPlatform } from "@/lib/webShortcuts";

  let { onaction }: { onaction: (id: string) => void } = $props();

  const mac = isMacPlatform();

  let barEl = $state<HTMLElement | undefined>();
  let openIndex = $state<number | null>(null);
  let focusIndex = $state(0); // roving tabindex across top-level labels

  function formatAccelerator(accelerator: string): string {
    const parts = accelerator.split("+");
    if (mac) {
      return parts
        .map((part) => (part === "CmdOrCtrl" ? "⌘" : part === "Shift" ? "⇧" : part === "Return" ? "↩" : part))
        .join("");
    }
    return parts.map((part) => (part === "CmdOrCtrl" ? "Ctrl" : part === "Return" ? "Enter" : part)).join("+");
  }

  function actionableIndices(menuIndex: number): number[] {
    const indices: number[] = [];
    APP_MENUS[menuIndex].entries.forEach((entry, index) => {
      if (!isSeparator(entry)) indices.push(index);
    });
    return indices;
  }

  function focusTop(index: number): void {
    focusIndex = index;
    requestAnimationFrame(() => document.getElementById(`ow-menubar-btn-${index}`)?.focus());
  }

  function focusItem(menuIndex: number, entryIndex: number): void {
    requestAnimationFrame(() => document.getElementById(`ow-menu-${menuIndex}-item-${entryIndex}`)?.focus());
  }

  function openWithFocus(menuIndex: number, position: "first" | "last"): void {
    openIndex = menuIndex;
    focusIndex = menuIndex;
    const indices = actionableIndices(menuIndex);
    focusItem(menuIndex, position === "first" ? indices[0] : indices[indices.length - 1]);
  }

  function toggleMenu(index: number): void {
    focusIndex = index;
    openIndex = openIndex === index ? null : index;
  }

  function switchOnHover(index: number): void {
    if (openIndex !== null && openIndex !== index) {
      openIndex = index;
      focusIndex = index;
    }
  }

  function activate(id: string): void {
    openIndex = null;
    onaction(id);
  }

  function handleTopKeydown(event: KeyboardEvent, index: number): void {
    const count = APP_MENUS.length;
    let next: number | null = null;
    if (event.key === "ArrowRight") next = (index + 1) % count;
    else if (event.key === "ArrowLeft") next = (index - 1 + count) % count;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = count - 1;
    if (next !== null) {
      event.preventDefault();
      if (openIndex !== null) openIndex = next;
      focusTop(next);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openWithFocus(index, "first");
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      openWithFocus(index, "last");
    } else if (event.key === "Escape" && openIndex !== null) {
      event.preventDefault();
      openIndex = null;
    }
  }

  function handleItemKeydown(event: KeyboardEvent, menuIndex: number, entryIndex: number): void {
    const indices = actionableIndices(menuIndex);
    const position = indices.indexOf(entryIndex);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const delta = event.key === "ArrowDown" ? 1 : -1;
      focusItem(menuIndex, indices[(position + delta + indices.length) % indices.length]);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusItem(menuIndex, indices[0]);
    } else if (event.key === "End") {
      event.preventDefault();
      focusItem(menuIndex, indices[indices.length - 1]);
    } else if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      const count = APP_MENUS.length;
      const next = event.key === "ArrowRight" ? (menuIndex + 1) % count : (menuIndex - 1 + count) % count;
      openWithFocus(next, "first");
    } else if (event.key === "Escape") {
      event.preventDefault();
      openIndex = null;
      focusTop(menuIndex);
    } else if (event.key === "Tab") {
      openIndex = null;
    }
  }

  function handlePointerDown(event: PointerEvent): void {
    if (openIndex !== null && barEl && event.target instanceof Node && !barEl.contains(event.target)) {
      openIndex = null;
    }
  }

  function handleFocusOut(event: FocusEvent): void {
    if (openIndex === null || !barEl) return;
    const next = event.relatedTarget;
    if (!(next instanceof Node) || !barEl.contains(next)) openIndex = null;
  }
</script>

<svelte:window onpointerdown={handlePointerDown} />

<nav class="ow-menubar" bind:this={barEl} onfocusout={handleFocusOut}>
  <div role="menubar" aria-label="Application menu">
    {#each APP_MENUS as menu, menuIndex}
      <div class="menu-wrap">
        <button
          id={`ow-menubar-btn-${menuIndex}`}
          class="top"
          class:open={openIndex === menuIndex}
          type="button"
          role="menuitem"
          aria-haspopup="true"
          aria-expanded={openIndex === menuIndex}
          tabindex={focusIndex === menuIndex ? 0 : -1}
          onclick={() => toggleMenu(menuIndex)}
          onpointerenter={() => switchOnHover(menuIndex)}
          onkeydown={(event) => handleTopKeydown(event, menuIndex)}
        >{menu.label}</button>
        {#if openIndex === menuIndex}
          <div class="dropdown" role="menu" aria-label={menu.label}>
            {#each menu.entries as entry, entryIndex}
              {#if isSeparator(entry)}
                <div class="separator" role="separator"></div>
              {:else}
                <button
                  id={`ow-menu-${menuIndex}-item-${entryIndex}`}
                  class="item"
                  type="button"
                  role="menuitem"
                  tabindex="-1"
                  onclick={() => activate(entry.id)}
                  onkeydown={(event) => handleItemKeydown(event, menuIndex, entryIndex)}
                >
                  <span class="item-label">{entry.label}</span>
                  {#if entry.accelerator}<span class="item-accel">{formatAccelerator(entry.accelerator)}</span>{/if}
                </button>
              {/if}
            {/each}
          </div>
        {/if}
      </div>
    {/each}
  </div>
</nav>

<style>
  /* Slim strip above the ribbon; deliberately lighter than the ribbon chrome. */
  .ow-menubar {
    position: relative;
    z-index: 6;
    flex: none;
    border-bottom: 1px solid var(--ow-divider);
    background: var(--ow-chrome-bg);
  }
  [role="menubar"] {
    height: 26px;
    display: flex;
    align-items: stretch;
    padding: 0 6px;
  }
  .menu-wrap { position: relative; display: flex; }
  button {
    border: 0;
    background: transparent;
    color: var(--ow-text);
    font-family: inherit;
    cursor: pointer;
  }
  .top {
    padding: 0 9px;
    border-radius: 4px;
    margin: 2px 1px;
    color: var(--ow-text-muted);
    font-size: 12px;
  }
  .top:hover { background: var(--ow-hover-bg); color: var(--ow-text); }
  .top.open { background: var(--ow-active-bg); color: var(--ow-text); }
  .dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    z-index: 40;
    min-width: 218px;
    display: flex;
    flex-direction: column;
    padding: 4px;
    border: 1px solid var(--ow-chrome-border);
    border-radius: 6px;
    background: var(--ow-chrome-bg);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
  }
  .item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 24px;
    height: 26px;
    padding: 0 9px;
    border-radius: 4px;
    font-size: 12px;
    text-align: left;
    white-space: nowrap;
  }
  .item:hover, .item:focus-visible { background: var(--ow-hover-bg); }
  .item-accel { color: var(--ow-text-muted); font-size: 11px; }
  .separator { height: 1px; margin: 4px 6px; background: var(--ow-divider); }
  .top:focus-visible, .item:focus-visible {
    outline: 2px solid var(--ow-accent);
    outline-offset: -2px;
  }
</style>
