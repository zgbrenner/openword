<script lang="ts">
  export let message: string;
  export let onretry: () => void;
</script>

<section class="ow-writer-failure" role="alert" aria-live="assertive">
  <h2>Writer engine unavailable</h2>
  <p>{message}</p>
  <div class="ow-writer-failure-actions">
    <button type="button" on:click={onretry}>Retry</button>
    <button
      type="button"
      on:click={() => navigator.clipboard?.writeText(message).catch(() => {})}
    >
      Copy diagnostics
    </button>
  </div>
</section>

<style>
  .ow-writer-failure {
    width: min(520px, calc(100% - 48px));
    margin: auto;
    padding: 24px;
    border: 1px solid var(--ow-chrome-border);
    border-radius: 8px;
    background: var(--ow-chrome-bg);
    box-shadow: 0 8px 28px rgba(20, 24, 38, 0.12);
  }

  h2 {
    margin: 0 0 8px;
    font-size: 18px;
  }

  p {
    margin: 0;
    color: var(--ow-text-muted);
    line-height: 1.5;
    overflow-wrap: anywhere;
  }

  .ow-writer-failure-actions {
    display: flex;
    gap: 8px;
    margin-top: 18px;
  }

  button {
    min-height: 32px;
    padding: 0 12px;
    border: 1px solid var(--ow-input-border);
    border-radius: var(--ow-radius);
    background: var(--ow-input-bg);
    color: var(--ow-text);
    cursor: pointer;
  }

  button:first-child {
    border-color: var(--ow-accent);
    background: var(--ow-accent);
    color: white;
  }
</style>
