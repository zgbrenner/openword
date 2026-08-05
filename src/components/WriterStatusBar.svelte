<script lang="ts">
  import type { WriterState } from "@/writer/state.svelte";
  export let state: WriterState;
</script>

<footer class="ow-writer-status" aria-label="Document status">
  <div class="ow-writer-status-primary">
    <span>{state.ready ? "Ready" : state.failure ? "Engine failed" : "Loading Writer"}</span>
    <span class="ow-writer-dot" aria-hidden="true">•</span>
    <span>{state.fileName}</span>
    {#if state.dirty}<span class="ow-writer-unsaved">Unsaved</span>{/if}
  </div>
  <div class="ow-writer-status-secondary">
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

  .ow-writer-status-primary span:nth-child(3) {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .ow-writer-dot { opacity: 0.55; }

  .ow-writer-unsaved {
    color: var(--ow-accent);
    font-weight: 600;
  }
</style>
