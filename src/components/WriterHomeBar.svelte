<script lang="ts">
  import type { WriterClient } from "@/writer/client";
  import type {
    PageMarginPreset,
    PageOrientation,
    WriterCommand,
  } from "@/writer/protocol";
  import type { WriterState } from "@/writer/state.svelte";
  import WriterGlyph from "./WriterGlyph.svelte";

  type RibbonTab = "home" | "insert" | "layout";

  export let client: WriterClient | null;
  export let state: WriterState;
  export let onsave: () => void | Promise<void>;
  export let onerror: (error: unknown) => void = () => {};

  const tabs: readonly RibbonTab[] = ["home", "insert", "layout"];
  let activeTab: RibbonTab = "home";

  function focusCanvas(): void {
    requestAnimationFrame(() => document.getElementById("qtcanvas")?.focus());
  }

  async function execute(command: WriterCommand): Promise<void> {
    if (!client || !state.ready) return;
    try {
      await client.execute(command);
    } catch (error) {
      onerror(error);
    } finally {
      focusCanvas();
    }
  }

  async function saveDocument(): Promise<void> {
    if (!client || !state.ready) return;
    try {
      await onsave();
    } catch (error) {
      onerror(error);
    }
  }

  function selectTab(tab: RibbonTab, focus = false): void {
    activeTab = tab;
    if (focus) {
      requestAnimationFrame(() => document.getElementById(`ow-ribbon-tab-${tab}`)?.focus());
    }
  }

  function handleTabKeydown(event: KeyboardEvent, tab: RibbonTab): void {
    const index = tabs.indexOf(tab);
    let nextIndex = index;
    switch (event.key) {
      case "ArrowLeft":
        nextIndex = (index - 1 + tabs.length) % tabs.length;
        break;
      case "ArrowRight":
        nextIndex = (index + 1) % tabs.length;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = tabs.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    selectTab(tabs[nextIndex], true);
  }

  function changeOrientation(event: Event): void {
    const orientation = (event.currentTarget as HTMLSelectElement).value as PageOrientation;
    void execute({ type: "pageStyle.setOrientation", orientation });
  }

  function changeMargins(event: Event): void {
    const preset = (event.currentTarget as HTMLSelectElement).value as PageMarginPreset;
    if (preset === "custom") return;
    void execute({ type: "pageStyle.setMargins", preset });
  }
</script>

<header class="ow-writer-ribbon" aria-label="Document ribbon">
  <div class="ow-ribbon-tabs-row">
    <div class="ow-quick-access" aria-label="Quick access">
      <button
        class="ow-quick-button"
        type="button"
        aria-label="Save"
        title="Save"
        disabled={!client || !state.ready}
        on:click={() => void saveDocument()}
      ><WriterGlyph name="save" size={17} /></button>
      <button
        class="ow-quick-button"
        type="button"
        aria-label="Undo"
        title="Undo"
        disabled={!client || !state.ready}
        on:click={() => void execute({ type: "history.undo" })}
      ><WriterGlyph name="undo" size={17} /></button>
      <button
        class="ow-quick-button"
        type="button"
        aria-label="Redo"
        title="Redo"
        disabled={!client || !state.ready}
        on:click={() => void execute({ type: "history.redo" })}
      ><WriterGlyph name="redo" size={17} /></button>
    </div>

    <div class="ow-ribbon-tablist" role="tablist" aria-label="Ribbon tabs">
      <button
        id="ow-ribbon-tab-home"
        class="ow-ribbon-tab"
        class:active={activeTab === "home"}
        type="button"
        role="tab"
        aria-selected={activeTab === "home"}
        aria-controls="ow-ribbon-panel-home"
        tabindex={activeTab === "home" ? 0 : -1}
        on:click={() => selectTab("home")}
        on:keydown={(event) => handleTabKeydown(event, "home")}
      >Home</button>
      <button
        id="ow-ribbon-tab-insert"
        class="ow-ribbon-tab"
        class:active={activeTab === "insert"}
        type="button"
        role="tab"
        aria-selected={activeTab === "insert"}
        aria-controls="ow-ribbon-panel-insert"
        tabindex={activeTab === "insert" ? 0 : -1}
        on:click={() => selectTab("insert")}
        on:keydown={(event) => handleTabKeydown(event, "insert")}
      >Insert</button>
      <button
        id="ow-ribbon-tab-layout"
        class="ow-ribbon-tab"
        class:active={activeTab === "layout"}
        type="button"
        role="tab"
        aria-selected={activeTab === "layout"}
        aria-controls="ow-ribbon-panel-layout"
        tabindex={activeTab === "layout" ? 0 : -1}
        on:click={() => selectTab("layout")}
        on:keydown={(event) => handleTabKeydown(event, "layout")}
      >Layout</button>
    </div>

    <div class="ow-ribbon-document-name" title={state.fileName}>{state.fileName}</div>
  </div>

  {#if activeTab === "home"}
    <div
      id="ow-ribbon-panel-home"
      class="ow-ribbon-panel"
      role="tabpanel"
      aria-labelledby="ow-ribbon-tab-home"
    >
      <section class="ow-ribbon-group" aria-label="Font">
        <div class="ow-ribbon-group-body">
          <button
            class="ow-ribbon-command"
            class:active={state.bold}
            type="button"
            aria-label="Bold"
            aria-pressed={state.bold}
            title="Bold"
            disabled={!client || !state.ready}
            on:click={() => void execute({ type: "format.toggleBold" })}
          ><WriterGlyph name="bold" /></button>
          <button
            class="ow-ribbon-command"
            class:active={state.italic}
            type="button"
            aria-label="Italic"
            aria-pressed={state.italic}
            title="Italic"
            disabled={!client || !state.ready}
            on:click={() => void execute({ type: "format.toggleItalic" })}
          ><WriterGlyph name="italic" /></button>
          <button
            class="ow-ribbon-command"
            class:active={state.underline}
            type="button"
            aria-label="Underline"
            aria-pressed={state.underline}
            title="Underline"
            disabled={!client || !state.ready}
            on:click={() => void execute({ type: "format.toggleUnderline" })}
          ><WriterGlyph name="underline" /></button>
        </div>
        <span class="ow-ribbon-group-label">Font</span>
      </section>

      <section class="ow-ribbon-group" aria-label="Paragraph">
        <div class="ow-ribbon-group-body ow-ribbon-paragraph-grid">
          <button
            class="ow-ribbon-command"
            class:active={state.alignment === "left"}
            type="button"
            aria-label="Align left"
            aria-pressed={state.alignment === "left"}
            title="Align left"
            disabled={!client || !state.ready}
            on:click={() => void execute({ type: "paragraph.alignLeft" })}
          ><WriterGlyph name="alignLeft" /></button>
          <button
            class="ow-ribbon-command"
            class:active={state.alignment === "center"}
            type="button"
            aria-label="Center"
            aria-pressed={state.alignment === "center"}
            title="Center"
            disabled={!client || !state.ready}
            on:click={() => void execute({ type: "paragraph.alignCenter" })}
          ><WriterGlyph name="alignCenter" /></button>
          <button
            class="ow-ribbon-command"
            class:active={state.alignment === "right"}
            type="button"
            aria-label="Align right"
            aria-pressed={state.alignment === "right"}
            title="Align right"
            disabled={!client || !state.ready}
            on:click={() => void execute({ type: "paragraph.alignRight" })}
          ><WriterGlyph name="alignRight" /></button>
          <button
            class="ow-ribbon-command"
            class:active={state.alignment === "justify"}
            type="button"
            aria-label="Justify"
            aria-pressed={state.alignment === "justify"}
            title="Justify"
            disabled={!client || !state.ready}
            on:click={() => void execute({ type: "paragraph.alignJustify" })}
          ><WriterGlyph name="alignJustify" /></button>
          <button
            class="ow-ribbon-command"
            class:active={state.bullets}
            type="button"
            aria-label="Bullets"
            aria-pressed={state.bullets}
            title="Bullets"
            disabled={!client || !state.ready}
            on:click={() => void execute({ type: "list.toggleBullets" })}
          ><WriterGlyph name="bullets" /></button>
          <button
            class="ow-ribbon-command"
            class:active={state.numbering}
            type="button"
            aria-label="Numbering"
            aria-pressed={state.numbering}
            title="Numbering"
            disabled={!client || !state.ready}
            on:click={() => void execute({ type: "list.toggleNumbering" })}
          ><WriterGlyph name="numbering" /></button>
        </div>
        <span class="ow-ribbon-group-label">Paragraph</span>
      </section>
    </div>
  {:else if activeTab === "insert"}
    <div
      id="ow-ribbon-panel-insert"
      class="ow-ribbon-panel"
      role="tabpanel"
      aria-labelledby="ow-ribbon-tab-insert"
    >
      <section class="ow-ribbon-group" aria-label="Pages">
        <div class="ow-ribbon-group-body">
          <button
            class="ow-ribbon-command large"
            type="button"
            title="Insert page break"
            disabled={!client || !state.ready}
            on:click={() => void execute({ type: "insert.pageBreak" })}
          ><WriterGlyph name="pageBreak" size={22} /><span>Page break</span></button>
        </div>
        <span class="ow-ribbon-group-label">Pages</span>
      </section>

      <section class="ow-ribbon-group" aria-label="Headers and footers">
        <div class="ow-ribbon-group-body">
          <button
            class="ow-ribbon-command large"
            type="button"
            title="Edit header"
            disabled={!client || !state.ready}
            on:click={() => void execute({ type: "header.edit" })}
          ><WriterGlyph name="header" size={22} /><span>Edit header</span></button>
          <button
            class="ow-ribbon-command large"
            type="button"
            title="Edit footer"
            disabled={!client || !state.ready}
            on:click={() => void execute({ type: "footer.edit" })}
          ><WriterGlyph name="footer" size={22} /><span>Edit footer</span></button>
          <button
            class="ow-ribbon-command large"
            class:active={state.headerEnabled}
            type="button"
            aria-pressed={state.headerEnabled}
            title="Enable or disable header"
            disabled={!client || !state.ready}
            on:click={() => void execute({
              type: "header.setEnabled",
              enabled: !state.headerEnabled,
            })}
          ><WriterGlyph name="header" size={22} /><span>Header</span></button>
          <button
            class="ow-ribbon-command large"
            class:active={state.footerEnabled}
            type="button"
            aria-pressed={state.footerEnabled}
            title="Enable or disable footer"
            disabled={!client || !state.ready}
            on:click={() => void execute({
              type: "footer.setEnabled",
              enabled: !state.footerEnabled,
            })}
          ><WriterGlyph name="footer" size={22} /><span>Footer</span></button>
        </div>
        <span class="ow-ribbon-group-label">Header &amp; Footer</span>
      </section>
    </div>
  {:else if activeTab === "layout"}
    <div
      id="ow-ribbon-panel-layout"
      class="ow-ribbon-panel"
      role="tabpanel"
      aria-labelledby="ow-ribbon-tab-layout"
    >
      <section class="ow-ribbon-group" aria-label="Page setup">
        <div class="ow-ribbon-group-body">
          <div class="ow-ribbon-fields">
            <label class="ow-ribbon-field">
              <span>Orientation</span>
              <select
                aria-label="Orientation"
                value={state.orientation}
                disabled={!client || !state.ready}
                on:change={changeOrientation}
              >
                <option value="portrait">Portrait</option>
                <option value="landscape">Landscape</option>
              </select>
            </label>
            <label class="ow-ribbon-field">
              <span>Margins</span>
              <select
                aria-label="Margins"
                value={state.marginPreset}
                disabled={!client || !state.ready}
                on:change={changeMargins}
              >
                <option value="normal">Normal</option>
                <option value="narrow">Narrow</option>
                <option value="moderate">Moderate</option>
                <option value="wide">Wide</option>
                <option value="custom" disabled>Custom</option>
              </select>
            </label>
          </div>
          <button
            class="ow-ribbon-command large"
            class:active={state.differentFirstPage}
            type="button"
            aria-pressed={state.differentFirstPage}
            title="Different first page"
            disabled={!client || !state.ready}
            on:click={() => void execute({
              type: "pageStyle.setDifferentFirstPage",
              enabled: !state.differentFirstPage,
            })}
          ><WriterGlyph name="firstPage" size={22} /><span>Different first</span></button>
          <button
            class="ow-ribbon-command large"
            class:active={state.differentOddEven}
            type="button"
            aria-pressed={state.differentOddEven}
            title="Different odd and even pages"
            disabled={!client || !state.ready}
            on:click={() => void execute({
              type: "pageStyle.setDifferentOddEven",
              enabled: !state.differentOddEven,
            })}
          ><WriterGlyph name="oddEven" size={22} /><span>Odd &amp; even</span></button>
        </div>
        <span class="ow-ribbon-group-label">Page Setup</span>
      </section>

      <section class="ow-ribbon-group compact-information" aria-label="Current page style">
        <div class="ow-ribbon-style-name" title={state.pageStyleName}>{state.pageStyleName}</div>
        <span class="ow-ribbon-group-label">Current Style</span>
      </section>
    </div>
  {/if}
</header>

<style>
  .ow-writer-ribbon {
    position: relative;
    z-index: 5;
    display: flex;
    flex-direction: column;
    flex: none;
    border-bottom: 1px solid var(--ow-chrome-border);
    background: var(--ow-chrome-bg);
    box-shadow: 0 1px 0 rgba(20, 24, 38, 0.025);
  }

  .ow-ribbon-tabs-row {
    height: 36px;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) minmax(100px, 260px);
    align-items: stretch;
    gap: 8px;
    padding: 0 10px;
    border-bottom: 1px solid var(--ow-divider);
  }

  .ow-quick-access,
  .ow-ribbon-tablist {
    display: flex;
    align-items: center;
  }

  .ow-quick-access {
    gap: 1px;
    padding-right: 7px;
    border-right: 1px solid var(--ow-divider);
  }

  .ow-quick-button,
  .ow-ribbon-command,
  .ow-ribbon-tab {
    border: 0;
    font: inherit;
    color: var(--ow-text);
    background: transparent;
    cursor: pointer;
  }

  .ow-quick-button {
    width: 28px;
    height: 28px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border-radius: 4px;
  }

  .ow-ribbon-tablist {
    align-self: stretch;
    gap: 2px;
    min-width: 0;
  }

  .ow-ribbon-tab {
    position: relative;
    min-width: 62px;
    height: 100%;
    padding: 0 13px;
    font-size: 12px;
    font-weight: 500;
    color: var(--ow-text-muted);
  }

  .ow-ribbon-tab::after {
    content: "";
    position: absolute;
    right: 10px;
    bottom: -1px;
    left: 10px;
    height: 2px;
    border-radius: 2px 2px 0 0;
    background: transparent;
  }

  .ow-ribbon-tab.active {
    color: var(--ow-text);
  }

  .ow-ribbon-tab.active::after {
    background: var(--ow-accent);
  }

  .ow-ribbon-document-name {
    min-width: 0;
    align-self: center;
    overflow: hidden;
    text-align: right;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--ow-text-muted);
    font-size: 11px;
  }

  .ow-ribbon-panel {
    height: 76px;
    display: flex;
    align-items: stretch;
    gap: 0;
    padding: 5px 8px 3px;
    overflow-x: auto;
    overscroll-behavior-x: contain;
    scrollbar-width: none;
  }

  .ow-ribbon-panel::-webkit-scrollbar {
    display: none;
  }

  .ow-ribbon-group {
    min-width: max-content;
    display: grid;
    grid-template-rows: minmax(0, 1fr) 15px;
    align-items: stretch;
    padding: 0 9px;
    border-right: 1px solid var(--ow-divider);
  }

  .ow-ribbon-group:first-child {
    padding-left: 4px;
  }

  .ow-ribbon-group:last-child {
    border-right: 0;
  }

  .ow-ribbon-group-body {
    display: flex;
    align-items: center;
    gap: 2px;
  }

  .ow-ribbon-paragraph-grid {
    display: grid;
    grid-template-columns: repeat(6, 32px);
    align-content: center;
  }

  .ow-ribbon-group-label {
    align-self: end;
    color: var(--ow-text-muted);
    font-size: 9.5px;
    line-height: 15px;
    text-align: center;
    white-space: nowrap;
  }

  .ow-ribbon-command {
    min-width: 30px;
    height: 30px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0 6px;
    border-radius: 4px;
  }

  .ow-ribbon-command.large {
    width: 70px;
    height: 54px;
    flex-direction: column;
    gap: 3px;
    padding: 4px 5px 3px;
    font-size: 10px;
    line-height: 1.05;
    text-align: center;
    white-space: normal;
  }

  .ow-ribbon-command.large > span:last-child {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .ow-ribbon-fields {
    display: grid;
    gap: 4px;
    margin-right: 6px;
  }

  .ow-ribbon-field {
    display: grid;
    grid-template-columns: 64px 104px;
    align-items: center;
    gap: 5px;
    color: var(--ow-text-muted);
    font-size: 10px;
  }

  .ow-ribbon-field select {
    width: 104px;
    height: 24px;
    padding: 0 22px 0 7px;
    border: 1px solid var(--ow-input-border);
    border-radius: 4px;
    background: var(--ow-input-bg);
    color: var(--ow-text);
    font: inherit;
    font-size: 10.5px;
  }

  .ow-ribbon-field select:disabled {
    opacity: 0.5;
  }

  .ow-ribbon-style-name {
    width: 150px;
    align-self: center;
    overflow: hidden;
    padding: 8px 10px;
    border: 1px solid var(--ow-input-border);
    border-radius: 4px;
    background: var(--ow-input-bg);
    color: var(--ow-text);
    font-size: 11px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .ow-quick-button:hover:not(:disabled),
  .ow-ribbon-command:hover:not(:disabled),
  .ow-ribbon-tab:hover {
    background: var(--ow-hover-bg);
  }

  .ow-ribbon-command.active {
    color: var(--ow-accent);
    background: var(--ow-active-bg);
  }

  .ow-quick-button:disabled,
  .ow-ribbon-command:disabled {
    opacity: 0.38;
    cursor: default;
  }

  .ow-quick-button:focus-visible,
  .ow-ribbon-command:focus-visible,
  .ow-ribbon-tab:focus-visible,
  .ow-ribbon-field select:focus-visible {
    position: relative;
    z-index: 1;
    outline: 2px solid var(--ow-accent);
    outline-offset: -2px;
  }

  @media (max-width: 760px) {
    .ow-ribbon-tabs-row {
      grid-template-columns: auto minmax(0, 1fr);
      padding-right: 6px;
    }

    .ow-ribbon-document-name {
      display: none;
    }

    .ow-ribbon-tab {
      min-width: 54px;
      padding-inline: 9px;
    }

    .ow-ribbon-panel {
      height: 72px;
      padding-inline: 5px;
    }

    .ow-ribbon-group {
      padding-inline: 6px;
    }

    .ow-ribbon-command.large {
      width: 62px;
    }

    .ow-ribbon-field {
      grid-template-columns: 56px 94px;
    }

    .ow-ribbon-field select {
      width: 94px;
    }

    .ow-ribbon-style-name {
      width: 120px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .ow-ribbon-tab::after {
      transition: none;
    }
  }
</style>
