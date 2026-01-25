<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';

  let { data } = $props();

  // Expanded rows state
  let expandedRows = $state<Set<number>>(new Set());

  // Sorting state
  let sortCol = $state<'standing' | 'player' | 'commander' | 'record'>('standing');
  let sortAsc = $state(true);

  function toggleSort(col: typeof sortCol) {
    if (sortCol === col) {
      sortAsc = !sortAsc;
    } else {
      sortCol = col;
      sortAsc = col === 'standing'; // Default asc for standing, desc for others
    }
  }

  let sortedStandings = $derived.by(() => {
    const standings = [...(data.standings || [])];
    return standings.sort((a, b) => {
      let cmp = 0;
      switch (sortCol) {
        case 'standing':
          cmp = a.standing - b.standing;
          break;
        case 'player':
          cmp = getPlayerName(a).localeCompare(getPlayerName(b));
          break;
        case 'commander':
          cmp = getCommanderPair(a).localeCompare(getCommanderPair(b));
          break;
        case 'record':
          const rA = getRecord(a), rB = getRecord(b);
          cmp = (rB.wins - rB.losses) - (rA.wins - rA.losses); // Better record first
          if (cmp === 0) cmp = rB.wins - rA.wins;
          break;
      }
      return sortAsc ? cmp : -cmp;
    });
  });

  function toggleRow(standing: number) {
    const newSet = new Set(expandedRows);
    if (newSet.has(standing)) {
      newSet.delete(standing);
    } else {
      newSet.add(standing);
    }
    expandedRows = newSet;
  }

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
  }

  function getPlayerName(entry: any): string {
    return entry.players?.player_name || 'Unknown';
  }

  function getPlayerId(entry: any): string {
    return entry.players?.player_id || '';
  }

  function getPlayerElo(entry: any): number | null {
    return entry.players?.openskill_elo || null;
  }

  function getCommanderPair(entry: any): string {
    const commanders = (entry.deck_commanders as any[]) || [];
    return commanders.map((c: any) => c.commander_name).sort().join(' / ') || '-';
  }

  function getCommanderColorIdentity(entry: any): string {
    const commanders = (entry.deck_commanders as any[]) || [];
    let allColors = '';
    for (const c of commanders) {
      const colors = data.colorMap?.[c.commander_name] || '';
      for (const color of colors) {
        if (!allColors.includes(color)) {
          allColors += color;
        }
      }
    }
    const colorOrder = 'WUBRGC';
    return [...allColors].sort((a, b) =>
      colorOrder.indexOf(a) - colorOrder.indexOf(b)
    ).join('');
  }


  function getDecklistUrl(decklist: string | null): string | null {
    if (!decklist) return null;
    // Trim and check for URL
    const trimmed = decklist.trim();
    if (trimmed.startsWith('http')) return trimmed;
    if (trimmed.includes('http')) {
      return trimmed.substring(trimmed.indexOf('http')).split(' ')[0].split('~~')[0];
    }
    return null;
  }

  function updateMinSize(newMinSize: number) {
    const params = new URLSearchParams($page.url.searchParams);
    params.set('min_size', newMinSize.toString());
    goto(`?${params.toString()}`, { replaceState: true });
  }

  function navigateTo(tid: string) {
    const params = new URLSearchParams($page.url.searchParams);
    goto(`/tournaments/${tid}?${params.toString()}`);
  }

  function formatDelta(val: number): string {
    const prefix = val >= 0 ? '+' : '';
    return `${prefix}${val.toFixed(1)}`;
  }

  function getDeltaClass(val: number): string {
    if (val > 0) return 'positive';
    if (val < 0) return 'negative';
    return '';
  }

  // Get record - use live records from match data if entry has 0-0-0
  function getRecord(entry: any): { wins: number; losses: number; draws: number } {
    // If entry has a real record, use it
    if (entry.wins > 0 || entry.losses > 0 || entry.draws > 0) {
      return { wins: entry.wins, losses: entry.losses, draws: entry.draws };
    }
    // Otherwise, use live records calculated from match data
    const playerId = getPlayerId(entry);
    const live = data.liveRecords?.[playerId];
    if (live) {
      return live;
    }
    return { wins: 0, losses: 0, draws: 0 };
  }

  function formatRecord(entry: any): string {
    const r = getRecord(entry);
    return `${r.wins}-${r.losses}-${r.draws}`;
  }
</script>

