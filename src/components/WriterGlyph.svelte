<script lang="ts">
  import {
    iconAlignCenter,
    iconAlignJustify,
    iconAlignLeft,
    iconAlignRight,
    iconBold,
    iconBulletList,
    iconClearFormatting,
    iconFileSave,
    iconItalic,
    iconNumberedList,
    iconPageBreak,
    iconRedo,
    iconSearch,
    iconStrikethrough,
    iconSubscript,
    iconSuperscript,
    iconUnderline,
    iconUndo,
  } from "@/icons";

  const localGlyphs = {
    header: `<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="4" y="2.5" width="12" height="15" rx="1.25" stroke="currentColor" stroke-width="1.5"/><path d="M6.5 6h7M6.5 8h5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M4 10.25h12" stroke="currentColor" stroke-width="1.15" stroke-dasharray="1.5 2"/></svg>`,
    footer: `<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="4" y="2.5" width="12" height="15" rx="1.25" stroke="currentColor" stroke-width="1.5"/><path d="M6.5 12h5M6.5 14h7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M4 9.75h12" stroke="currentColor" stroke-width="1.15" stroke-dasharray="1.5 2"/></svg>`,
    firstPage: `<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="5" y="2.5" width="10" height="15" rx="1.25" stroke="currentColor" stroke-width="1.5"/><path d="M7.5 6h5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="10" cy="11.5" r="2.1" stroke="currentColor" stroke-width="1.35"/><path d="M10 10.25v2.5" stroke="currentColor" stroke-width="1.35" stroke-linecap="round"/></svg>`,
    oddEven: `<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="2.5" y="4" width="7" height="12" rx="1" stroke="currentColor" stroke-width="1.35"/><rect x="10.5" y="4" width="7" height="12" rx="1" stroke="currentColor" stroke-width="1.35"/><path d="M4.5 7h3M12.5 7h3" stroke="currentColor" stroke-width="1.35" stroke-linecap="round"/><path d="M6 10.2v2.6M14 10.2v2.6" stroke="currentColor" stroke-width="1.35" stroke-linecap="round"/></svg>`,
    pageNumber: `<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="4" y="2.5" width="12" height="15" rx="1.25" stroke="currentColor" stroke-width="1.5"/><path d="M6.5 6h7M6.5 8.5h4" stroke="currentColor" stroke-width="1.35" stroke-linecap="round"/><path d="M8.4 14.4h3.2M9.2 11.6l.8-.6v3.4" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  } as const;

  const glyphs = {
    save: iconFileSave,
    undo: iconUndo,
    redo: iconRedo,
    bold: iconBold,
    italic: iconItalic,
    underline: iconUnderline,
    strikethrough: iconStrikethrough,
    subscript: iconSubscript,
    superscript: iconSuperscript,
    clearFormatting: iconClearFormatting,
    search: iconSearch,
    alignLeft: iconAlignLeft,
    alignCenter: iconAlignCenter,
    alignRight: iconAlignRight,
    alignJustify: iconAlignJustify,
    bullets: iconBulletList,
    numbering: iconNumberedList,
    pageBreak: iconPageBreak,
    ...localGlyphs,
  } as const;

  export let name: keyof typeof glyphs;
  export let size = 18;

  $: glyph = glyphs[name];
</script>

<span
  class="ow-writer-glyph"
  style={`--ow-writer-glyph-size: ${size}px`}
  aria-hidden="true"
>{@html glyph}</span>

<style>
  .ow-writer-glyph {
    width: var(--ow-writer-glyph-size);
    height: var(--ow-writer-glyph-size);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: none;
    line-height: 0;
  }

  .ow-writer-glyph :global(svg) {
    width: 100%;
    height: 100%;
    display: block;
  }
</style>
