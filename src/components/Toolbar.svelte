<script lang="ts">
  import { getContext } from "svelte";
  import { open } from "@tauri-apps/plugin-dialog";
  import { readFile } from "@tauri-apps/plugin-fs";
  import type { EditorController } from "@/lib/editorController.svelte";
  import * as icons from "@/icons";

  const controller = getContext<EditorController>("editor");

  const FONT_FAMILIES = [
    "Calibri",
    "Arial",
    "Times New Roman",
    "Georgia",
    "Verdana",
    "Tahoma",
    "Trebuchet MS",
    "Courier New",
    "Garamond",
    "Comic Sans MS",
  ];
  const FONT_SIZES = [8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 72];
  const LINE_SPACINGS = [
    { label: "Single", value: "1" },
    { label: "1.15", value: "1.15" },
    { label: "1.5", value: "1.5" },
    { label: "Double", value: "2" },
  ];

  let openPopover = $state<null | "link" | "table" | "textColor" | "highlight">(null);
  let linkUrl = $state("");
  let tableRows = $state(3);
  let tableCols = $state(3);

  const paragraphStyleValue = $derived(
    controller.snapshot.block.kind === "heading" ? `h${controller.snapshot.block.level}` : "p",
  );

  function onParagraphStyleChange(e: Event) {
    const value = (e.target as HTMLSelectElement).value;
    if (value === "p") controller.setParagraph();
    else controller.setHeading(Number(value.slice(1)));
  }

  function onFontFamilyChange(e: Event) {
    controller.setFontFamily((e.target as HTMLSelectElement).value);
  }

  function onFontSizeChange(e: Event) {
    controller.setFontSize(`${(e.target as HTMLSelectElement).value}pt`);
  }

  function onLineSpacingChange(e: Event) {
    controller.setLineSpacing((e.target as HTMLSelectElement).value);
  }

  function togglePopover(name: "link" | "table" | "textColor" | "highlight") {
    openPopover = openPopover === name ? null : name;
  }

  function submitLink() {
    if (linkUrl.trim()) controller.insertLink(linkUrl.trim());
    linkUrl = "";
    openPopover = null;
  }

  function submitTable() {
    controller.insertTable(Math.max(1, tableRows), Math.max(1, tableCols));
    openPopover = null;
  }

  async function pickImage() {
    const path = await open({
      multiple: false,
      filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp", "svg"] }],
    });
    const chosen = Array.isArray(path) ? path[0] : path;
    if (!chosen) return;
    const bytes = await readFile(chosen);
    const ext = chosen.split(".").pop()?.toLowerCase() ?? "png";
    const mime = ext === "svg" ? "image/svg+xml" : `image/${ext === "jpg" ? "jpeg" : ext}`;
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    const dataUrl = `data:${mime};base64,${btoa(binary)}`;
    controller.insertImage(dataUrl);
  }
</script>

