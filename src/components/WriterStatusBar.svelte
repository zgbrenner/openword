<script lang="ts">
  import type { PackageCompatibilityReport } from "@/writer/packagePassthrough";
  import type { WriterState } from "@/writer/state.svelte";

  export let state: WriterState;
  export let report: PackageCompatibilityReport | null = null;
  export let onzoom: (percent: number) => void = () => {};

  const ZOOM_STOPS = [25, 50, 75, 90, 100, 125, 150, 200, 300, 400];

  function stopBelow(percent: number): number | null {
    let target: number | null = null;
    for (const stop of ZOOM_STOPS) if (stop < percent) target = stop;
    return target;
  }

  function stopAbove(percent: number): number | null {
    for (const stop of ZOOM_STOPS) if (stop > percent) return stop;
    return null;
  }

  $: zoomOutTarget = stopBelow(state.zoomPercent);
  $: zoomInTarget = stopAbove(state.zoomPercent);

  function compatibilityLabel(value: PackageCompatibilityReport): string {
    const warnings =
      value.droppedSignatures.length +
      value.blockedExecutables.length +
      value.notCarriedAcrossFormat.length +
      value.warnings.length;
    if (warnings) return `Compatibility: ${warnings} warning${warnings === 1 ? "" : "s"}`;
    if (value.restored.length) return `Fidelity: ${value.restored.length} opaque part${value.restored.length === 1 ? "" : "s"} preserved`;
    return "Fidelity checked";
  }

  function compatibilityDetail(value: PackageCompatibilityReport): string {
    const details = [
      value.restored.length ? `${value.restored.length} opaque part(s) restored` : "",
      value.metadataRepaired.length ? `${value.metadataRepaired.length} package metadata part(s) repaired` : "",
      value.droppedSignatures.length ? `${value.droppedSignatures.length} invalidated signature part(s) removed` : "",
      value.blockedExecutables.length ? `${value.blockedExecutables.length} executable payload(s) quarantined` : "",
      value.notCarriedAcrossFormat.length ? `${value.notCarriedAcrossFormat.length} part(s) omitted during format conversion` : "",
      ...value.warnings,
    ].filter(Boolean);
    return details.join("; ") || "Writer package verified";
  }
</script>

<footer class="ow-writer-status" aria-label="Document status">
  <div class="ow-writer-status-primary">
    <span class="ow-writer-engine-state">{state.ready ? "Ready" : state.failure ? "Engine failed" : "Loading Writer"}</span>
    {#if state.pageLabel}
      <span class="ow-writer-stat" title={state.pageTooltip || state.pageLabel}>{state.pageLabel}</span>
    {/if}
    {#if state.wordCountLabel}
      <span class="ow-writer-stat words" title={state.wordCountLabel}>{state.wordCountLabel}</span>
    {/if}
    <span class="ow-writer-file" title={state.fileName}>{state.fileName}</span>
    {#if state.dirty}<span class="ow-writer-unsaved">Unsaved</span>{/if}
    {#if state.requiresSaveAs}
      <span
        class="ow-writer-migration"
        title="Legacy document converted into the Writer engine. Save As DOCX or ODT to continue."
      >Legacy document converted · Save As required</span>
    {/if}
  </div>
  <div class="ow-writer-status-secondary">
    {#if report}
      <span
        class:warning={
          report.droppedSignatures.length > 0 ||
          report.blockedExecutables.length > 0 ||
          report.notCarriedAcrossFormat.length > 0 ||
          report.warnings.length > 0
        }
        title={compatibilityDetail(report)}
      >{compatibilityLabel(report)}</span>
    {/if}
    <span title={`Current page style: ${state.pageStyleName}`}>{state.pageStyleName}</span>
    <span>{state.format.toUpperCase()}</span>
    {#if state.engineVersion}<span>{state.engineVersion}</span>{/if}
    <div class="ow-writer-zoom" role="group" aria-label="Zoom">
      <button
        class="ow-zoom-button"
        type="button"
        aria-label="Zoom out"
        title="Zoom out"
        disabled={!state.ready || zoomOutTarget === null}
        on:click={() => { if (zoomOutTarget !== null) onzoom(zoomOutTarget); }}
      >−</button>
      <button
        class="ow-zoom-button ow-zoom-level"
        type="button"
        aria-label="Reset zoom to 100%"
        title="Reset zoom to 100%"
        disabled={!state.ready}
        on:click={() => onzoom(100)}
      >{Math.round(state.zoomPercent)}%</button>
      <button
        class="ow-zoom-button"
        type="button"
        aria-label="Zoom in"
        title="Zoom in"
        disabled={!state.ready || zoomInTarget === null}
        on:click={() => { if (zoomInTarget !== null) onzoom(zoomInTarget); }}
      >+</button>
    </div>
  </div>
</footer>

<style>
  .ow-writer-status {
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 0 12px;
    border-top: 1px solid var(--ow-chrome-border);
    background: var(--ow-chrome-bg);
    color: var(--ow-text-muted);
    font-size: 11px;
  }

  .ow-writer-status-primary,
  .ow-writer-status-secondary {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .ow-writer-status-secondary {
    justify-content: flex-end;
  }

  .ow-writer-stat,
  .ow-writer-file,
  .ow-writer-status-secondary span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .ow-writer-stat {
    max-width: 210px;
    padding-left: 8px;
    border-left: 1px solid var(--ow-divider);
    color: var(--ow-text);
  }

  .ow-writer-stat.words {
    max-width: 260px;
  }

  .ow-writer-file {
    max-width: 220px;
  }

  .ow-writer-unsaved,
  .ow-writer-migration,
  .warning {
    color: var(--ow-accent);
    font-weight: 600;
  }

  .ow-writer-migration {
    max-width: 260px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .ow-writer-zoom {
    flex: none;
    display: flex;
    align-items: center;
    gap: 2px;
    padding-left: 8px;
    border-left: 1px solid var(--ow-divider);
  }

  .ow-zoom-button {
    appearance: none;
    border: none;
    background: transparent;
    color: var(--ow-text-muted);
    font: inherit;
    line-height: 1;
    min-width: 20px;
    height: 20px;
    padding: 0 4px;
    border-radius: 4px;
    cursor: pointer;
  }

  .ow-zoom-button:hover:not(:disabled) {
    background: var(--ow-hover-bg);
    color: var(--ow-text);
  }

  .ow-zoom-button:focus-visible {
    outline: 2px solid var(--ow-accent);
    outline-offset: 1px;
  }

  .ow-zoom-button:disabled {
    opacity: 0.45;
    cursor: default;
  }

  .ow-zoom-level {
    min-width: 40px;
    font-variant-numeric: tabular-nums;
  }

  @media (max-width: 980px) {
    .ow-writer-engine-state,
    .ow-writer-file,
    .ow-writer-migration { display: none; }
    .ow-writer-stat.words { max-width: 220px; }
  }

  @media (max-width: 760px) {
    .ow-writer-status-secondary > span:nth-last-child(n + 4) { display: none; }
    .ow-writer-stat.words { max-width: 150px; }
  }
</style>
