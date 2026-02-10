<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';

  let { data } = $props();

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }

  function formatPct(val: number | null, decimals = 1): string {
    if (val === null || val === undefined) return '0.0%';
    return (val * 100).toFixed(decimals) + '%';
  }

  function formatVsExpected(rate: number | null): string {
    if (!rate) return '';
    const expected = 0.25;
    const diff = rate - expected;
    const prefix = diff >= 0 ? '+' : '';
    return `${prefix}${(diff * 100).toFixed(1)}%`;
  }

  function getVsExpectedClass(rate: number | null): string {
    if (!rate) return '';
    return rate > 0.25 ? 'positive' : rate < 0.25 ? 'negative' : '';
  }

  function formatElo(elo: number | null): number {
    if (elo === null || elo === undefined) return 100;
    return Math.max(100, Math.round(elo));
  }

  // Check if ELO is provisional (high uncertainty)
  let isProvisional = $derived(() => {
    return (data.stats.openskill_sigma || 10) > 6;
  });

  function updateParams(updates: Record<string, string | number>) {
    const params = new URLSearchParams($page.url.searchParams);
    for (const [key, value] of Object.entries(updates)) {
      params.set(key, value.toString());
    }
    goto(`?${params.toString()}`, { replaceState: true });
  }

  function updateMinSize(newMinSize: number) {
    updateParams({ min_size: newMinSize });
  }

  function updatePeriod(newPeriod: string) {
    updateParams({ period: newPeriod });
  }

  // Get commander pair from tournament entry
  function getCommanderPair(entry: any): string {
    const commanders = (entry.deck_commanders as any[]) || [];
    return commanders.map((c: any) => c.commander_name).sort().join(' / ') || '-';
  }

  // Accordion state for commander breakdown
  let expandedCommanders = $state<Set<string>>(new Set());

  function toggleCommander(commanderPair: string) {
    const newSet = new Set(expandedCommanders);
    if (newSet.has(commanderPair)) {
      newSet.delete(commanderPair);
    } else {
      newSet.add(commanderPair);
    }
    expandedCommanders = newSet;
  }

  function isCommanderExpanded(commanderPair: string): boolean {
    return expandedCommanders.has(commanderPair);
  }

  // Get tournaments for a specific commander
  function getTournamentsForCommander(commanderPair: string): any[] {
    return data.tournamentHistory.filter((entry: any) => {
      return getCommanderPair(entry) === commanderPair;
    });
  }

  // Period options
  function getCurrentMonthLabel(): string {
    return new Date().toLocaleDateString('en-US', { month: 'short' });
  }

  function getPrevMonthLabel(offset: number): string {
    const d = new Date();
    d.setMonth(d.getMonth() - offset);
    return d.toLocaleDateString('en-US', { month: 'short' });
  }

  // Only precalculated periods to avoid expensive live queries
  const periodGroups = {
    rolling: [
      { value: '1m', label: '30d' },
      { value: '3m', label: '3mo' },
      { value: '6m', label: '6mo' },
      { value: '1y', label: '1yr' }
    ],
    era: [
      { value: 'post_ban', label: 'Post-RC' },
      { value: 'all', label: 'All' }
    ]
  };

  function getPeriodLabel(period: string): string {
    const labels: Record<string, string> = {
      'last_week': 'Last Week',
      'current_month': getCurrentMonthLabel(),
      'prev_month': getPrevMonthLabel(1),
      '1m': 'Last 30 Days',
      '3m': 'Last 3 Months',
      '6m': 'Last 6 Months',
      '1y': 'Last Year',
      'post_ban': 'Post-RC Era',
      'all': 'All Time'
    };
    return labels[period] || period;
  }

  let playerSearch = $state('');
  let playerResults = $state<any[]>([]);
  let showPlayerDropdown = $state(false);
  let searchTimeout: ReturnType<typeof setTimeout>;

  function onPlayerSearch(query: string) {
    playerSearch = query;
    clearTimeout(searchTimeout);
    if (query.length < 2) {
      playerResults = [];
      return;
    }
    searchTimeout = setTimeout(async () => {
      const res = await fetch(`/api/player-search?q=${encodeURIComponent(query)}`);
      playerResults = await res.json();
    }, 200);
  }

  function selectPlayer(name: string) {
    showPlayerDropdown = false;
    playerSearch = '';
    playerResults = [];
    goto(`/players/${encodeURIComponent(name)}`);
  }

  function submitSearch() {
    if (playerResults.length === 1) {
      selectPlayer(playerResults[0].player_name);
    } else if (playerSearch.length >= 2) {
      showPlayerDropdown = false;
      goto(`/leaderboard?search=${encodeURIComponent(playerSearch)}`);
      playerSearch = '';
      playerResults = [];
    }
  }