<div class="ow-toolbar" role="toolbar" aria-label="Formatting">
  <button class="ow-icon-btn" title="Undo (Ctrl+Z)" disabled={!controller.snapshot.canUndo} onclick={controller.undo}>
    {@html icons.iconUndo}
  </button>
  <button class="ow-icon-btn" title="Redo (Ctrl+Shift+Z)" disabled={!controller.snapshot.canRedo} onclick={controller.redo}>
    {@html icons.iconRedo}
  </button>

  <span class="ow-divider"></span>

  <button class="ow-icon-btn" title="Print (Ctrl+P)" onclick={() => window.print()}>{@html icons.iconPrint}</button>

  <span class="ow-divider"></span>

  <select class="ow-select ow-select-style" title="Paragraph style" value={paragraphStyleValue} onchange={onParagraphStyleChange}>
    <option value="p">Normal text</option>
    {#each [1, 2, 3, 4, 5, 6] as level (level)}
      <option value={`h${level}`}>Heading {level}</option>
    {/each}
  </select>

  <select class="ow-select ow-select-font" title="Font family" onchange={onFontFamilyChange}>
    {#each FONT_FAMILIES as font (font)}
      <option value={font} style={`font-family:${font}`}>{font}</option>
    {/each}
  </select>

  <select class="ow-select ow-select-size" title="Font size" onchange={onFontSizeChange}>
    {#each FONT_SIZES as size (size)}
      <option value={size}>{size}</option>
    {/each}
  </select>

  <span class="ow-divider"></span>

  <button class="ow-icon-btn" class:active={controller.snapshot.bold} title="Bold (Ctrl+B)" onclick={controller.toggleBold}>{@html icons.iconBold}</button>
  <button class="ow-icon-btn" class:active={controller.snapshot.italic} title="Italic (Ctrl+I)" onclick={controller.toggleItalic}>{@html icons.iconItalic}</button>
  <button class="ow-icon-btn" class:active={controller.snapshot.underline} title="Underline (Ctrl+U)" onclick={controller.toggleUnderline}>{@html icons.iconUnderline}</button>
  <button class="ow-icon-btn" class:active={controller.snapshot.strike} title="Strikethrough" onclick={controller.toggleStrike}>{@html icons.iconStrikethrough}</button>
  <button class="ow-icon-btn" class:active={controller.snapshot.superscript} title="Superscript" onclick={controller.toggleSuperscript}>{@html icons.iconSuperscript}</button>
  <button class="ow-icon-btn" class:active={controller.snapshot.subscript} title="Subscript" onclick={controller.toggleSubscript}>{@html icons.iconSubscript}</button>

  <div class="ow-popover-anchor">
    <button class="ow-icon-btn" title="Text color" onclick={() => togglePopover("textColor")}>{@html icons.iconTextColor}</button>
    {#if openPopover === "textColor"}
      <div class="ow-popover">
        <input type="color" onchange={(e) => { controller.setTextColor((e.target as HTMLInputElement).value); openPopover = null; }} />
      </div>
    {/if}
  </div>
  <div class="ow-popover-anchor">
    <button class="ow-icon-btn" title="Highlight color" onclick={() => togglePopover("highlight")}>{@html icons.iconHighlight}</button>
    {#if openPopover === "highlight"}
      <div class="ow-popover">
        <input type="color" value="#fff176" onchange={(e) => { controller.setHighlight((e.target as HTMLInputElement).value); openPopover = null; }} />
      </div>
    {/if}
  </div>

  <span class="ow-divider"></span>

  <div class="ow-popover-anchor">
    <button class="ow-icon-btn" title="Insert link (Ctrl+K)" onclick={() => togglePopover("link")}>{@html icons.iconLink}</button>
    {#if openPopover === "link"}
      <div class="ow-popover ow-popover-form">
        <input type="text" placeholder="https://example.com" bind:value={linkUrl} onkeydown={(e) => e.key === "Enter" && submitLink()} />
        <button class="ow-btn-primary" onclick={submitLink}>Insert</button>
      </div>
    {/if}
  </div>
  <button class="ow-icon-btn" title="Comments (coming soon)" disabled>{@html icons.iconComment}</button>
  <button class="ow-icon-btn" title="Insert image" onclick={pickImage}>{@html icons.iconImage}</button>
  <div class="ow-popover-anchor">
    <button class="ow-icon-btn" title="Insert table" onclick={() => togglePopover("table")}>{@html icons.iconTable}</button>
    {#if openPopover === "table"}
      <div class="ow-popover ow-popover-form">
        <label>Rows <input type="number" min="1" max="20" bind:value={tableRows} /></label>
        <label>Columns <input type="number" min="1" max="10" bind:value={tableCols} /></label>
        <button class="ow-btn-primary" onclick={submitTable}>Insert</button>
      </div>
    {/if}
  </div>

  <span class="ow-divider"></span>

  <button class="ow-icon-btn" class:active={controller.snapshot.block.align === "left"} title="Align left (Ctrl+Shift+L)" onclick={() => controller.setAlign("left")}>{@html icons.iconAlignLeft}</button>
  <button class="ow-icon-btn" class:active={controller.snapshot.block.align === "center"} title="Align center (Ctrl+Shift+E)" onclick={() => controller.setAlign("center")}>{@html icons.iconAlignCenter}</button>
  <button class="ow-icon-btn" class:active={controller.snapshot.block.align === "right"} title="Align right (Ctrl+Shift+R)" onclick={() => controller.setAlign("right")}>{@html icons.iconAlignRight}</button>
  <button class="ow-icon-btn" class:active={controller.snapshot.block.align === "justify"} title="Justify (Ctrl+Shift+J)" onclick={() => controller.setAlign("justify")}>{@html icons.iconAlignJustify}</button>

  <select class="ow-select" title="Line spacing" value={controller.snapshot.block.lineSpacing} onchange={onLineSpacingChange}>
    {#each LINE_SPACINGS as opt (opt.value)}
      <option value={opt.value}>{opt.label}</option>
    {/each}
  </select>

  <span class="ow-divider"></span>

  <button class="ow-icon-btn" class:active={controller.snapshot.block.inBulletList} title="Bulleted list (Ctrl+Shift+8)" onclick={controller.toggleBulletList}>{@html icons.iconBulletList}</button>
  <button class="ow-icon-btn" class:active={controller.snapshot.block.inOrderedList} title="Numbered list (Ctrl+Shift+7)" onclick={controller.toggleOrderedList}>{@html icons.iconNumberedList}</button>
  <button class="ow-icon-btn" title="Decrease indent (Shift+Tab)" onclick={controller.outdent}>{@html icons.iconIndentDecrease}</button>
  <button class="ow-icon-btn" title="Increase indent (Tab)" onclick={controller.indent}>{@html icons.iconIndentIncrease}</button>

  <span class="ow-divider"></span>

  <button class="ow-icon-btn" title="Clear formatting (Ctrl+\\)" onclick={controller.clearFormatting}>{@html icons.iconClearFormatting}</button>
</div>

<style>
  .ow-toolbar {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 4px 8px;
    background: var(--ow-chrome-bg);
    border-bottom: 1px solid var(--ow-chrome-border);
    flex-wrap: wrap;
    -webkit-app-region: no-drag;
  }

  .ow-select-style {
    width: 118px;
  }
  .ow-select-font {
    width: 132px;
  }
  .ow-select-size {
    width: 54px;
  }

  .ow-popover-anchor {
    position: relative;
  }

  .ow-popover {
    position: absolute;
    top: 32px;
    left: 0;
    z-index: 20;
    background: var(--ow-chrome-bg);
    border: 1px solid var(--ow-chrome-border);
    border-radius: var(--ow-radius);
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.18);
    padding: 8px;
  }

  .ow-popover-form {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 200px;
  }

  .ow-popover-form input[type="text"],
  .ow-popover-form input[type="number"] {
    background: var(--ow-input-bg);
    border: 1px solid var(--ow-input-border);
    border-radius: var(--ow-radius);
    color: var(--ow-text);
    padding: 5px 7px;
    font-size: 13px;
  }

  .ow-popover-form label {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    font-size: 12px;
    color: var(--ow-text-muted);
  }

  .ow-popover-form input[type="number"] {
    width: 60px;
  }

  .ow-btn-primary {
    background: var(--ow-accent);
    color: white;
    border: none;
    border-radius: var(--ow-radius);
    padding: 6px 10px;
    font-size: 13px;
    cursor: pointer;
  }
</style>
