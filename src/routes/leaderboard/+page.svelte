<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation';
  import { page } from '$app/stores';

  let { data } = $props();

  let searchInput = $state(data.search || '');
  let colGroup = $state(1);

  // Date range state
  let dateStart = $state(data.periodStart || '');
  let dateEnd = $state(data.periodEnd || '');

  // Keep date inputs in sync with server data
  $effect(() => {
    dateStart = data.periodStart || '';
    dateEnd = data.periodEnd || '';
  });

  async function updateParams(updates: Record<string, string | number>) {
    const params = new URLSearchParams($page.url.searchParams);
    for (const [key, value] of Object.entries(updates)) {
      if (value === '' || value === null || value === undefined) {
        params.delete(key);
      } else {
        params.set(key, String(value));
      }
    }
    await goto(`?${params.toString()}`, { replaceState: true });
    await invalidateAll();
  }

  function handleSearchKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      updateParams({ search: searchInput, page: 1 });
    }
  }

  function applyDateRange() {
    if (!dateStart || !dateEnd) return;
    updateParams({ period: 'custom', start: dateStart, end: dateEnd, page: 1 });
  }

  function shiftPeriod(direction: number) {
    if (!data.periodStart || !data.periodEnd) return;
    const start = new Date(data.periodStart);
    const end = new Date(data.periodEnd);
    const duration = end.getTime() - start.getTime();

    const newStart = new Date(start.getTime() + (direction * duration));
    const newEnd = new Date(end.getTime() + (direction * duration));

    // Don't go into the future
    if (newEnd > new Date()) return;

    updateParams({
      period: 'custom',
      start: newStart.toISOString().split('T')[0],
      end: newEnd.toISOString().split('T')[0],
      page: 1
    });
  }

  function clearSearch() {
    searchInput = '';
    updateParams({ search: '', page: 1 });
  }

  function handleSort(col: string) {
    if (data.sortBy === col) {
      updateParams({ order: data.sortOrder === 'desc' ? 'asc' : 'desc' });
    } else {
      updateParams({ sort: col, order: 'desc' });
    }
  }

  function goToPage(newPage: number) {
    if (newPage >= 1 && newPage <= data.totalPages) {
      updateParams({ page: newPage });
    }
  }

  function formatPct(val: number | null, decimals = 1): string {
    if (val === null || val === undefined) return '-';
    return val.toFixed(decimals) + '%';
  }

  function formatElo(elo: number | null): number {
    if (elo === null || elo === undefined) return 100;
    return Math.max(100, Math.round(elo));
  }

  function getEloClass(elo: number | null): string {
    if (!elo) return 'elo-low';
    if (elo >= 1800) return 'elo-high';
    if (elo >= 1600) return 'elo-mid';
    return 'elo-low';
  }

  function getSortIndicator(col: string): string {
    if (data.sortBy !== col) return '';
    return data.sortOrder === 'desc' ? ' ▼' : ' ▲';
  }

  function getRank(index: number): number {
    return (data.page - 1) * data.perPage + index + 1;
  }

  function shortenCommander(name: string | null): string {
    if (!name) return '-';
    // Shorten partner pairs
    if (name.includes(' / ')) {
      const [a, b] = name.split(' / ');
      const shortenName = (n: string) => {
        const parts = n.split(',')[0].split(' ');
        return parts[0];
      };
      return `${shortenName(a)} / ${shortenName(b)}`;
    }
    return name.length > 20 ? name.substring(0, 20) + '...' : name;
  }

  function calc5wiss(wins: number, losses: number, draws: number): string {
    const total = wins + losses + draws;
    if (total === 0) return '-';
    const winRate = wins / total;
    const drawRate = draws / total;
    return ((winRate * 5) + (drawRate * 1)).toFixed(2);
  }

  function calcWinPct(wins: number, losses: number, draws: number): string {
    const total = wins + losses + draws;
    if (total === 0) return '-';
    return ((wins / total) * 100).toFixed(1) + '%';
  }

  function calcRate(count: number, entries: number): string {
    if (entries === 0) return '-';
    return ((count / entries) * 100).toFixed(1) + '%';
  }

  function getTierBadge(tier: string | undefined): { label: string; class: string } {
    switch (tier) {
      case 'proven': return { label: 'P', class: 'tier-proven' };
      case 'rising': return { label: 'R', class: 'tier-rising' };
      default: return { label: '?', class: 'tier-provisional' };
    }
  }

  // Period groups for toggles
  const periodGroups = {
    recent: [
      { value: 'last_week', label: 'Last Week' }
    ],
    months: [
      { value: 'current_month', label: 'This Month' },
      { value: 'prev_month', label: 'Last Month' }
    ],
    rolling: [
      { value: '1m', label: '30d' },
      { value: '3m', label: '3mo' },
      { value: '6m', label: '6mo' },
      { value: '1y', label: '1yr' }
    ],
    era: [
      { value: 'post_ban', label: 'Post-RC' },
      { value: 'all', label: 'All Time' }
    ]
  };
