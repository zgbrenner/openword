<script lang="ts">
  import type { WriterClient } from "@/writer/client";
  import type {
    PageMarginPreset,
    PageOrientation,
    PagePaperSize,
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
  $: unavailable = !client || !state.ready;

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
    if (unavailable) return;
    try {
      await onsave();
    } catch (error) {
      onerror(error);
    }
  }

  function selectTab(tab: RibbonTab, focus = false): void {
    activeTab = tab;
    if (focus) requestAnimationFrame(() => document.getElementById(`ow-ribbon-tab-${tab}`)?.focus());
  }

  function handleTabKeydown(event: KeyboardEvent, tab: RibbonTab): void {
    const index = tabs.indexOf(tab);
    let next = index;
    if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    else return;
    event.preventDefault();
    selectTab(tabs[next], true);
  }

  function changeOrientation(event: Event): void {
    const orientation = (event.currentTarget as HTMLSelectElement).value as PageOrientation;
    void execute({ type: "pageStyle.setOrientation", orientation });
  }

  function changeMargins(event: Event): void {
    const preset = (event.currentTarget as HTMLSelectElement).value as PageMarginPreset;
    if (preset !== "custom") void execute({ type: "pageStyle.setMargins", preset });
  }

  function changePaperSize(event: Event): void {
    const paperSize = (event.currentTarget as HTMLSelectElement).value as PagePaperSize;
    if (paperSize !== "custom") void execute({ type: "pageStyle.setPaperSize", paperSize });
  }
</script>

