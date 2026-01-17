<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';

  let { data } = $props();

  let search = $state('');

  let filteredTournaments = $derived(() => {
    if (!search.trim()) return data.tournaments;
    const searchLower = search.toLowerCase();
    return data.tournaments.filter(t =>
      t.tournament_name?.toLowerCase().includes(searchLower)
    );
  });

  function updateFilters(newMinSize?: number, newPage?: number) {
    const params = new URLSearchParams($page.url.searchParams);
    if (newMinSize) params.set('min_size', newMinSize.toString());
    if (newPage) params.set('page', newPage.toString());
    goto(`?${params.toString()}`, { replaceState: true });
  }

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }
</script>

<div class="page-header">
  <h1>Tournaments</h1>
  <p class="subtitle">{filteredTournaments().length} tournaments</p>
</div>

<div class="filters">
  <div class="filter-group">
    <label for="search">Search</label>
    <input
      id="search"
      type="text"
      bind:value={search}
      placeholder="Search tournaments..."
    />
  </div>

  <div class="filter-group">
    <label for="minSize">Min Size</label>
    <select
      id="minSize"
      value={data.minSize}
      onchange={(e) => updateFilters(parseInt(e.currentTarget.value))}
    >
      <option value="16">16+</option>
      <option value="30">30+</option>
      <option value="50">50+</option>
      <option value="100">100+</option>
    </select>
  </div>
</div>

<div class="table-container">
  <table>
    <thead>
      <tr>
        <th>Date</th>
        <th>Tournament</th>
        <th class="metric">Size</th>
        <th>Location</th>
      </tr>
    </thead>
    <tbody>
      {#each filteredTournaments() as tournament}
        <tr onclick={() => goto(`/tournaments/${tournament.tid}`)}>
          <td>{tournament.start_date ? formatDate(tournament.start_date) : '-'}</td>
          <td>
            <a href="/tournaments/{tournament.tid}">{tournament.tournament_name}</a>
          </td>
          <td class="metric">{tournament.total_players || '-'}</td>
          <td>{tournament.location || tournament.city || '-'}</td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>

{#if data.totalPages > 1}
  <div class="pagination">
    <button
      disabled={data.page <= 1}
      onclick={() => updateFilters(undefined, data.page - 1)}
    >
      Previous
    </button>
    <span>Page {data.page} of {data.totalPages}</span>
    <button
      disabled={data.page >= data.totalPages}
      onclick={() => updateFilters(undefined, data.page + 1)}
    >
      Next
    </button>
  </div>
{/if}

{#if data.tournaments.length === 0}
  <p class="empty-state">No tournaments found</p>
{/if}

<style>
  .page-header {
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

  input[type="text"] {
    width: 250px;
  }

  tbody tr {
    cursor: pointer;
  }

  tbody tr:hover {
    background: var(--bg-tertiary);
  }

  td a {
    color: var(--text-primary);
  }

  td a:hover {
    color: var(--accent);
  }

  .pagination {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 1rem;
    margin-top: 1.5rem;
    padding: 1rem;
  }

  .pagination button {
    padding: 0.5rem 1rem;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--text-primary);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .pagination button:hover:not(:disabled) {
    background: var(--bg-tertiary);
    border-color: var(--accent);
  }

  .pagination button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .pagination span {
    color: var(--text-secondary);
  }

  .empty-state {
    color: var(--text-muted);
    text-align: center;
    padding: 2rem;
  }
</style>
