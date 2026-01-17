<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';

  let { data } = $props();

  let search = $state('');
  let sortCol = $state<string>('entries');
  let sortAsc = $state(false);

  let filteredCommanders = $derived(() => {
    let result = data.commanders;

    // Search filter
    if (search.trim()) {
      const searchLower = search.toLowerCase();
      result = result.filter(c =>
        c.commander_pair.toLowerCase().includes(searchLower)
      );
    }

    // Sort
    result.sort((a, b) => {
      const aVal = a[sortCol] ?? 0;
      const bVal = b[sortCol] ?? 0;
      if (typeof aVal === 'string') {
        return sortAsc ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortAsc ? aVal - bVal : bVal - aVal;
    });

    return result;
  });

  function handleSort(col: string) {
    if (sortCol === col) {
      sortAsc = !sortAsc;
    } else {
      sortCol = col;
      sortAsc = col === 'commander_pair';
    }
  }

  function updateServerFilters(newPeriod?: string, newMinSize?: number) {
    const params = new URLSearchParams($page.url.searchParams);
    if (newPeriod) params.set('period', newPeriod);
    if (newMinSize) params.set('min_size', newMinSize.toString());
    goto(`?${params.toString()}`, { replaceState: true });
  }

  function formatPct(val: number | null, decimals = 1): string {
    if (val === null || val === undefined) return '0.0%';
    return (val * 100).toFixed(decimals) + '%';
  }
</script>

<div class="page-header">
  <h1>Commanders</h1>
  <p class="subtitle">{filteredCommanders().length} commanders</p>
</div>

<div class="filters">
  <div class="filter-group">
    <label for="search">Search</label>
    <input
      id="search"
      type="text"
      bind:value={search}
      placeholder="Search commanders..."
    />
  </div>

  <div class="filter-group">
    <label for="period">Period</label>
    <select
      id="period"
      value={data.period}
      onchange={(e) => updateServerFilters(e.currentTarget.value)}
    >
      <option value="30d">Last 30 Days</option>
      <option value="90d">Last 90 Days</option>
      <option value="6mo">Last 6 Months</option>
      <option value="1y">Last Year</option>
      <option value="all">All Time</option>
    </select>
  </div>

  <div class="filter-group">
    <label for="minSize">Min Event Size</label>
    <select
      id="minSize"
      value={data.minSize}
      onchange={(e) => updateServerFilters(undefined, parseInt(e.currentTarget.value))}
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
        <th style="width: 50px">#</th>
        <th
          class:sorted-asc={sortCol === 'commander_pair' && sortAsc}
          class:sorted-desc={sortCol === 'commander_pair' && !sortAsc}
          onclick={() => handleSort('commander_pair')}
        >
          Commander
        </th>
        <th
          class="metric"
          class:sorted-asc={sortCol === 'entries' && sortAsc}
          class:sorted-desc={sortCol === 'entries' && !sortAsc}
          onclick={() => handleSort('entries')}
        >
          Entries
        </th>
        <th
          class="metric"
          class:sorted-asc={sortCol === 'win_rate' && sortAsc}
          class:sorted-desc={sortCol === 'win_rate' && !sortAsc}
          onclick={() => handleSort('win_rate')}
        >
          Win%
        </th>
        <th
          class="metric"
          class:sorted-asc={sortCol === 'conversion_rate' && sortAsc}
          class:sorted-desc={sortCol === 'conversion_rate' && !sortAsc}
          onclick={() => handleSort('conversion_rate')}
        >
          Conv%
        </th>
        <th
          class="metric"
          class:sorted-asc={sortCol === 'top4_rate' && sortAsc}
          class:sorted-desc={sortCol === 'top4_rate' && !sortAsc}
          onclick={() => handleSort('top4_rate')}
        >
          Top4%
        </th>
        <th
          class="metric"
          class:sorted-asc={sortCol === 'champ_rate' && sortAsc}
          class:sorted-desc={sortCol === 'champ_rate' && !sortAsc}
          onclick={() => handleSort('champ_rate')}
        >
          Win%
        </th>
      </tr>
    </thead>
    <tbody>
      {#each filteredCommanders() as cmd, i}
        <tr onclick={() => goto(`/commanders/${encodeURIComponent(cmd.commander_pair)}`)}>
          <td>{i + 1}</td>
          <td>
            <a href="/commanders/{encodeURIComponent(cmd.commander_pair)}">
              {cmd.commander_pair}
            </a>
          </td>
          <td class="metric">{cmd.entries}</td>
          <td class="metric">{formatPct(cmd.win_rate, 2)}</td>
          <td class="metric">{formatPct(cmd.conversion_rate, 2)}</td>
          <td class="metric">{formatPct(cmd.top4_rate, 2)}</td>
          <td class="metric">{formatPct(cmd.champ_rate, 2)}</td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>

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
    width: 200px;
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
</style>
