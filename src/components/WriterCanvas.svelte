<script lang="ts">
  import { onMount } from "svelte";
  import { WriterClient } from "@/writer/client";
  import { WriterRuntimeHost } from "@/writer/runtimeHost";
  import WriterEngineFailure from "./WriterEngineFailure.svelte";

  export let onready: (client: WriterClient, host: WriterRuntimeHost) => void;
  export let onfailure: (error: Error) => void = () => {};

  let canvas: HTMLCanvasElement;
  let host: WriterRuntimeHost | null = null;
  let client: WriterClient | null = null;
  let loading = true;
  let failure: Error | null = null;
  let generation = 0;

  function disposePair(nextClient: WriterClient | null, nextHost: WriterRuntimeHost | null) {
    nextClient?.destroy();
    nextHost?.destroy();
  }

  async function initialize() {
    const currentGeneration = ++generation;
    loading = true;
    failure = null;
    disposePair(client, host);
    client = null;
    host = null;

    const nextHost = new WriterRuntimeHost();
    host = nextHost;

    try {
      const transport = await nextHost.start(canvas);
      if (currentGeneration !== generation) {
        disposePair(null, nextHost);
        return;
      }

      const nextClient = new WriterClient(transport);
      client = nextClient;
      await nextClient.ping();
      if (currentGeneration !== generation) {
        disposePair(nextClient, nextHost);
        return;
      }

      loading = false;
      onready(nextClient, nextHost);
      requestAnimationFrame(() => canvas.focus());
    } catch (error) {
      if (currentGeneration !== generation) {
        disposePair(client, nextHost);
        return;
      }
      const normalized = error instanceof Error ? error : new Error(String(error));
      disposePair(client, nextHost);
      client = null;
      host = null;
      loading = false;
      failure = normalized;
      onfailure(normalized);
    }
  }

  onMount(() => {
    void initialize();
    const resizeObserver = new ResizeObserver(() => window.dispatchEvent(new Event("resize")));
    if (canvas.parentElement) resizeObserver.observe(canvas.parentElement);

    return () => {
      generation += 1;
      resizeObserver.disconnect();
      disposePair(client, host);
      client = null;
      host = null;
    };
  });
</script>

<div class="ow-writer-stage" on:selectstart={(event) => event.preventDefault()}>
  {#if loading}
    <div class="ow-writer-loading" role="status" aria-live="polite">
      <span class="ow-writer-spinner" aria-hidden="true"></span>
      <span>Starting Writer…</span>
    </div>
  {:else if failure}
    <div class="ow-writer-failure-wrap">
      <WriterEngineFailure message={failure.message} onretry={() => void initialize()} />
    </div>
  {/if}

  <canvas
    bind:this={canvas}
    id="qtcanvas"
    contenteditable="true"
    class="ow-writer-canvas"
    class:visible={!loading && !failure}
    aria-label="Document editor"
    on:contextmenu={(event) => event.preventDefault()}
    on:wheel|nonpassive={(event) => event.preventDefault()}
  ></canvas>
</div>

<style>
  .ow-writer-stage {
    position: relative;
    flex: 1;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    background: var(--ow-bg);
  }

  .ow-writer-canvas {
    display: block;
    width: 100%;
    height: 100%;
    border: 0;
    padding: 0;
    outline: 0;
    visibility: hidden;
  }

  .ow-writer-canvas.visible {
    visibility: visible;
  }

  .ow-writer-loading,
  .ow-writer-failure-wrap {
    position: absolute;
    inset: 0;
    z-index: 2;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--ow-bg);
  }

  .ow-writer-loading {
    gap: 10px;
    color: var(--ow-text-muted);
  }

  .ow-writer-spinner {
    width: 18px;
    height: 18px;
    border: 2px solid var(--ow-chrome-border);
    border-top-color: var(--ow-accent);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  @media (prefers-reduced-motion: reduce) {
    .ow-writer-spinner { animation: none; }
  }
</style>
