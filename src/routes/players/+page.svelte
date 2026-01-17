<script lang="ts">
  // This page redirects to the featured player (winner of largest event this month)
  // If redirect fails, show a message
</script>

<div class="page-header">
  <h1>Players</h1>
  <p class="subtitle">Loading featured player...</p>
</div>

<p class="empty-state">
  No player data available. Try visiting a specific player page.
</p>

<style>
  .page-header {
    text-align: center;
    margin-bottom: 1.5rem;
  }

  .page-header h1 {
    font-size: 1.75rem;
    margin-bottom: 0.25rem;
  }

  .subtitle {
    color: var(--text-muted);
    font-size: 0.9rem;
  }

  .empty-state {
    color: var(--text-muted);
    text-align: center;
    padding: 2rem;
  }
</style>
