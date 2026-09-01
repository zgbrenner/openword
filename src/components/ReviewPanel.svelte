<script lang="ts">
  import { getContext } from "svelte";
  import type { EditorController } from "@/lib/editorController.svelte";
  import type { ReviewPanelState } from "@/lib/reviewPanelState.svelte";
  import { findSuggestions, type SuggestionInfo } from "@/editor/trackChanges";
  import type { CommentThread } from "@/editor/comments";
  import { getAuthorName, setAuthorName } from "@/lib/authorIdentity";

  const controller = getContext<EditorController>("editor");
  const panel = getContext<ReviewPanelState>("reviewPanel");

  let replyDrafts = $state<Record<string, string>>({});
  let authorName = $state(getAuthorName());

  function updateAuthorName(value: string): void {
    setAuthorName(value);
    authorName = getAuthorName();
  }

  // Reading controller.snapshot forces recomputation on every transaction —
  // both lists' anchor positions are looked up fresh at click-time anyway
  // (selectCommentAnchor / selectSuggestionRange re-scan the live doc), so
  // staying "as fresh as the last edit" here is plenty, no need for a
  // dedicated position-tracking subscription.
  const suggestions = $derived.by(() => {
    void controller.snapshot;
    return findSuggestions(controller.doc, controller.suggestionMeta);
  });

  const openComments = $derived(controller.comments.filter((t) => !t.resolved));
  const resolvedComments = $derived(controller.comments.filter((t) => t.resolved));

  function formatDate(ms: number): string {
    const d = new Date(ms);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + " " + d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }

  function preview(info: SuggestionInfo): string {
    const text = controller.doc.textBetween(info.from, info.to, " ").trim();
    return text.length > 0 ? text : info.kind === "insertion" ? "(inserted content)" : "(deleted content)";
  }

  function submitReply(thread: CommentThread) {
    const text = (replyDrafts[thread.id] ?? "").trim();
    if (!text) return;
    controller.replyToComment(thread.id, text);
    replyDrafts = { ...replyDrafts, [thread.id]: "" };
  }
</script>

