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

  /*
   * First-visit runtime download progress. The service worker posts
   * per-file byte counts on this channel while it streams the Writer
   * runtime from the network; warm-cache visits and the desktop build
   * post nothing, so the indicator stays hidden there.
   */
  const PROGRESS_CHANNEL_NAME = "openword-runtime-progress";
  let progressChannel: BroadcastChannel | null = null;
  let progressFiles = new Map<string, { received: number; total: number }>();
  let receivedBytes = 0;
  let totalBytes = 0;
  let showProgress = false;

  $: progressPercent = totalBytes > 0 ? Math.min(100, Math.round((receivedBytes / totalBytes) * 100)) : 0;

  function toMB(bytes: number): number {
    return Math.round(bytes / (1024 * 1024));
  }

  function recomputeProgressTotals() {
    let received = 0;
    let total = 0;
    for (const entry of progressFiles.values()) {
      received += entry.received;
      total += entry.total;
    }
    receivedBytes = received;
    totalBytes = total;
    showProgress = total > 0;
  }

  function handleProgressMessage(event: MessageEvent) {
    const data = event.data as
      | { kind?: unknown; file?: unknown; received?: unknown; total?: unknown }
      | null
      | undefined;
    if (!data || typeof data.file !== "string" || typeof data.total !== "number" || data.total <= 0) return;
    if (data.kind === "progress" && typeof data.received === "number") {
      progressFiles.set(data.file, {
        received: Math.min(Math.max(data.received, 0), data.total),
        total: data.total,
      });
    } else if (data.kind === "done") {
      /* A completed file counts fully, even if the last throttled
         progress message was dropped. */
      progressFiles.set(data.file, { received: data.total, total: data.total });
    } else {
      return;
    }
    recomputeProgressTotals();
  }

  function openProgressChannel() {
    if (typeof BroadcastChannel !== "function" || progressChannel) return;
    try {
      progressChannel = new BroadcastChannel(PROGRESS_CHANNEL_NAME);
      progressChannel.onmessage = handleProgressMessage;
    } catch {
      progressChannel = null;
    }
  }

  function closeProgressChannel() {
    try {
      progressChannel?.close();
    } catch {
      /* Closing is best-effort. */
    }
    progressChannel = null;
  }

  function resetProgress() {
    progressFiles = new Map();
    receivedBytes = 0;
    totalBytes = 0;
    showProgress = false;
  }

  function disposePair(nextClient: WriterClient | null, nextHost: WriterRuntimeHost | null) {
    nextClient?.destroy();
    nextHost?.destroy();
  }

  async function initialize() {
    const currentGeneration = ++generation;
    loading = true;
    failure = null;
    resetProgress();
    openProgressChannel();
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
      closeProgressChannel();
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
      closeProgressChannel();
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
      closeProgressChannel();
      disposePair(client, host);
      client = null;
      host = null;
    };
  });
</script>

<div class="ow-writer-stage" on:selectstart={(event) => event.preventDefault()}>
  {#if loading}
    <div class="ow-writer-loading">
      <div class="ow-writer-loading-row" role="status" aria-live="polite">
        <span class="ow-writer-spinner" aria-hidden="true"></span>
        <span>Starting Writer…</span>
      </div>
      {#if showProgress}
        <div class="ow-writer-download">
          <div
            class="ow-writer-progress-track"
            role="progressbar"
            aria-label="Writer engine download"
            aria-valuemin="0"
            aria-valuemax="100"
            aria-valuenow={progressPercent}
          >
            <div class="ow-writer-progress-fill" style="width: {progressPercent}%"></div>
          </div>
          <div class="ow-writer-progress-label" aria-live="polite">
            Downloading Writer engine — {toMB(receivedBytes)} MB of {toMB(totalBytes)} MB
          </div>
          <div class="ow-writer-progress-note">
            First visit downloads the editor engine; afterwards OpenWord works offline.
          </div>
        </div>
      {/if}
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
    flex-direction: column;
    gap: 14px;
    color: var(--ow-text-muted);
  }

  .ow-writer-loading-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .ow-writer-download {
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: min(340px, 80%);
  }

  .ow-writer-progress-track {
    height: 6px;
    background: var(--ow-input-bg);
    border: 1px solid var(--ow-input-border);
    border-radius: 999px;
    overflow: hidden;
  }

  .ow-writer-progress-fill {
    height: 100%;
    background: var(--ow-accent);
    transition: width 0.2s ease;
  }

  .ow-writer-progress-label {
    font-size: 13px;
    color: var(--ow-text);
    text-align: center;
  }

  .ow-writer-progress-note {
    font-size: 12px;
    color: var(--ow-text-muted);
    text-align: center;
  }

  @media (prefers-reduced-motion: reduce) {
    .ow-writer-progress-fill { transition: none; }
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