</script>

<div class="page-header">
  <h1>{data.playerName}</h1>
  <div class="header-search">
    <input
      type="text"
      class="header-search-input"
      placeholder="Search players..."
      bind:value={playerSearch}
      oninput={(e) => onPlayerSearch(e.currentTarget.value)}
      onkeydown={(e) => e.key === 'Enter' && submitSearch()}
      onfocus={() => showPlayerDropdown = true}
      onblur={() => setTimeout(() => showPlayerDropdown = false, 150)}
    />
    {#if showPlayerDropdown && playerResults.length > 0}
      <div class="header-search-dropdown">
        {#each playerResults as p}
          <div class="header-search-option" onmousedown={() => selectPlayer(p.player_name)}>
            {p.player_name}
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>

<!-- Period Toggle -->
<div class="period-toggle">
  <span class="period-group">
    {#each periodGroups.rolling as p}
      <button
        class="period-btn"
        class:active={data.period === p.value}
        onclick={() => updatePeriod(p.value)}
      >{p.label}</button>
    {/each}
  </span>
  <span class="period-separator">|</span>
  <span class="period-group era-group">
    {#each periodGroups.era as p}
      <button
        class="period-btn"
        class:active={data.period === p.value}
        onclick={() => updatePeriod(p.value)}
      >{p.label}</button>
    {/each}
  </span>
</div>

<!-- Stats Summary -->
<div class="stats-summary">
  <strong>{getPeriodLabel(data.period)}</strong>
  &nbsp;|&nbsp;
  Event Size:
  <select
    class="size-select"
    value={String(data.minSize)}
    onchange={(e) => updateMinSize(parseInt(e.currentTarget.value) || 16)}
  >
    <option value="16">16+ (All)</option>
    <option value="30">30+</option>
    <option value="50">50+</option>
    <option value="100">100+</option>
    <option value="250">250+</option>
  </select>
  &nbsp;|&nbsp;
  <strong>{data.periodStats.entries}</strong> entries
  &nbsp;|&nbsp;
  ELO: <strong>{formatElo(data.stats.openskill_elo)}</strong>
  {#if isProvisional()}<span class="provisional">?</span>{/if}
</div>

<!-- Stats Cards -->
<div class="stats-grid">
  <div class="stat-card highlight">
    <div class="stat-value">
      {formatElo(data.stats.openskill_elo)}{#if isProvisional()}<span class="provisional" title="Provisional - high uncertainty">?</span>{/if}
    </div>
    <div class="stat-label">ELO{#if data.eloRank} (#{data.eloRank}){/if}</div>
  </div>
  <div class="stat-card">
    <div class="stat-value">{data.periodStats.total_wins + data.periodStats.total_losses + data.periodStats.total_draws}</div>
    <div class="stat-label">Games</div>
  </div>
  <div class="stat-card">
    <div class="stat-value">{data.periodStats.entries}</div>
    <div class="stat-label">Entries</div>
  </div>
  <div class="stat-card">
    <div class="stat-value">
      {formatPct(data.periodStats.win_rate, 1)}
      <span class="vs-expected {getVsExpectedClass(data.periodStats.win_rate)}">
        {formatVsExpected(data.periodStats.win_rate)}
      </span>
    </div>
    <div class="stat-label">Win Rate</div>
  </div>
  <div class="stat-card">
    <div class="stat-value">{data.periodStats.total_wins}-{data.periodStats.total_losses}-{data.periodStats.total_draws}</div>
    <div class="stat-label">Record</div>
  </div>
  <div class="stat-card">
    <div class="stat-value">
      {data.periodStats.conversions}
      <span class="vs-expected {getVsExpectedClass(data.periodStats.conversion_rate)}">
        {formatVsExpected(data.periodStats.conversion_rate)}
      </span>
    </div>
    <div class="stat-label">Conversions</div>
  </div>
  <div class="stat-card">
    <div class="stat-value">
      {data.periodStats.top4s}
      <span class="vs-expected {getVsExpectedClass(data.periodStats.top4_rate)}">
        {formatVsExpected(data.periodStats.top4_rate)}
      </span>
    </div>
    <div class="stat-label">Top 4s</div>
  </div>
  <div class="stat-card highlight">
    <div class="stat-value">
      {data.periodStats.championships}
      <span class="vs-expected {getVsExpectedClass(data.periodStats.champ_rate)}">
        {formatVsExpected(data.periodStats.champ_rate)}
      </span>
    </div>
    <div class="stat-label">🏆 Wins</div>
  </div>
</div>

<!-- Commander Breakdown -->
{#if data.commanderStats.length > 0}
<section class="section">
  <h2>Commander Breakdown</h2>
  <div class="table-container">
    <table>
      <thead>
        <tr>
          <th>Commander</th>
          <th class="metric">Entries</th>
          <th class="metric">Record</th>
          <th class="metric">Win%</th>
          <th class="metric" title="5wiss = (Win% × 5) + (Draw% × 1)">5wiss</th>
          <th class="metric" title="Average placement percentile">AvgX%</th>
          <th class="metric">Conv</th>
          <th class="metric">Conv%</th>
          <th class="metric">Top4</th>
          <th class="metric">Top4%</th>
          <th class="metric">🏆</th>
          <th class="metric">🏆%</th>
        </tr>
      </thead>
      <tbody>
        {#each data.commanderStats as cmd}
          {@const expanded = isCommanderExpanded(cmd.commander_pair)}
          {@const tournaments = getTournamentsForCommander(cmd.commander_pair)}
          <tr class="cmd-row" class:expanded onclick={() => toggleCommander(cmd.commander_pair)}>
            <td>
              <span class="expand-arrow">{expanded ? '▼' : '▶'}</span>
              <a href="/commanders/{encodeURIComponent(cmd.commander_pair)}" onclick={(e) => e.stopPropagation()}>{cmd.commander_pair}</a>
            </td>
            <td class="metric">{cmd.entries}</td>
            <td class="metric">{cmd.total_wins}-{cmd.total_losses}-{cmd.total_draws}</td>
            <td class="metric">
              {formatPct(cmd.win_rate, 1)}
              <span class="vs-expected {getVsExpectedClass(cmd.win_rate)}">
                {formatVsExpected(cmd.win_rate)}
              </span>
            </td>
            <td class="metric">{cmd.five_swiss?.toFixed(2) || 'N/A'}</td>
            <td class="metric">{cmd.avg_placement_pct?.toFixed(1) || '0.0'}%</td>
            <td class="metric">{cmd.conversions}</td>
            <td class="metric">{formatPct(cmd.conversion_rate, 1)}</td>
            <td class="metric">{cmd.top4s}</td>
            <td class="metric">{formatPct(cmd.top4_rate, 1)}</td>
            <td class="metric">{cmd.championships}</td>
            <td class="metric">{formatPct(cmd.champ_rate, 1)}</td>
          </tr>
          {#if expanded}
            <tr class="detail-row">
              <td colspan="12">
                <div class="tournament-details">
                  <table class="tournaments-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Tournament</th>
                        <th class="metric">Record</th>
                        <th class="metric">Place</th>
                        <th class="metric">Decklist</th>
                      </tr>
                    </thead>
                    <tbody>
                      {#each tournaments as entry}
                        {@const tournament = entry.tournaments as any}
                        {@const decklistUrl = entry.decklist?.startsWith('http') ? entry.decklist : null}
                        <tr class:top-cut={tournament?.top_cut && entry.standing <= tournament.top_cut}>
                          <td>{tournament?.start_date ? formatDate(tournament.start_date) : '-'}</td>
                          <td><a href="/tournaments/{tournament?.tid}">{tournament?.tournament_name || 'Unknown'}</a></td>
                          <td class="metric">{entry.wins}-{entry.losses}-{entry.draws}</td>
                          <td class="metric" class:gold={entry.standing === 1} class:silver={entry.standing === 2} class:bronze={entry.standing === 3}>
                            #{entry.standing}/{tournament?.total_players || '-'}
                          </td>
                          <td class="metric">
                            {#if decklistUrl}
                              <a href={decklistUrl} target="_blank" rel="noopener">List</a>
                            {:else}
                              -
                            {/if}
                          </td>
                        </tr>
                      {/each}
                    </tbody>
                  </table>
                </div>
              </td>
            </tr>
          {/if}
        {/each}
      </tbody>
    </table>
  </div>
</section>
{/if}

<!-- Tournament History -->
<section class="section">
  <h2>Tournament History</h2>
  {#if data.tournamentHistory.length > 0}
    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Tournament</th>
            <th>Commander</th>
            <th class="metric">Record</th>
            <th class="metric">Place</th>
            <th class="metric">Decklist</th>
          </tr>
        </thead>
        <tbody>
          {#each data.tournamentHistory as entry}
            {@const tournament = entry.tournaments as any}
            {@const decklistUrl = entry.decklist?.startsWith('http') ? entry.decklist : (entry.decklist?.includes('http') ? entry.decklist.substring(entry.decklist.indexOf('http')).split(' ')[0].split('~~')[0] : (tournament?.tid && entry.player_id ? `https://topdeck.gg/deck/${tournament.tid}/${entry.player_id}` : null))}
            <tr>
              <td>{tournament?.start_date ? formatDate(tournament.start_date) : '-'}</td>
              <td>
                <a href="/tournaments/{tournament?.tid}">{tournament?.tournament_name || 'Unknown'}</a>
              </td>
              <td class="commander-col">
                <a href="/commanders/{encodeURIComponent(getCommanderPair(entry))}">{getCommanderPair(entry)}</a>
              </td>
              <td class="metric">{entry.wins}-{entry.losses}-{entry.draws}</td>
              <td class="metric" class:gold={entry.standing === 1} class:silver={entry.standing === 2} class:bronze={entry.standing === 3}>
                {entry.standing}/{tournament?.total_players || '-'}
              </td>
              <td class="metric">
                {#if decklistUrl}
                  <a href={decklistUrl} target="_blank" rel="noopener">List</a>
                {:else}
                  -
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {:else}
    <p class="empty-state">No tournament history available for this filter</p>
  {/if}
</section>

<style>
  .page-header {
    margin-bottom: 0.5rem;
    text-align: center;
  }

  .page-header h1 {
    font-size: 1.75rem;
    margin-bottom: 0.25rem;
    color: var(--accent);
    display: inline;
  }

  .header-search {
    display: inline-block;
    position: relative;
    margin-left: 12px;
    vertical-align: middle;
  }

  .header-search-input {
    padding: 4px 10px;
    background: var(--bg-tertiary);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--text-primary);
    font-size: 0.85rem;
    width: 180px;
  }

  .header-search-input:focus {
    outline: none;
    border-color: var(--accent);
  }

  .header-search-dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: 4px;
    margin-top: 2px;
    z-index: 50;
    max-height: 250px;
    overflow-y: auto;
  }

  .header-search-option {
    padding: 6px 10px;
    cursor: pointer;
    font-size: 0.85rem;
    color: var(--text-secondary);
  }

  .header-search-option:hover {
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }

  /* Period Toggle */
  .period-toggle {
    display: flex;
    justify-content: center;
    flex-wrap: wrap;
    gap: 6px;
    margin: 8px 0;
  }

  .period-group {
    display: inline-flex;
    gap: 6px;
  }

  .era-group {
    align-items: center;
  }

  .period-btn {
    padding: 6px 14px;
    background: var(--bg-tertiary);
    color: var(--text-muted);
    border: 1px solid var(--border);
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
    padding: 0 5px;
    align-self: center;
  }

  /* Stats Summary */
  .stats-summary {
    text-align: center;
    color: var(--text-muted);
    margin: 8px 0 16px 0;
    padding: 10px;
    background: var(--bg-secondary);
    border-radius: 8px;
    font-size: 0.9em;
  }

  .stats-summary strong {
    color: var(--accent);
  }

  .size-select {
    padding: 4px 8px;
    background: var(--bg-tertiary);
    color: var(--text-primary);
    border: 1px solid var(--border);
    border-radius: 4px;
    font-size: 0.9em;
    cursor: pointer;
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 1rem;
    margin-bottom: 2rem;
  }

  .stat-card {
    background: var(--bg-card);
    border-radius: 8px;
    padding: 1rem;
    text-align: center;
  }

  .stat-card.highlight {
    border: 1px solid var(--accent);
  }

  .stat-value {
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--text-primary);
  }

  .provisional {
    color: var(--text-muted);
    font-size: 0.6em;
    margin-left: 2px;
    cursor: help;
  }

  .stat-label {
    font-size: 0.8rem;
    color: var(--text-muted);
    margin-top: 0.25rem;
  }

  .vs-expected {
    font-size: 0.6em;
    font-weight: normal;
    margin-left: 4px;
    color: var(--text-muted);
  }

  .vs-expected.positive {
    color: var(--positive, #4CAF50);
  }

  .vs-expected.negative {
    color: var(--negative, #f44336);
  }

  .section {
    margin-top: 2rem;
  }

  .section h2 {
    font-size: 1.1rem;
    margin-bottom: 1rem;
    color: var(--text-primary);
  }

  .empty-state {
    color: var(--text-muted);
    font-style: italic;
  }

  .gold {
    color: var(--gold, #ffd700);
    font-weight: 600;
  }

  .silver {
    color: var(--silver, #c0c0c0);
    font-weight: 600;
  }

  .bronze {
    color: var(--bronze, #cd7f32);
    font-weight: 600;
  }

  .commander-col {
    max-width: 300px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  td a {
    color: var(--text-primary);
  }

  td a:hover {
    color: var(--accent);
  }

  /* Commander accordion */
  .cmd-row {
    cursor: pointer;
    transition: background 0.15s;
  }

  .cmd-row:hover {
    background: var(--bg-tertiary);
  }

  .cmd-row.expanded {
    background: var(--bg-tertiary);
  }

  .expand-arrow {
    color: var(--text-muted);
    font-size: 0.7em;
    margin-right: 6px;
    display: inline-block;
  }

  .cmd-row.expanded .expand-arrow {
    color: var(--accent);
  }

  .detail-row {
    background: var(--bg-secondary);
  }

  .detail-row td {
    padding: 0 !important;
    border-bottom: 2px solid var(--border);
  }

  .detail-row:hover {
    background: var(--bg-secondary) !important;
  }

  .tournament-details {
    padding: 12px 20px;
  }

  .tournaments-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.85em;
  }

  .tournaments-table th {
    background: var(--bg-tertiary);
    color: var(--accent);
    padding: 8px 12px;
    text-align: left;
    font-weight: 600;
  }

  .tournaments-table td {
    padding: 6px 12px;
    border-bottom: 1px solid var(--border);
  }

  .tournaments-table tr.top-cut td {
    color: var(--accent);
  }

  @media (max-width: 768px) {
    .stats-grid {
      grid-template-columns: repeat(2, 1fr);
    }

    .commander-col {
      max-width: 150px;
    }
  }
</style>