{#if panel.open}
  <aside class="ow-review-panel" aria-label="Comments and changes">
    <div class="ow-review-header">
      <div class="ow-review-tabs" role="tablist">
        <button class="ow-review-tab" class:active={panel.tab === "comments"} onclick={() => (panel.tab = "comments")}>
          Comments {controller.comments.length ? `(${openComments.length})` : ""}
        </button>
        <button class="ow-review-tab" class:active={panel.tab === "changes"} onclick={() => (panel.tab = "changes")}>
          Changes {suggestions.length ? `(${suggestions.length})` : ""}
        </button>
      </div>
      <button class="ow-icon-btn" title="Close" onclick={panel.close}>✕</button>
    </div>

    {#if panel.tab === "comments"}
      <div class="ow-review-body">
        {#if openComments.length === 0 && resolvedComments.length === 0}
          <p class="ow-review-empty">No comments yet. Select text and use the comment button in the toolbar to add one.</p>
        {/if}
        {#each openComments as thread (thread.id)}
          <div class="ow-comment-card">
            <button class="ow-comment-anchor-jump" onclick={() => controller.selectCommentAnchor(thread.id)}>
              {#each thread.entries as entry, i (entry.id)}
                <div class="ow-comment-entry" class:reply={i > 0}>
                  <div class="ow-comment-meta"><strong>{entry.author}</strong> <span>{formatDate(entry.createdAt)}</span></div>
                  <div class="ow-comment-text">{entry.text}</div>
                </div>
              {/each}
            </button>
            <div class="ow-comment-reply-row">
              <input
                type="text"
                placeholder="Reply..."
                value={replyDrafts[thread.id] ?? ""}
                oninput={(e) => (replyDrafts = { ...replyDrafts, [thread.id]: (e.target as HTMLInputElement).value })}
                onkeydown={(e) => e.key === "Enter" && submitReply(thread)}
              />
            </div>
            <div class="ow-comment-actions">
              <button class="ow-btn-small" onclick={() => controller.resolveComment(thread.id)}>Resolve</button>
              <button class="ow-btn-small ow-btn-danger" onclick={() => controller.deleteCommentThread(thread.id)}>Delete</button>
            </div>
          </div>
        {/each}
        {#if resolvedComments.length > 0}
          <div class="ow-review-section-label">Resolved</div>
          {#each resolvedComments as thread (thread.id)}
            <div class="ow-comment-card resolved">
              <button class="ow-comment-anchor-jump" onclick={() => controller.selectCommentAnchor(thread.id)}>
                <div class="ow-comment-entry">
                  <div class="ow-comment-meta"><strong>{thread.entries[0].author}</strong> <span>{formatDate(thread.entries[0].createdAt)}</span></div>
                  <div class="ow-comment-text">{thread.entries[0].text}</div>
                </div>
              </button>
              <div class="ow-comment-actions">
                <button class="ow-btn-small" onclick={() => controller.reopenComment(thread.id)}>Reopen</button>
                <button class="ow-btn-small ow-btn-danger" onclick={() => controller.deleteCommentThread(thread.id)}>Delete</button>
              </div>
            </div>
          {/each}
        {/if}
      </div>
    {:else}
      <div class="ow-review-body">
        <label class="ow-track-toggle">
          <input type="checkbox" checked={controller.snapshot.suggestingMode} onchange={controller.toggleSuggesting} />
          Track changes
        </label>
        {#if suggestions.length > 0}
          <div class="ow-review-bulk-actions">
            <button class="ow-btn-small" onclick={controller.acceptAllSuggestions}>Accept all</button>
            <button class="ow-btn-small" onclick={controller.rejectAllSuggestions}>Reject all</button>
          </div>
        {:else}
          <p class="ow-review-empty">No pending suggestions. Turn on Track changes above to start suggesting edits.</p>
        {/if}
        {#each suggestions as s (s.id)}
          <div class="ow-suggestion-card">
            <button class="ow-comment-anchor-jump" onclick={() => controller.selectSuggestionRange(s.id)}>
              <div class="ow-comment-meta">
                <span class="ow-suggestion-kind" class:insertion={s.kind === "insertion"} class:deletion={s.kind === "deletion"}>
                  {s.kind === "insertion" ? "Added" : s.kind === "deletion" ? "Deleted" : "Changed"}
                </span>
                <strong>{s.meta?.author ?? "Unknown"}</strong>
                {#if s.meta}<span>{formatDate(s.meta.date)}</span>{/if}
              </div>
              <div class="ow-comment-text ow-suggestion-preview">"{preview(s)}"</div>
            </button>
            <div class="ow-comment-actions">
              <button class="ow-btn-small" onclick={() => controller.acceptSuggestion(s.id)}>Accept</button>
              <button class="ow-btn-small ow-btn-danger" onclick={() => controller.rejectSuggestion(s.id)}>Reject</button>
            </div>
          </div>
        {/each}
      </div>
    {/if}

    <!-- Comments and tracked changes are attributed to this name. OpenWord is
         local-first with no accounts, so it is simply kept on this device. -->
    <label class="ow-review-identity">
      Your name
      <input
        type="text"
        placeholder="You"
        value={authorName}
        onchange={(e) => updateAuthorName((e.target as HTMLInputElement).value)}
      />
    </label>
  </aside>
{/if}

<style>
  .ow-review-panel {
    width: 280px;
    flex: none;
    display: flex;
    flex-direction: column;
    background: var(--ow-chrome-bg);
    border-left: 1px solid var(--ow-chrome-border);
    overflow: hidden;
  }

  .ow-review-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 6px 6px 10px;
    border-bottom: 1px solid var(--ow-chrome-border);
    flex: none;
  }

  .ow-review-tabs {
    display: flex;
    gap: 4px;
  }

  .ow-review-tab {
    background: transparent;
    border: none;
    color: var(--ow-text-muted);
    font-size: 13px;
    padding: 5px 9px;
    border-radius: var(--ow-radius);
    cursor: pointer;
  }
  .ow-review-tab.active {
    background: var(--ow-active-bg);
    color: var(--ow-accent);
    font-weight: 600;
  }

  .ow-review-body {
    flex: 1;
    overflow-y: auto;
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .ow-review-empty {
    color: var(--ow-text-muted);
    font-size: 12px;
    line-height: 1.5;
    margin: 4px 2px;
  }

  .ow-review-identity {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border-top: 1px solid var(--ow-chrome-border);
    font-size: 12px;
    color: var(--ow-text-muted);
    flex: none;
  }

  .ow-review-identity input {
    flex: 1;
    min-width: 0;
    background: var(--ow-input-bg);
    border: 1px solid var(--ow-input-border);
    border-radius: 5px;
    color: var(--ow-text);
    padding: 4px 7px;
    font-size: 12px;
  }

  .ow-review-section-label {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--ow-text-muted);
    margin-top: 4px;
  }

  .ow-comment-card,
  .ow-suggestion-card {
    border: 1px solid var(--ow-chrome-border);
    border-radius: 8px;
    background: var(--ow-bg);
    overflow: hidden;
  }
  .ow-comment-card.resolved {
    opacity: 0.65;
  }

  .ow-comment-anchor-jump {
    display: block;
    width: 100%;
    text-align: left;
    background: transparent;
    border: none;
    padding: 8px 10px 4px;
    cursor: pointer;
    color: inherit;
    font: inherit;
  }
  .ow-comment-anchor-jump:hover {
    background: var(--ow-hover-bg);
  }

  .ow-comment-entry {
    margin-bottom: 6px;
  }
  .ow-comment-entry.reply {
    padding-left: 10px;
    border-left: 2px solid var(--ow-chrome-border);
  }

  .ow-comment-meta {
    display: flex;
    align-items: baseline;
    gap: 6px;
    font-size: 11px;
    color: var(--ow-text-muted);
    margin-bottom: 2px;
  }

  .ow-comment-text {
    font-size: 13px;
    line-height: 1.4;
    word-break: break-word;
  }

  .ow-suggestion-preview {
    font-style: italic;
    color: var(--ow-text-muted);
  }

  .ow-suggestion-kind {
    font-weight: 600;
    text-transform: uppercase;
    font-size: 10px;
    letter-spacing: 0.03em;
    padding: 1px 5px;
    border-radius: 4px;
  }
  .ow-suggestion-kind.insertion {
    color: #1a7f37;
    background: rgba(26, 127, 55, 0.12);
  }
  .ow-suggestion-kind.deletion {
    color: #c0392b;
    background: rgba(192, 57, 43, 0.12);
  }

  .ow-comment-reply-row {
    padding: 0 10px 8px;
  }
  .ow-comment-reply-row input {
    width: 100%;
    background: var(--ow-input-bg);
    border: 1px solid var(--ow-input-border);
    border-radius: var(--ow-radius);
    color: var(--ow-text);
    padding: 4px 7px;
    font-size: 12px;
  }

  .ow-comment-actions,
  .ow-review-bulk-actions {
    display: flex;
    gap: 6px;
    padding: 0 10px 8px;
  }

  .ow-btn-small {
    background: var(--ow-hover-bg);
    border: 1px solid var(--ow-chrome-border);
    border-radius: var(--ow-radius);
    padding: 4px 9px;
    font-size: 12px;
    cursor: pointer;
    color: var(--ow-text);
  }
  .ow-btn-small:hover {
    background: var(--ow-active-bg);
  }
  .ow-btn-danger:hover {
    background: rgba(214, 69, 69, 0.15);
    color: var(--ow-danger);
  }

  .ow-track-toggle {
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: 13px;
    padding: 2px 2px 8px;
    border-bottom: 1px solid var(--ow-chrome-border);
    margin-bottom: 2px;
    cursor: pointer;
  }
</style>
