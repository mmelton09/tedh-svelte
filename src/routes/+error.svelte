<script lang="ts">
  import { page } from '$app/stores';
</script>

<div class="error-page">
  <div class="error-art">
    {#if $page.status === 504 || $page.status === 503 || $page.status === 502}
      <span class="error-emoji">🧱</span>
      <h1>Repointing the Foundation</h1>
      <p class="error-subtitle">Our database is undergoing brief maintenance — the commanders have escaped while the mortar dries.</p>
      <p class="error-detail">This usually resolves in under a minute. Refresh to check if we're back.</p>
    {:else if $page.status === 404}
      <span class="error-emoji">🔍</span>
      <h1>Nothing Here</h1>
      <p class="error-subtitle">This page doesn't exist — the commanders searched everywhere.</p>
    {:else}
      <span class="error-emoji">⚡</span>
      <h1>Something Went Wrong</h1>
      <p class="error-subtitle">{$page.error?.message || 'An unexpected error occurred.'}</p>
    {/if}
  </div>

  <div class="error-actions">
    <a href="/" class="error-btn">Back to Meta</a>
    <button class="error-btn secondary" onclick={() => location.reload()}>Refresh</button>
  </div>

  <p class="error-code">{$page.status}</p>
</div>

<style>
  .error-page {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 60vh;
    text-align: center;
    padding: 2rem;
  }

  .error-art {
    margin-bottom: 2rem;
  }

  .error-emoji {
    font-size: 4rem;
    display: block;
    margin-bottom: 1rem;
  }

  .error-page h1 {
    font-size: 1.75rem;
    color: var(--accent);
    margin-bottom: 0.75rem;
  }

  .error-subtitle {
    color: var(--text-muted);
    font-size: 1rem;
    max-width: 480px;
    line-height: 1.6;
    margin: 0 auto 0.5rem;
  }

  .error-detail {
    color: var(--text-muted);
    font-size: 0.85rem;
    opacity: 0.7;
  }

  .error-actions {
    display: flex;
    gap: 12px;
    margin-top: 1rem;
  }

  .error-btn {
    padding: 10px 24px;
    border-radius: 6px;
    font-size: 0.9rem;
    cursor: pointer;
    transition: all 0.2s;
    text-decoration: none;
    background: var(--accent);
    color: #000;
    border: none;
    font-weight: 600;
  }

  .error-btn:hover {
    opacity: 0.9;
  }

  .error-btn.secondary {
    background: var(--bg-tertiary);
    color: var(--text-primary);
    border: 1px solid var(--border);
  }

  .error-btn.secondary:hover {
    border-color: var(--accent);
  }

  .error-code {
    margin-top: 2rem;
    color: var(--border);
    font-size: 0.75rem;
  }
</style>