<!-- Tournament Navigation -->
<div class="tournament-nav">
  <div class="nav-col">
    <button
      class="nav-btn"
      disabled={!data.prevTournament}
      onclick={() => data.prevTournament && navigateTo(data.prevTournament.tid)}
    >
      ← {data.prevTournament?.tournament_name?.slice(0, 30) || 'Previous'}
    </button>
    <button
      class="nav-btn nav-btn-week"
      disabled={!data.firstOfPrevWeek}
      onclick={() => data.firstOfPrevWeek && navigateTo(data.firstOfPrevWeek.tid)}
      title={data.firstOfPrevWeek?.tournament_name || 'Previous week'}
    >
      «« Prev Week
    </button>
  </div>

  <div class="nav-center">
    <h1>{data.tournament.tournament_name}</h1>
    <div class="size-filter">
      Event Size:
      <select
        value={data.minSize}
        onchange={(e) => updateMinSize(parseInt(e.currentTarget.value))}
      >
        <option value={16}>16+</option>
        <option value={30}>30+</option>
        <option value={50}>50+</option>
        <option value={100}>100+</option>
        <option value={250}>250+</option>
      </select>
    </div>
  </div>

  <div class="nav-col nav-col-right">
    <button
      class="nav-btn"
      disabled={!data.nextTournament}
      onclick={() => data.nextTournament && navigateTo(data.nextTournament.tid)}
    >
      {data.nextTournament?.tournament_name?.slice(0, 30) || 'Next'} →
    </button>
    <button
      class="nav-btn nav-btn-week"
      disabled={!data.firstOfNextWeek}
      onclick={() => data.firstOfNextWeek && navigateTo(data.firstOfNextWeek.tid)}
      title={data.firstOfNextWeek?.tournament_name || 'Next week'}
    >
      Next Week »»
    </button>
  </div>
</div>

