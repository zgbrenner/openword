<script lang="ts">
  import type { PackageCompatibilityReport } from "@/writer/packagePassthrough";
  import type { WriterState } from "@/writer/state.svelte";

  export let state: WriterState;
  export let report: PackageCompatibilityReport | null = null;

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
    <span>{state.ready ? "Ready" : state.failure ? "Engine failed" : "Loading Writer"}</span>
    <span class="ow-writer-dot" aria-hidden="true">•</span>
    <span>{state.fileName}</span>
    {#if state.dirty}<span class="ow-writer-unsaved">Unsaved</span>{/if}
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

  .ow-writer-status-primary span:nth-child(3),
  .ow-writer-status-secondary span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .ow-writer-status-secondary {
    justify-content: flex-end;
  }

  .ow-writer-dot { opacity: 0.55; }

  .ow-writer-unsaved,
  .warning {
    color: var(--ow-accent);
    font-weight: 600;
  }

  @media (max-width: 780px) {
    .ow-writer-status-secondary span:nth-last-child(n + 3) { display: none; }
  }
</style>