</script>

<div class="page-header">
  <h1>tEDH Player Leaderboard</h1>
  <p class="qualification-note">Qualification: 10+ ranked games in 30+ player tournaments</p>
</div>

<!-- Period Toggle -->
<div class="period-toggle">
  <span class="period-group">
    {#each periodGroups.recent as p}
      <button
        class="period-btn"
        class:active={data.period === p.value}
        onclick={() => updateParams({ period: p.value, page: 1 })}
      >{p.label}</button>
    {/each}
  </span>
  <span class="period-separator">|</span>
  <span class="period-group">
    {#each periodGroups.months as p}
      <button
        class="period-btn"
        class:active={data.period === p.value}
        onclick={() => updateParams({ period: p.value, page: 1 })}
      >{p.label}</button>
    {/each}
  </span>
  <span class="period-separator">|</span>
  <span class="period-group">
    {#each periodGroups.rolling as p}
      <button
        class="period-btn"
        class:active={data.period === p.value}
        onclick={() => updateParams({ period: p.value, page: 1 })}
      >{p.label}</button>
    {/each}
  </span>
  <span class="period-separator">|</span>
  <span class="period-group era-section">
    <span class="era-label">Era</span>
    {#each periodGroups.era as p}
      <button
        class="period-btn"
        class:active={data.period === p.value}
        onclick={() => updateParams({ period: p.value, page: 1 })}
      >{p.label}</button>
    {/each}
  </span>
</div>

<!-- Stats Summary -->
<div class="stats-summary">
  <strong>{data.periodLabel || data.period}</strong>
  &nbsp;|&nbsp;
  {#if data.periodStart && data.periodEnd}
  <span class="date-nav-group">
    <button
      class="nav-arrow"
      onclick={() => shiftPeriod(-1)}
      title="Previous period"
      disabled={data.period === 'all'}
    >&lt;&lt;</button>
    <input type="date" bind:value={dateStart} onchange={applyDateRange} />
    <span>-</span>
    <input type="date" bind:value={dateEnd} onchange={applyDateRange} />
    <button
      class="nav-arrow"
      onclick={() => shiftPeriod(1)}
      title="Next period"
      disabled={data.period === 'all'}
    >&gt;&gt;</button>
  </span>
  &nbsp;|&nbsp;
  {/if}
  <strong>{data.totalCount.toLocaleString()}</strong> players
  &nbsp;|&nbsp;
  Avg ELO: <strong>{data.avgElo?.toFixed(0) || '-'}</strong>
  &nbsp;|&nbsp;
  Top: <strong>{data.maxElo?.toFixed(0) || '-'}</strong>
  &nbsp;|&nbsp;
  <span class="tier-thresholds">
    <span class="tier-proven">P</span>≥{data.tierThresholds?.provenGames || 50}g (p{data.tierThresholds?.provenPct || '?'})
    <span class="tier-rising">R</span>≥{data.tierThresholds?.risingGames || 30}g (p{data.tierThresholds?.risingPct || '?'})
  </span>
</div>

<!-- Column Group Toggle (mobile) -->
<div class="col-group-toggle">
  <button class="col-group-btn" class:active={colGroup === 1} onclick={() => colGroup = 1}>ELO</button>
  <button class="col-group-btn" class:active={colGroup === 2} onclick={() => colGroup = 2}>Win</button>
  <button class="col-group-btn" class:active={colGroup === 3} onclick={() => colGroup = 3}>Conv</button>
  <button class="col-group-btn" class:active={colGroup === 4} onclick={() => colGroup = 4}>Top4</button>
  <button class="col-group-btn" class:active={colGroup === 5} onclick={() => colGroup = 5}>🏆</button>
</div>

<!-- Filters -->
<div class="filters">
  <div class="filter-group search-group">
    <label for="search">Search:</label>
    <input
      id="search"
      type="text"
      bind:value={searchInput}
      placeholder="Player name..."
      class="search-input"
      onkeydown={handleSearchKeydown}
    />
    {#if searchInput}
      <button class="clear-search" onclick={clearSearch}>✕</button>
    {/if}
  </div>

  <div class="filter-group">
    <label for="minSize">Event Size:</label>
    <select
      id="minSize"
      class:filter-active={data.minSize !== 50}
      value={String(data.minSize)}
      onchange={(e) => updateParams({ min_size: parseInt(e.currentTarget.value) || 50, page: 1 })}
    >
      <option value="16">16+</option>
      <option value="30">30+</option>
      <option value="50">50+</option>
      <option value="100">100+</option>
      <option value="250">250+</option>
    </select>
  </div>

  <div class="filter-group">
    <label for="minEntries">Min Entries:</label>
    <select
      id="minEntries"
      class:filter-active={data.minEntries !== 1}
      value={String(data.minEntries)}
      onchange={(e) => updateParams({ min_entries: parseInt(e.currentTarget.value) || 1, page: 1 })}
    >
      <option value="1">1+</option>
      <option value="3">3+</option>
      <option value="5">5+</option>
      <option value="10">10+</option>
      <option value="20">20+</option>
    </select>
  </div>

  <div class="filter-group">
    <label for="perPage">Per Page:</label>
    <select
      id="perPage"
      value={String(data.perPage)}
      onchange={(e) => updateParams({ per_page: parseInt(e.currentTarget.value), page: 1 })}
    >
      <option value="50">50</option>
      <option value="100">100</option>
      <option value="200">200</option>
      <option value="500">500</option>
    </select>
  </div>
</div>

<!-- Leaderboard Table -->
<div class="table-container">
  <table class="show-g{colGroup}">
    <thead>
      <tr>
        <th class="metric">#</th>
        <th class="sortable" onclick={() => handleSort('player_name')}>
          Player{getSortIndicator('player_name')}
        </th>
        <th class="col-g1 commander-col">Commander</th>
        <th class="metric sortable col-g1" onclick={() => handleSort('openskill_elo')}>
          ELO{getSortIndicator('openskill_elo')}
        </th>
        <th class="metric sortable col-g2" onclick={() => handleSort('entries')}>
          Entries{getSortIndicator('entries')}
        </th>
        <th class="metric sortable col-g2" onclick={() => handleSort('wins')}>
          Record{getSortIndicator('wins')}
        </th>
        <th class="metric sortable col-g2" onclick={() => handleSort('five_swiss')} title="5wiss = (Win% × 5) + (Draw% × 1)">
          5wiss{getSortIndicator('five_swiss')}
        </th>
        <th class="metric sortable col-g2" onclick={() => handleSort('win_rate')}>
          Win%{getSortIndicator('win_rate')}
        </th>
        <th class="metric sortable col-g3" onclick={() => handleSort('conversions')}>
          Conv{getSortIndicator('conversions')}
        </th>
        <th class="metric sortable col-g3" onclick={() => handleSort('conv_pct')}>
          Conv%{getSortIndicator('conv_pct')}
        </th>
        <th class="metric sortable col-g4" onclick={() => handleSort('top4s')}>
          Top4{getSortIndicator('top4s')}
        </th>
        <th class="metric sortable col-g4" onclick={() => handleSort('top4_pct')}>
          Top4%{getSortIndicator('top4_pct')}
        </th>
        <th class="metric sortable col-g5" onclick={() => handleSort('championships')}>
          🏆{getSortIndicator('championships')}
        </th>
        <th class="metric sortable col-g5" onclick={() => handleSort('champ_pct')}>
          🏆%{getSortIndicator('champ_pct')}
        </th>
        <th class="metric sortable col-g5" onclick={() => handleSort('placement_pct')} title="Average placement percentile">
          AvgX%{getSortIndicator('placement_pct')}
        </th>
      </tr>
    </thead>
    <tbody>
      {#each data.players as player, i}
        {@const rank = getRank(i)}
        {@const tierBadge = getTierBadge(player.tier)}
        <tr
          onclick={() => goto(`/players/${player.player_id}`)}
        >
          <td class="metric">{rank}</td>
          <td>
            <span class="tier-badge {tierBadge.class}" title="{player.tier} ({player.games} games)">{tierBadge.label}</span>
            <a href="/players/{player.player_id}" class="player-name" onclick={(e) => e.stopPropagation()}>
              {player.player_name}
            </a>
          </td>
          <td class="col-g1 commander-col">
            {#if player.main_commander}
              <a href="/commanders/{encodeURIComponent(player.main_commander)}" class="commander-link" onclick={(e) => e.stopPropagation()}>
                {shortenCommander(player.main_commander)}
              </a>
              {#if player.commander_pct}<span class="cmd-pct">({player.commander_pct.toFixed(0)}%)</span>{/if}
            {:else}
              -
            {/if}
          </td>
          <td class="metric col-g1 {getEloClass(player.openskill_elo)}">
            {formatElo(player.openskill_elo)}
            <span class="elo-rank">(#{player.elo_rank || '-'})</span>
          </td>
          <td class="metric col-g2">{player.entries}</td>
          <td class="metric col-g2">{player.wins}-{player.losses}-{player.draws}</td>
          <td class="metric col-g2">{calc5wiss(player.wins, player.losses, player.draws)}</td>
          <td class="metric col-g2">{calcWinPct(player.wins, player.losses, player.draws)}</td>
          <td class="metric col-g3">{player.conversions}</td>
          <td class="metric col-g3">{calcRate(player.conversions, player.entries)}</td>
          <td class="metric col-g4">{player.top4s}</td>
          <td class="metric col-g4">{calcRate(player.top4s, player.entries)}</td>
          <td class="metric col-g5">{player.championships}</td>
          <td class="metric col-g5">{calcRate(player.championships, player.entries)}</td>
          <td class="metric col-g5">{player.avg_placement_pct?.toFixed(1) || '-'}%</td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>

<!-- Pagination -->
{#if data.totalPages > 1}
  <div class="pagination">
    <button
      class="page-btn"
      disabled={data.page <= 1}
      onclick={() => goToPage(1)}
    >First</button>
    <button
      class="page-btn"
      disabled={data.page <= 1}
      onclick={() => goToPage(data.page - 1)}
    >Prev</button>

    <span class="page-info">
      Page <strong>{data.page}</strong> of <strong>{data.totalPages}</strong>
      &nbsp;({data.totalCount.toLocaleString()} total)
    </span>

    <button
      class="page-btn"
      disabled={data.page >= data.totalPages}
      onclick={() => goToPage(data.page + 1)}
    >Next</button>
    <button
      class="page-btn"
      disabled={data.page >= data.totalPages}
      onclick={() => goToPage(data.totalPages)}
    >Last</button>
  </div>
{/if}

<!-- Legend -->
<div class="legend">
  <strong>Legend:</strong>
  <span class="tier-proven">P</span>=Proven (p90)
  <span class="tier-rising">R</span>=Rising (p70)
  <span class="tier-provisional">?</span>=Provisional |
  5wiss = (Win% × 5) + (Draw% × 1) |
  AvgX% = Average placement percentile (100% = always 1st)
</div>

<!-- ELO Methodology -->
<div class="methodology">
  <strong>ELO Methodology:</strong>
  Rankings use <a href="https://openskill.me" target="_blank" rel="noopener">OpenSkill</a> (Plackett-Luce model) calculated from pod results in 30+ player tournaments with complete match data.
  Each pod is treated as a 4-player free-for-all where the winner places 1st and others tie for 2nd.
  New players start at 1500. Only "ranked" games (tournaments with complete pod data) affect ELO.
</div>

{#if data.players.length === 0}
  <p class="empty-state">No players found matching your criteria.</p>
{/if}

<style>
  .page-header {
    text-align: center;
    margin-bottom: 1rem;
  }

  .page-header h1 {
    font-size: 1.75rem;
    color: var(--accent);
    margin-bottom: 0.25rem;
  }

  .qualification-note {
    color: var(--text-muted);
    font-size: 0.85em;
    margin-top: 0.5rem;
  }

  /* Period Toggle */
  .period-toggle {
    display: flex;
    justify-content: center;
    flex-wrap: wrap;
    gap: 8px;
    margin: 15px 0;
  }

  .period-group {
    display: flex;
    gap: 4px;
  }

  .era-section {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .era-label {
    color: var(--text-muted);
    font-size: 0.75em;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .period-btn {
    background: transparent;
    border: 1px solid var(--border);
    color: var(--text-muted);
    padding: 6px 12px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.85em;
    transition: all 0.2s;
  }

  .period-btn:hover {
    color: var(--text-primary);
    border-color: #666;
  }

  .period-btn.active {
    background: #333;
    color: var(--accent);
    border-color: var(--accent);
  }

  .period-separator {
    color: var(--border);
    margin: 0 5px;
    align-self: center;
  }

  /* Stats Summary */
  .stats-summary {
    text-align: center;
    color: var(--text-muted);
    margin: 15px 0 20px 0;
    padding: 15px;
    background: var(--bg-secondary);
    border-radius: 8px;
  }

  .stats-summary strong {
    color: var(--accent);
  }

  .date-nav-group {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .date-nav-group input[type="date"] {
    padding: 4px 6px;
    background: var(--bg-tertiary);
    color: var(--text-primary);
    border: 1px solid var(--border);
    border-radius: 4px;
    font-size: 0.85em;
  }

  .nav-arrow {
    background: var(--bg-tertiary);
    border: 1px solid var(--border);
    color: var(--accent);
    padding: 4px 10px;
    border-radius: 4px;
    cursor: pointer;
    font-weight: bold;
    transition: all 0.2s;
  }

  .nav-arrow:hover:not(:disabled) {
    background: var(--bg-card);
    border-color: var(--accent);
  }

  .nav-arrow:disabled {
    color: var(--text-muted);
    cursor: not-allowed;
    opacity: 0.5;
  }

  /* Column Group Toggle */
  .col-group-toggle {
    display: none;
    justify-content: center;
    gap: 4px;
    margin: 10px 0;
  }

  .col-group-btn {
    background: var(--bg-tertiary);
    border: 1px solid var(--border);
    color: var(--text-muted);
    padding: 6px 12px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.8em;
  }

  .col-group-btn.active {
    background: #333;
    color: var(--accent);
    border-color: var(--accent);
  }

  /* Filters */
  .filters {
    display: flex;
    justify-content: center;
    align-items: center;
    flex-wrap: wrap;
    gap: 15px;
    margin: 20px 0;
    padding: 12px;
    background: var(--bg-secondary);
    border-radius: 8px;
  }

  .filter-group {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .filter-group label {
    color: var(--text-muted);
    font-size: 0.85em;
  }

  .search-group {
    position: relative;
  }

  .search-input {
    width: 200px;
    padding: 8px 12px;
    padding-right: 30px;
    background: var(--bg-tertiary);
    color: var(--text-primary);
    border: 1px solid var(--border);
    border-radius: 4px;
  }

  .clear-search {
    position: absolute;
    right: 8px;
    top: 50%;
    transform: translateY(-50%);
    background: none;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    font-size: 0.9em;
    padding: 2px 6px;
  }

  .clear-search:hover {
    color: var(--negative);
  }

  .filter-group select {
    padding: 8px 12px;
    background: var(--bg-tertiary);
    color: var(--text-primary);
    border: 1px solid var(--border);
    border-radius: 4px;
    cursor: pointer;
  }

  .filter-group select.filter-active {
    border-color: var(--accent);
  }

  /* Table */
  thead {
    position: sticky;
    top: 0;
    z-index: 10;
  }

  thead th {
    background: var(--bg-secondary);
    border-bottom: 2px solid var(--border);
  }

  .sortable {
    cursor: pointer;
    user-select: none;
  }

  .sortable:hover {
    background: var(--bg-tertiary);
  }

  tbody tr {
    cursor: pointer;
  }

  tbody tr:hover {
    background: var(--bg-tertiary);
  }

  .player-name {
    color: var(--text-primary);
  }

  .player-name:hover {
    color: var(--accent);
  }

  .commander-col {
    max-width: 180px;
    font-size: 0.85em;
    color: var(--text-muted);
  }

  .commander-link {
    color: var(--text-muted);
  }

  .commander-link:hover {
    color: var(--accent);
  }

  .cmd-pct {
    color: #666;
    font-size: 0.9em;
    margin-left: 4px;
  }

  .elo-high { color: var(--accent); font-weight: 600; }
  .elo-mid { color: #8BC34A; }
  .elo-low { color: var(--text-muted); }

  /* Tier badges */
  .tier-badge {
    display: inline-block;
    width: 16px;
    height: 16px;
    line-height: 16px;
    text-align: center;
    font-size: 10px;
    font-weight: bold;
    border-radius: 3px;
    margin-right: 6px;
  }

  .tier-proven {
    background: var(--accent);
    color: #000;
  }

  .tier-rising {
    background: #8BC34A;
    color: #000;
  }

  .tier-provisional {
    background: #555;
    color: #999;
  }

  .tier-thresholds {
    font-size: 0.9em;
  }

  .tier-thresholds .tier-proven,
  .tier-thresholds .tier-rising {
    display: inline-block;
    width: 14px;
    height: 14px;
    line-height: 14px;
    text-align: center;
    font-size: 9px;
    font-weight: bold;
    border-radius: 2px;
    margin-right: 2px;
  }

  .legend .tier-proven,
  .legend .tier-rising,
  .legend .tier-provisional {
    display: inline-block;
    width: 14px;
    height: 14px;
    line-height: 14px;
    text-align: center;
    font-size: 9px;
    font-weight: bold;
    border-radius: 2px;
    margin: 0 2px;
  }

  .elo-rank {
    color: #666;
    font-size: 0.8em;
    margin-left: 4px;
  }

  /* Pagination */
  .pagination {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 10px;
    margin: 20px 0;
    padding: 15px;
    background: var(--bg-secondary);
    border-radius: 8px;
  }

  .page-btn {
    padding: 8px 16px;
    background: var(--bg-tertiary);
    color: var(--text-primary);
    border: 1px solid var(--border);
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .page-btn:hover:not(:disabled) {
    background: #444;
    border-color: var(--accent);
  }

  .page-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .page-info {
    color: var(--text-muted);
    font-size: 0.9em;
  }

  .page-info strong {
    color: var(--accent);
  }

  .legend {
    text-align: center;
    color: var(--text-muted);
    font-size: 0.85em;
    padding: 12px;
    margin: 10px 0;
  }

  .legend strong {
    color: var(--text-primary);
  }

  .methodology {
    text-align: center;
    color: var(--text-muted);
    font-size: 0.85em;
    padding: 12px;
    margin: 10px 0;
    background: var(--bg-secondary);
    border-radius: 8px;
  }

  .methodology strong {
    color: var(--text-primary);
  }

  .methodology a {
    color: var(--accent);
  }

  .empty-state {
    color: var(--text-muted);
    text-align: center;
    padding: 2rem;
  }

  /* Column groups - show all by default on desktop */
  .col-g1, .col-g2, .col-g3, .col-g4, .col-g5 {
    display: table-cell;
  }

  /* Mobile: show column group toggle and hide inactive groups */
  @media (max-width: 1024px) {
    .col-group-toggle {
      display: flex;
    }

    .col-g1, .col-g2, .col-g3, .col-g4, .col-g5 {
      display: none;
    }

    table.show-g1 .col-g1 { display: table-cell; }
    table.show-g2 .col-g2 { display: table-cell; }
    table.show-g3 .col-g3 { display: table-cell; }
    table.show-g4 .col-g4 { display: table-cell; }
    table.show-g5 .col-g5 { display: table-cell; }

    .commander-col {
      max-width: 120px;
    }
  }

  @media (max-width: 768px) {
    .filters {
      flex-direction: column;
      gap: 10px;
    }

    .search-input {
      width: 100%;
    }

    .pagination {
      flex-wrap: wrap;
    }

    .commander-col {
      max-width: 100px;
    }
  }
</style>