<!-- Tournament Info -->
<div class="tournament-info">
  <div class="info-row">
    <span class="date">Date: {data.tournament.start_date ? formatDate(data.tournament.start_date) : 'Unknown'}</span>
  </div>
  <div class="info-row">
    <span>Players: <strong>{data.tournament.total_players}</strong></span>
    <span class="separator">|</span>
    <span>Swiss: <strong>{data.tournament.swiss_rounds || '-'}</strong></span>
    <span class="separator">|</span>
    <span>Top Cut: <strong>{data.tournament.top_cut || '-'}</strong></span>
  </div>
  <div class="info-row vs-avg">
    <span>vs {data.minSize}+ avg:</span>
    <span>
      Conv {data.vsAvg.convRate.toFixed(1)}%
      <span class={getDeltaClass(data.vsAvg.convDelta)}>({formatDelta(data.vsAvg.convDelta)})</span>
    </span>
    <span class="separator">|</span>
    <span>
      Top4 {data.vsAvg.top4Rate.toFixed(1)}%
      <span class={getDeltaClass(data.vsAvg.top4Delta)}>({formatDelta(data.vsAvg.top4Delta)})</span>
    </span>
    <span class="separator">|</span>
    <span>
      🏆 {data.vsAvg.champRate.toFixed(1)}%
      <span class={getDeltaClass(data.vsAvg.champDelta)}>({formatDelta(data.vsAvg.champDelta)})</span>
    </span>
  </div>
  {#if data.seatWinRates.totalGames > 0}
  <div class="info-row seat-rates">
    <span>Swiss Seat WR:</span>
    <span>S1 <strong>{data.seatWinRates.s1?.toFixed(1) ?? '-'}%</strong></span>
    <span class="separator">|</span>
    <span>S2 <strong>{data.seatWinRates.s2?.toFixed(1) ?? '-'}%</strong></span>
    <span class="separator">|</span>
    <span>S3 <strong>{data.seatWinRates.s3?.toFixed(1) ?? '-'}%</strong></span>
    <span class="separator">|</span>
    <span>S4 <strong>{data.seatWinRates.s4?.toFixed(1) ?? '-'}%</strong></span>
    <span class="separator">|</span>
    <span class="games-count">({data.seatWinRates.totalGames} games)</span>
  </div>
  {/if}
  <div class="info-row">
    <a href="/?tid={data.tournament.tid}" class="stats-link">📊 View Commander Stats</a>
  </div>
</div>

<!-- Standings Table -->
<div class="table-container">
  <table>
    <thead>
      <tr>
        <th style="width: 50px" class="sortable" class:sorted={sortCol === 'standing'} onclick={() => toggleSort('standing')}>
          # {sortCol === 'standing' ? (sortAsc ? '▲' : '▼') : ''}
        </th>
        <th class="sortable" class:sorted={sortCol === 'player'} onclick={() => toggleSort('player')}>
          Player {sortCol === 'player' ? (sortAsc ? '▲' : '▼') : ''}
        </th>
        <th class="colors-col"></th>
        <th class="sortable" class:sorted={sortCol === 'commander'} onclick={() => toggleSort('commander')}>
          Commander {sortCol === 'commander' ? (sortAsc ? '▲' : '▼') : ''}
        </th>
        <th class="metric sortable" class:sorted={sortCol === 'record'} onclick={() => toggleSort('record')}>
          Record {sortCol === 'record' ? (sortAsc ? '▲' : '▼') : ''}
        </th>
        <th style="width: 50px">List</th>
      </tr>
    </thead>
    <tbody>
      {#each sortedStandings as entry}
        {@const isTopCut = data.tournament.top_cut && entry.standing <= data.tournament.top_cut}
        {@const isExpanded = expandedRows.has(entry.standing)}
        <tr
          class:top-cut={isTopCut}
          class:expanded={isExpanded}
          onclick={() => toggleRow(entry.standing)}
        >
          <td class="standing-cell">
            <span class="expand-icon">{isExpanded ? '▼' : '▶'}</span>
            <span class:gold={entry.standing === 1} class:silver={entry.standing === 2} class:bronze={entry.standing === 3}>
              {entry.standing}
            </span>
          </td>
          <td>
            <a href="/players/{getPlayerId(entry)}" onclick={(e) => e.stopPropagation()}>
              {getPlayerName(entry)}
            </a>
          </td>
          <td class="colors-col">
            {#each getCommanderColorIdentity(entry) as color}
              <i class="ms ms-{color.toLowerCase()} ms-cost"></i>
            {/each}
          </td>
          <td class="commander-col">
            <a href="/commanders/{encodeURIComponent(getCommanderPair(entry))}" onclick={(e) => e.stopPropagation()}>
              {getCommanderPair(entry)}
            </a>
          </td>
          <td class="metric">{formatRecord(entry)}</td>
          <td class="list-cell" onclick={(e) => e.stopPropagation()}>
            {#if getDecklistUrl(entry.decklist)}
              <a href={getDecklistUrl(entry.decklist)} target="_blank" rel="noopener" title="View on external site">📋</a>
            {:else if entry.decklist && entry.decklist.length > 0}
              <a href="https://topdeck.gg/deck/{data.tournament.tid}/{getPlayerId(entry)}" target="_blank" rel="noopener" title="View on TopDeck.gg">📋</a>
            {:else}
              -
            {/if}
          </td>
        </tr>
        {#if isExpanded}
          {@const playerId = getPlayerId(entry)}
          {@const matches = data.playerMatches?.[playerId] || []}
          <tr class="expanded-row">
            <td colspan="6">
              <div class="expanded-content">
                {#if matches.length > 0}
                  <table class="pairings-table">
                    <tbody>
                      {#each matches as match}
                        <tr class:won={match.result === 'Won'} class:lost={match.result === 'Lost'}>
                          <td class="round-cell">{match.round}</td>
                          <td class="seat-cell">S{match.seat}</td>
                          <td class="opponents-cell">vs {match.opponents.join(', ')}</td>
                          <td class="result-cell" class:won={match.result === 'Won'} class:lost={match.result === 'Lost'}>
                            {match.result}
                          </td>
                        </tr>
                      {/each}
                    </tbody>
                  </table>
                {:else}
                  <div class="no-pairings">No pairings data available</div>
                {/if}
              </div>
            </td>
          </tr>
        {/if}
      {/each}
    </tbody>
  </table>
</div>

<svelte:head>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/mana-font@latest/css/mana.min.css">
</svelte:head>

<style>
  .tournament-nav {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    margin-bottom: 1.5rem;
    padding: 1rem;
    background: var(--bg-secondary);
    border-radius: 8px;
  }

  .nav-col {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    min-width: 200px;
  }

  .nav-col-right {
    align-items: flex-end;
  }

  .nav-btn {
    padding: 0.5rem 1rem;
    background: var(--bg-tertiary);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--text-primary);
    cursor: pointer;
    font-size: 0.85rem;
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .nav-btn-week {
    font-size: 0.75rem;
    padding: 0.25rem 0.75rem;
    color: var(--text-secondary);
  }

  .nav-btn:hover:not(:disabled) {
    background: var(--bg-card);
    border-color: var(--accent);
  }

  .nav-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .nav-center {
    text-align: center;
    flex: 1;
  }

  .nav-center h1 {
    font-size: 1.25rem;
    margin-bottom: 0.5rem;
  }

  .size-filter {
    font-size: 0.85rem;
    color: var(--text-secondary);
  }

  .size-filter select {
    padding: 0.25rem 0.5rem;
    font-size: 0.85rem;
  }

  .tournament-info {
    margin-bottom: 1.5rem;
    padding: 1rem;
    background: var(--bg-card);
    border-radius: 8px;
  }

  .info-row {
    margin-bottom: 0.5rem;
  }

  .info-row:last-child {
    margin-bottom: 0;
  }

  .date {
    font-size: 1.1rem;
  }

  .separator {
    margin: 0 0.75rem;
    color: var(--text-muted);
  }

  .vs-avg {
    color: var(--text-secondary);
    font-size: 0.9rem;
  }

  .seat-rates {
    color: var(--text-secondary);
    font-size: 0.9rem;
  }

  .seat-rates .games-count {
    color: var(--text-muted);
  }

  .stats-link {
    display: inline-block;
    margin-top: 0.5rem;
    padding: 0.5rem 1rem;
    background: var(--accent);
    color: var(--bg-primary);
    border-radius: 6px;
    font-weight: 500;
    text-decoration: none;
  }

  .stats-link:hover {
    background: var(--accent-hover);
    color: var(--bg-primary);
  }

  .positive {
    color: var(--positive);
  }

  .negative {
    color: var(--negative);
  }

  th.sortable {
    cursor: pointer;
    user-select: none;
  }

  th.sortable:hover {
    color: var(--accent);
  }

  th.sorted {
    color: var(--accent);
  }

  .standing-cell {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .expand-icon {
    font-size: 0.7rem;
    color: var(--text-muted);
    cursor: pointer;
    width: 0.7rem;
    flex-shrink: 0;
  }

  .standing-cell span:last-child {
    min-width: 1.5rem;
    text-align: right;
  }

  tbody tr {
    cursor: pointer;
  }

  tbody tr:hover {
    background: var(--bg-tertiary);
  }

  tr.top-cut td {
    background: rgba(76, 175, 80, 0.05);
  }

  tr.expanded td {
    background: var(--bg-tertiary);
  }

  .expanded-row td {
    padding: 0;
    background: var(--bg-secondary);
  }

  .expanded-content {
    padding: 0.5rem 1rem 0.5rem 2.5rem;
  }

  .pairings-table {
    width: 100%;
    font-size: 0.85rem;
  }

  .pairings-table tr {
    cursor: default;
  }

  .pairings-table tr:hover {
    background: transparent;
  }

  .pairings-table td {
    padding: 0.25rem 0.5rem;
    border-bottom: none;
  }

  .round-cell {
    width: 60px;
    font-weight: 500;
    color: var(--text-secondary);
  }

  .seat-cell {
    width: 40px;
    color: var(--text-muted);
  }

  .opponents-cell {
    color: var(--text-secondary);
  }

  .result-cell {
    width: 50px;
    text-align: right;
  }

  .result-cell.won {
    color: var(--positive);
    font-weight: 500;
  }

  .result-cell.lost {
    color: var(--negative);
  }

  .no-pairings {
    color: var(--text-muted);
    font-size: 0.85rem;
    padding: 0.5rem 0;
  }

  .commander-col {
    max-width: 300px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .commander-col a {
    color: var(--text-secondary);
  }

  .commander-col a:hover {
    color: var(--accent);
  }

  .colors-col {
    white-space: nowrap;
    width: 80px;
  }

  .colors-col .ms {
    font-size: 0.9rem;
    margin-right: 1px;
  }

  .list-cell {
    text-align: center;
  }

  .list-cell a {
    font-size: 1.1rem;
    text-decoration: none;
  }

  .gold {
    color: var(--gold);
    font-weight: 600;
  }

  .silver {
    color: var(--silver);
    font-weight: 600;
  }

  .bronze {
    color: var(--bronze);
    font-weight: 600;
  }

  td a {
    color: var(--text-primary);
  }

  td a:hover {
    color: var(--accent);
  }

  @media (max-width: 768px) {
    .tournament-nav {
      flex-direction: column;
    }

    .nav-col {
      width: 100%;
      min-width: 0;
    }

    .nav-col-right {
      align-items: stretch;
    }

    .nav-btn {
      width: 100%;
      max-width: none;
    }
  }
</style>