<header class="ribbon" aria-label="Document ribbon">
  <div class="tabs-row">
    <div class="quick-access" aria-label="Quick access">
      <button class="icon-button" type="button" aria-label="Save" title="Save" disabled={unavailable} on:click={() => void saveDocument()}><WriterGlyph name="save" size={17} /></button>
      <button class="icon-button" type="button" aria-label="Undo" title="Undo" disabled={unavailable} on:click={() => void execute({ type: "history.undo" })}><WriterGlyph name="undo" size={17} /></button>
      <button class="icon-button" type="button" aria-label="Redo" title="Redo" disabled={unavailable} on:click={() => void execute({ type: "history.redo" })}><WriterGlyph name="redo" size={17} /></button>
    </div>

    <div class="tab-list" role="tablist" aria-label="Ribbon tabs">
      <button id="ow-ribbon-tab-home" class:active={activeTab === "home"} type="button" role="tab" aria-selected={activeTab === "home"} aria-controls="ow-ribbon-panel-home" tabindex={activeTab === "home" ? 0 : -1} on:click={() => selectTab("home")} on:keydown={(event) => handleTabKeydown(event, "home")}>Home</button>
      <button id="ow-ribbon-tab-insert" class:active={activeTab === "insert"} type="button" role="tab" aria-selected={activeTab === "insert"} aria-controls="ow-ribbon-panel-insert" tabindex={activeTab === "insert" ? 0 : -1} on:click={() => selectTab("insert")} on:keydown={(event) => handleTabKeydown(event, "insert")}>Insert</button>
      <button id="ow-ribbon-tab-layout" class:active={activeTab === "layout"} type="button" role="tab" aria-selected={activeTab === "layout"} aria-controls="ow-ribbon-panel-layout" tabindex={activeTab === "layout" ? 0 : -1} on:click={() => selectTab("layout")} on:keydown={(event) => handleTabKeydown(event, "layout")}>Layout</button>
    </div>

    <div class="document-name" title={state.fileName}>{state.fileName}</div>
  </div>

  {#if activeTab === "home"}
    <div id="ow-ribbon-panel-home" class="panel" role="tabpanel" aria-labelledby="ow-ribbon-tab-home">
      <section class="group" aria-label="Font">
        <div class="group-body horizontal">
          <button class="command" class:active={state.bold} type="button" aria-label="Bold" aria-pressed={state.bold} title="Bold" disabled={unavailable} on:click={() => void execute({ type: "format.toggleBold" })}><WriterGlyph name="bold" /></button>
          <button class="command" class:active={state.italic} type="button" aria-label="Italic" aria-pressed={state.italic} title="Italic" disabled={unavailable} on:click={() => void execute({ type: "format.toggleItalic" })}><WriterGlyph name="italic" /></button>
          <button class="command" class:active={state.underline} type="button" aria-label="Underline" aria-pressed={state.underline} title="Underline" disabled={unavailable} on:click={() => void execute({ type: "format.toggleUnderline" })}><WriterGlyph name="underline" /></button>
        </div>
        <span>Font</span>
      </section>

      <section class="group" aria-label="Paragraph">
        <div class="group-body paragraph-grid">
          <button class="command" class:active={state.alignment === "left"} type="button" aria-label="Align left" aria-pressed={state.alignment === "left"} title="Align left" disabled={unavailable} on:click={() => void execute({ type: "paragraph.alignLeft" })}><WriterGlyph name="alignLeft" /></button>
          <button class="command" class:active={state.alignment === "center"} type="button" aria-label="Center" aria-pressed={state.alignment === "center"} title="Center" disabled={unavailable} on:click={() => void execute({ type: "paragraph.alignCenter" })}><WriterGlyph name="alignCenter" /></button>
          <button class="command" class:active={state.alignment === "right"} type="button" aria-label="Align right" aria-pressed={state.alignment === "right"} title="Align right" disabled={unavailable} on:click={() => void execute({ type: "paragraph.alignRight" })}><WriterGlyph name="alignRight" /></button>
          <button class="command" class:active={state.alignment === "justify"} type="button" aria-label="Justify" aria-pressed={state.alignment === "justify"} title="Justify" disabled={unavailable} on:click={() => void execute({ type: "paragraph.alignJustify" })}><WriterGlyph name="alignJustify" /></button>
          <button class="command" class:active={state.bullets} type="button" aria-label="Bullets" aria-pressed={state.bullets} title="Bullets" disabled={unavailable} on:click={() => void execute({ type: "list.toggleBullets" })}><WriterGlyph name="bullets" /></button>
          <button class="command" class:active={state.numbering} type="button" aria-label="Numbering" aria-pressed={state.numbering} title="Numbering" disabled={unavailable} on:click={() => void execute({ type: "list.toggleNumbering" })}><WriterGlyph name="numbering" /></button>
        </div>
        <span>Paragraph</span>
      </section>
    </div>
  {:else if activeTab === "insert"}
    <div id="ow-ribbon-panel-insert" class="panel" role="tabpanel" aria-labelledby="ow-ribbon-tab-insert">
      <section class="group" aria-label="Pages">
        <div class="group-body horizontal">
          <button class="command large" type="button" title="Insert page break" disabled={unavailable} on:click={() => void execute({ type: "insert.pageBreak" })}><WriterGlyph name="pageBreak" size={22} /><span>Page break</span></button>
        </div>
        <span>Pages</span>
      </section>

      <section class="group" aria-label="Headers and footers">
        <div class="group-body horizontal">
          <button class="command large" type="button" title="Edit header" disabled={unavailable} on:click={() => void execute({ type: "header.edit" })}><WriterGlyph name="header" size={22} /><span>Edit header</span></button>
          <button class="command large" type="button" title="Edit footer" disabled={unavailable} on:click={() => void execute({ type: "footer.edit" })}><WriterGlyph name="footer" size={22} /><span>Edit footer</span></button>
          <button class="command large" type="button" aria-label="Page number" title="Insert page number at the cursor" disabled={unavailable} on:click={() => void execute({ type: "field.insertPageNumber" })}><WriterGlyph name="pageNumber" size={22} /><span>Page number</span></button>
          <button class="command large" class:active={state.headerEnabled} type="button" aria-pressed={state.headerEnabled} title="Enable or disable header" disabled={unavailable} on:click={() => void execute({ type: "header.setEnabled", enabled: !state.headerEnabled })}><WriterGlyph name="header" size={22} /><span>Header</span></button>
          <button class="command large" class:active={state.footerEnabled} type="button" aria-pressed={state.footerEnabled} title="Enable or disable footer" disabled={unavailable} on:click={() => void execute({ type: "footer.setEnabled", enabled: !state.footerEnabled })}><WriterGlyph name="footer" size={22} /><span>Footer</span></button>
        </div>
        <span>Header &amp; Footer</span>
      </section>
    </div>
  {:else if activeTab === "layout"}
    <div id="ow-ribbon-panel-layout" class="panel" role="tabpanel" aria-labelledby="ow-ribbon-tab-layout">
      <section class="group" aria-label="Page setup">
        <div class="group-body horizontal">
          <div class="fields">
            <label><span>Orientation</span><select aria-label="Orientation" value={state.orientation} disabled={unavailable} on:change={changeOrientation}><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select></label>
            <label><span>Paper size</span><select aria-label="Paper size" value={state.paperSize} disabled={unavailable} on:change={changePaperSize}><option value="letter">Letter</option><option value="a4">A4</option><option value="legal">Legal</option><option value="custom" disabled>Custom</option></select></label>
            <label><span>Margins</span><select aria-label="Margins" value={state.marginPreset} disabled={unavailable} on:change={changeMargins}><option value="normal">Normal</option><option value="narrow">Narrow</option><option value="moderate">Moderate</option><option value="wide">Wide</option><option value="custom" disabled>Custom</option></select></label>
          </div>
          <button class="command large" class:active={state.differentFirstPage} type="button" aria-pressed={state.differentFirstPage} title="Different first page" disabled={unavailable} on:click={() => void execute({ type: "pageStyle.setDifferentFirstPage", enabled: !state.differentFirstPage })}><WriterGlyph name="firstPage" size={22} /><span>Different first</span></button>
          <button class="command large" class:active={state.differentOddEven} type="button" aria-pressed={state.differentOddEven} title="Different odd and even pages" disabled={unavailable} on:click={() => void execute({ type: "pageStyle.setDifferentOddEven", enabled: !state.differentOddEven })}><WriterGlyph name="oddEven" size={22} /><span>Odd &amp; even</span></button>
        </div>
        <span>Page Setup</span>
      </section>

      <section class="group current-style" aria-label="Current page style">
        <div title={state.pageStyleName}>{state.pageStyleName}</div>
        <span>Current Style</span>
      </section>
    </div>
  {/if}
</header>

<style>
  .ribbon { position: relative; z-index: 5; flex: none; border-bottom: 1px solid var(--ow-chrome-border); background: var(--ow-chrome-bg); box-shadow: 0 1px 0 rgba(20, 24, 38, .025); }
  .tabs-row { height: 36px; display: grid; grid-template-columns: auto minmax(0, 1fr) minmax(100px, 260px); align-items: stretch; gap: 8px; padding: 0 10px; border-bottom: 1px solid var(--ow-divider); }
  .quick-access, .tab-list, .horizontal { display: flex; align-items: center; }
  .quick-access { gap: 1px; padding-right: 7px; border-right: 1px solid var(--ow-divider); }
  button, select { font-family: inherit; }
  .icon-button, .command, .tab-list button { border: 0; color: var(--ow-text); background: transparent; cursor: pointer; }
  .icon-button { width: 28px; height: 28px; display: inline-flex; align-items: center; justify-content: center; padding: 0; border-radius: 4px; }
  .tab-list { min-width: 0; gap: 2px; }
  .tab-list button { position: relative; min-width: 62px; height: 100%; padding: 0 13px; color: var(--ow-text-muted); font-size: 12px; font-weight: 500; }
  .tab-list button::after { content: ""; position: absolute; right: 10px; bottom: -1px; left: 10px; height: 2px; border-radius: 2px 2px 0 0; }
  .tab-list button.active { color: var(--ow-text); }
  .tab-list button.active::after { background: var(--ow-accent); }
  .document-name { min-width: 0; align-self: center; overflow: hidden; color: var(--ow-text-muted); font-size: 11px; text-align: right; text-overflow: ellipsis; white-space: nowrap; }
  .panel { height: 82px; display: flex; align-items: stretch; padding: 5px 8px 3px; overflow-x: auto; overscroll-behavior-x: contain; scrollbar-width: none; }
  .panel::-webkit-scrollbar { display: none; }
  .group { min-width: max-content; display: grid; grid-template-rows: minmax(0, 1fr) 15px; padding: 0 9px; border-right: 1px solid var(--ow-divider); }
  .group:first-child { padding-left: 4px; }
  .group:last-child { border-right: 0; }
  .group > span { align-self: end; color: var(--ow-text-muted); font-size: 9.5px; line-height: 15px; text-align: center; white-space: nowrap; }
  .group-body { align-content: center; gap: 2px; }
  .paragraph-grid { display: grid; grid-template-columns: repeat(6, 32px); align-content: center; }
  .command { min-width: 30px; height: 30px; display: inline-flex; align-items: center; justify-content: center; padding: 0 6px; border-radius: 4px; }
  .command.large { width: 70px; height: 58px; flex-direction: column; gap: 3px; padding: 4px 5px 3px; font-size: 10px; line-height: 1.05; text-align: center; }
  .command.large > span:last-child { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .command.active { color: var(--ow-accent); background: var(--ow-active-bg); }
  .fields { display: grid; align-content: center; gap: 3px; margin-right: 6px; }
  .fields label { display: grid; grid-template-columns: 64px 104px; align-items: center; gap: 5px; color: var(--ow-text-muted); font-size: 10px; }
  .fields select { width: 104px; height: 22px; padding: 0 20px 0 7px; border: 1px solid var(--ow-input-border); border-radius: 4px; background: var(--ow-input-bg); color: var(--ow-text); font-size: 10.5px; }
  .current-style div { width: 150px; align-self: center; overflow: hidden; padding: 8px 10px; border: 1px solid var(--ow-input-border); border-radius: 4px; background: var(--ow-input-bg); color: var(--ow-text); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
  .icon-button:hover:not(:disabled), .command:hover:not(:disabled), .tab-list button:hover { background: var(--ow-hover-bg); }
  .icon-button:disabled, .command:disabled, select:disabled { opacity: .4; cursor: default; }
  .icon-button:focus-visible, .command:focus-visible, .tab-list button:focus-visible, select:focus-visible { position: relative; z-index: 1; outline: 2px solid var(--ow-accent); outline-offset: -2px; }
  @media (max-width: 760px) {
    .tabs-row { grid-template-columns: auto minmax(0, 1fr); padding-right: 6px; }
    .document-name { display: none; }
    .tab-list button { min-width: 54px; padding-inline: 9px; }
    .panel { height: 78px; padding-inline: 5px; }
    .group { padding-inline: 6px; }
    .command.large { width: 62px; }
    .fields label { grid-template-columns: 56px 94px; }
    .fields select { width: 94px; }
    .current-style div { width: 120px; }
  }
</style>
