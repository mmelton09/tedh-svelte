<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';

  let { data } = $props();

  // Filter state (client-side for instant updates)
  let minEntries = $state(1);
  let minConv = $state(0);
  let sortCol = $state<string>('entries');
  let sortAsc = $state(false);
  let showVsExpected = $state(false);
  let showDelta = $state(false);
  let showMedals = $state(false);
  let showGuide = $state(false);

  // Color filter state
  let colorW = $state(false);
  let colorU = $state(false);
  let colorB = $state(false);
  let colorR = $state(false);
  let colorG = $state(false);
  let colorC = $state(false);
  let colorMode = $state('exactly');

  // Additional filters
  let top4Filter = $state('none');
  let sortByGains = $state(false);

  // Mobile column group state
  let mobileColGroup = $state(1);

  // Live tournaments state
  let liveTournaments = $state<any[]>([]);
  let liveLoading = $state(false);
  let liveLastFetched = $state<string | null>(null);
  let liveError = $state<string | null>(null);
  let expandedLive = $state<Set<string>>(new Set());
  let liveView = $state<Record<string, 'standings' | 'commanders'>>({});

  // Fetch live tournament data (manual trigger only - respect API limits)
  async function fetchLiveTournaments() {
    liveLoading = true;
    try {
      const res = await fetch('/api/live-tournaments');
      const data = await res.json();
      liveTournaments = data.tournaments || [];
      liveLastFetched = new Date().toLocaleTimeString();
      liveError = null;
    } catch (e) {
      console.error('Failed to fetch live tournaments:', e);
      liveError = 'Failed to load live data';
    }
    liveLoading = false;
  }

  function toggleLiveExpand(tid: string) {
    const newSet = new Set(expandedLive);
    if (newSet.has(tid)) {
      newSet.delete(tid);
    } else {
      newSet.add(tid);
      if (!liveView[tid]) {
        liveView = { ...liveView, [tid]: 'standings' };
      }
    }
    expandedLive = newSet;
  }

  function setLiveView(tid: string, view: 'standings' | 'commanders') {
    liveView = { ...liveView, [tid]: view };
  }

  // Accordion state - track which rows are expanded and their tournament data
  let expandedRows = $state<Set<string>>(new Set());
  let tournamentData = $state<Record<string, any[]>>({});
  let loadingTournaments = $state<Set<string>>(new Set());

  async function toggleRow(commanderPair: string) {
    const newSet = new Set(expandedRows);
    if (newSet.has(commanderPair)) {
      newSet.delete(commanderPair);
    } else {
      newSet.add(commanderPair);
      // Fetch tournament data if not already loaded
      if (!tournamentData[commanderPair]) {
        loadingTournaments = new Set([...loadingTournaments, commanderPair]);
        try {
          const params = new URLSearchParams({
            commander: commanderPair,
            period: data.period,
            min_size: data.minSize.toString()
          });
          const res = await fetch(`/api/commander-tournaments?${params}`);
          const result = await res.json();
          tournamentData = { ...tournamentData, [commanderPair]: result.tournaments || [] };
        } catch (e) {
          console.error('Failed to load tournament data:', e);
          tournamentData = { ...tournamentData, [commanderPair]: [] };
        }
        loadingTournaments = new Set([...loadingTournaments].filter(c => c !== commanderPair));
      }
    }
    expandedRows = newSet;
  }

  function isExpanded(commanderPair: string): boolean {
    return expandedRows.has(commanderPair);
  }

  function formatTournamentDate(dateStr: string): string {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
  }

  // Tournament search
  let tournamentSearch = $state('');
  let showTournamentDropdown = $state(false);

  // Date range state - sync with server data when it changes
  let dateStart = $state(data.periodStart || '');
  let dateEnd = $state(data.periodEnd || '');
  let lockSelection = $state(false);
  let lockedOrder = $state<string[]>([]);

  // Keep date inputs in sync with server data
  $effect(() => {
    dateStart = data.periodStart || '';
    dateEnd = data.periodEnd || '';
  });

  // Toggle lock and capture/clear order
  function toggleLock() {
    if (!lockSelection) {
      // Enabling lock - capture current order
      lockedOrder = filteredCommanders().map(c => c.commander_pair);
      lockSelection = true;
    } else {
      // Disabling lock - clear order
      lockedOrder = [];
      lockSelection = false;
    }
  }

  // Top% filter (ELO-based) - sync with URL
  let topFilterMode = $state<'off' | 'include' | 'exclude'>(
    (data.topMode as 'off' | 'include' | 'exclude') || 'off'
  );
  let topFilterValue = $state(data.topValue || 'top');
  let topFilterCustom = $state(data.topCustom || 100);
  let topFilterStat = $state(data.topStat || 'elo');

  function updateTopFilter() {
    const params = new URLSearchParams($page.url.searchParams);
    if (topFilterMode === 'off') {
      params.delete('top_mode');
      params.delete('top_value');
      params.delete('top_custom');
      params.delete('top_stat');
    } else {
      params.set('top_mode', topFilterMode);
      params.set('top_value', topFilterValue);
      if (topFilterValue === 'custom') {
        params.set('top_custom', topFilterCustom.toString());
      } else {
        params.delete('top_custom');
      }
      params.set('top_stat', topFilterStat);
    }
    goto(`?${params.toString()}`, { replaceState: true });
  }

  // Derived: filtered and sorted commanders (instant!)
  let filteredCommanders = $derived(() => {
    let result = data.commanders.filter(c => c.entries >= minEntries);

    // Min conversions filter
    if (minConv > 0) {
      result = result.filter(c => (c.conversions || 0) >= minConv);
    }

    // Top4/🏆 filter
    if (top4Filter !== 'none') {
      const [type, count] = top4Filter.split('_');
      const minVal = parseInt(count);
      if (type === 't4') {
        result = result.filter(c => (c.top4s || 0) >= minVal);
      } else if (type === 'win') {
        result = result.filter(c => (c.championships || 0) >= minVal);
      }
    }

    // Color filter
    const selectedColors = [
      colorW && 'W', colorU && 'U', colorB && 'B',
      colorR && 'R', colorG && 'G', colorC && 'C'
    ].filter(Boolean) as string[];

    if (selectedColors.length > 0) {
      result = result.filter(c => {
        const cmdColors = c.color_identity || '';
        if (colorMode === 'exactly') {
          return selectedColors.length === cmdColors.length &&
            selectedColors.every(col => cmdColors.includes(col));
        } else if (colorMode === 'including') {
          return selectedColors.every(col => cmdColors.includes(col));
        } else if (colorMode === 'within') {
          return [...cmdColors].every(col => selectedColors.includes(col));
        } else if (colorMode === 'excluding') {
          return !selectedColors.some(col => cmdColors.includes(col));
        }
        return true;
      });
    }

    // If lock is enabled with a saved order, use that order
    if (lockSelection && lockedOrder.length > 0) {
      const orderMap = new Map(lockedOrder.map((name, idx) => [name, idx]));
      return [...result].sort((a, b) => {
        const aIdx = orderMap.get(a.commander_pair) ?? Infinity;
        const bIdx = orderMap.get(b.commander_pair) ?? Infinity;
        return aIdx - bIdx;
      });
    }

    // Map sort columns to their delta equivalents when sortByGains is enabled
    const deltaMap: Record<string, string> = {
      'entries': 'delta_entries',
      'meta_pct': 'delta_entries',
      'win_rate': 'delta_win_rate',
      'conversion_rate': 'delta_conv_rate',
      'conv_vs_expected': 'delta_conv_rate',
      'top4_rate': 'delta_top4_rate',
      'top4_vs_expected': 'delta_top4_rate',
      'champ_rate': 'delta_champ_rate',
      'champ_vs_expected': 'delta_champ_rate'
    };

    return [...result].sort((a, b) => {
      let aVal: number | string;
      let bVal: number | string;

      // Use delta column if sortByGains is enabled and column has a delta equivalent
      const effectiveSortCol = sortByGains && deltaMap[sortCol] ? deltaMap[sortCol] : sortCol;

      if (effectiveSortCol === 'meta_pct') {
        // Meta% is just entries / total, so same as sorting by entries
        aVal = a.entries ?? 0;
        bVal = b.entries ?? 0;
      } else if (effectiveSortCol === 'swiss5') {
        // 5wiss = (win_rate * 5) + (draw_rate * 1)
        const aTotalGames = a.total_wins + a.total_losses + a.total_draws;
        const bTotalGames = b.total_wins + b.total_losses + b.total_draws;
        const aDrawRate = aTotalGames > 0 ? a.total_draws / aTotalGames : 0;
        const bDrawRate = bTotalGames > 0 ? b.total_draws / bTotalGames : 0;
        aVal = ((a.win_rate || 0) * 5) + (aDrawRate * 1);
        bVal = ((b.win_rate || 0) * 5) + (bDrawRate * 1);
      } else if (effectiveSortCol === 'color_identity') {
        // Sort by color count first, then by color identity string
        const aColors = a.color_identity || 'C';
        const bColors = b.color_identity || 'C';
        // Colorless (C) should sort last
        const aLen = aColors === 'C' ? 0 : aColors.length;
        const bLen = bColors === 'C' ? 0 : bColors.length;
        if (aLen !== bLen) {
          return sortAsc ? aLen - bLen : bLen - aLen;
        }
        // Same color count - sort by identity string
        return sortAsc ? aColors.localeCompare(bColors) : bColors.localeCompare(aColors);
      } else {
        // For delta columns, treat null as -Infinity so they sort last
        if (effectiveSortCol.startsWith('delta_')) {
          aVal = a[effectiveSortCol] ?? (sortAsc ? Infinity : -Infinity);
          bVal = b[effectiveSortCol] ?? (sortAsc ? Infinity : -Infinity);
        } else {
          aVal = a[effectiveSortCol] ?? 0;
          bVal = b[effectiveSortCol] ?? 0;
        }
      }

      if (typeof aVal === 'string') {
        return sortAsc ? aVal.localeCompare(bVal as string) : (bVal as string).localeCompare(aVal);
      }
      return sortAsc ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });
  });

  // Calculate totals from filtered data
  let filteredTotalEntries = $derived(
    filteredCommanders().reduce((sum, c) => sum + c.entries, 0)
  );

  // Period options for toggles
  const periodGroups = {
    recent: [
      { value: 'last_week', label: 'Last Week' }
    ],
    months: [
      { value: 'current_month', label: getCurrentMonthLabel() },
      { value: 'prev_month', label: getPrevMonthLabel(1) },
      { value: 'prev_month_2', label: getPrevMonthLabel(2) }
    ],
    rolling: [
      { value: '1m', label: '30d' },
      { value: '3m', label: '3mo' },
      { value: '6m', label: '6mo' },
      { value: '1y', label: '1yr' }
    ],
    era: [
      { value: 'post_ban', label: 'Post-RC' },
      { value: 'all', label: 'All History' }
    ]
  };

  function getCurrentMonthLabel(): string {
    return new Date().toLocaleDateString('en-US', { month: 'short' });
  }

  function getPrevMonthLabel(offset: number): string {
    const d = new Date();
    d.setMonth(d.getMonth() - offset);
    return d.toLocaleDateString('en-US', { month: 'short' });
  }

  // Handle server-side filter changes (period, min_size)
  function updatePeriod(newPeriod: string) {
    const params = new URLSearchParams($page.url.searchParams);
    params.set('period', newPeriod);
    goto(`?${params.toString()}`, { replaceState: true });
  }

  function updateMinSize(newMinSize: number) {
    const params = new URLSearchParams($page.url.searchParams);
    params.set('min_size', newMinSize.toString());
    goto(`?${params.toString()}`, { replaceState: true });
  }

  function applyDateRange() {
    if (!dateStart || !dateEnd) return;
    const params = new URLSearchParams($page.url.searchParams);
    params.set('period', 'custom');
    params.set('start', dateStart);
    params.set('end', dateEnd);
    goto(`?${params.toString()}`, { replaceState: true });
  }

  function shiftPeriod(direction: number) {
    // Shift the date range by the current period's duration
    if (!data.periodStart || !data.periodEnd) return;
    const start = new Date(data.periodStart);
    const end = new Date(data.periodEnd);
    const duration = end.getTime() - start.getTime();

    const newStart = new Date(start.getTime() + (direction * duration));
    const newEnd = new Date(end.getTime() + (direction * duration));

    // Don't go into the future
    if (newEnd > new Date()) return;

    const params = new URLSearchParams($page.url.searchParams);
    params.set('period', 'custom');
    params.set('start', newStart.toISOString().split('T')[0]);
    params.set('end', newEnd.toISOString().split('T')[0]);
    goto(`?${params.toString()}`, { replaceState: true });
  }

  function cycleTopFilterMode() {
    if (topFilterMode === 'off') topFilterMode = 'include';
    else if (topFilterMode === 'include') topFilterMode = 'exclude';
    else topFilterMode = 'off';
    updateTopFilter();
  }

  function formatDate(dateStr: string): string {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  // Handle sorting (instant, client-side)
  function handleSort(col: string) {
    if (sortCol === col) {
      sortAsc = !sortAsc;
    } else {
      sortCol = col;
      sortAsc = col === 'commander_pair';
    }
  }

  function clearFilters() {
    minEntries = 1;
    minConv = 0;
    top4Filter = 'none';
    colorW = colorU = colorB = colorR = colorG = colorC = false;
    colorMode = 'exactly';
    sortByGains = false;
    topFilterMode = 'off';
    topFilterValue = 'top';
    topFilterCustom = 100;
    topFilterStat = 'elo';
  }

  function selectTournament(tid: string) {
    const params = new URLSearchParams($page.url.searchParams);
    params.set('tid', tid);
    goto(`?${params.toString()}`, { replaceState: true });
  }

  function clearTournament() {
    const params = new URLSearchParams($page.url.searchParams);
    params.delete('tid');
    goto(`?${params.toString()}`, { replaceState: true });
  }

  // Format helpers
  function formatPct(val: number | null, decimals = 1): string {
    if (val === null || val === undefined) return '0.0%';
    return (val * 100).toFixed(decimals) + '%';
  }

  // Format vs expected value (already in percentage points from server)
  function formatVsExp(val: number | null): string {
    if (val === null || val === undefined) return '0.0';
    const prefix = val >= 0 ? '+' : '';
    return `${prefix}${val.toFixed(1)}`;
  }

  function getVsExpClass(val: number | null): string {
    if (val === null || val === undefined || val === 0) return '';
    return val > 0 ? 'positive' : 'negative';
  }

  function formatSwiss5(winRate: number, drawRate: number): string {
    return ((winRate * 5) + (drawRate * 1)).toFixed(2);
  }

  function getPeriodLabel(period: string): string {
    const labels: Record<string, string> = {
      'last_week': 'Last Week',
      'current_month': getCurrentMonthLabel(),
      'prev_month': getPrevMonthLabel(1),
      'prev_month_2': getPrevMonthLabel(2),
      '1m': 'Last 30 Days',
      '3m': 'Last 3 Months',
      '6m': 'Last 6 Months',
      '1y': 'Last Year',
      'post_ban': 'Post-RC Era',
      'all': 'All Time'
    };
    return labels[period] || period;
  }

  // Calculate medal positions with Olympic-style tie handling
  // Returns a map of commander_pair -> medal class ('gold', 'silver', 'bronze', or null)
  function calculateMedals(commanders: any[], getValue: (cmd: any) => number): Map<string, string | null> {
    const medals = new Map<string, string | null>();

    // Get values and sort
    const items = commanders.map(cmd => ({ pair: cmd.commander_pair, val: getValue(cmd) }));
    const sorted = [...items].sort((a, b) => b.val - a.val);

    // Calculate actual position for each value (Olympic-style: ties skip positions)
    const valToPosition: Record<number, number> = {};
    let position = 1;
    let lastVal: number | null = null;
    let countAtLastVal = 0;

    for (const item of sorted) {
      if (item.val !== lastVal) {
        if (lastVal !== null) {
          position += countAtLastVal;
        }
        lastVal = item.val;
        countAtLastVal = 1;
        if (item.val > 0) valToPosition[item.val] = position;
      } else {
        countAtLastVal++;
      }
    }

    // Assign medals based on position
    for (const item of items) {
      const pos = valToPosition[item.val];
      if (pos === 1) {
        medals.set(item.pair, 'gold');
      } else if (pos === 2) {
        medals.set(item.pair, 'silver');
      } else if (pos === 3) {
        medals.set(item.pair, 'bronze');
      } else {
        medals.set(item.pair, null);
      }
    }

    return medals;
  }

  // Calculate medals for each column
  let columnMedals = $derived(() => {
    const cmds = filteredCommanders();
    return {
      entries: calculateMedals(cmds, c => c.entries),
      meta_pct: calculateMedals(cmds, c => c.entries), // Same as entries since meta% is proportional
      win_rate: calculateMedals(cmds, c => c.win_rate || 0),
      swiss5: calculateMedals(cmds, c => {
        const totalGames = c.total_wins + c.total_losses + c.total_draws;
        const drawRate = totalGames > 0 ? c.total_draws / totalGames : 0;
        return ((c.win_rate || 0) * 5) + (drawRate * 1);
      }),
      conversions: calculateMedals(cmds, c => c.conversions || 0),
      conversion_rate: calculateMedals(cmds, c => c.conv_vs_expected || 0),
      top4s: calculateMedals(cmds, c => c.top4s || 0),
      top4_rate: calculateMedals(cmds, c => c.top4_vs_expected || 0),
      championships: calculateMedals(cmds, c => c.championships || 0),
      champ_rate: calculateMedals(cmds, c => c.champ_vs_expected || 0),
    };
  });

  function getMedalClass(column: string, commanderPair: string): string {
    const medal = columnMedals()[column as keyof typeof columnMedals]?.get(commanderPair);
    if (!medal) return '';
    return `stat-${medal}`;
  }
</script>

<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/mana-font@latest/css/mana.min.css">

<div class="page-header">
  <h1>
    <a href="/" class="title-link">tEDH Meta</a> Report
    <button class="guide-btn" class:active={showGuide} onclick={() => showGuide = !showGuide}>
      ? Guide
    </button>
  </h1>
</div>

<!-- Guide Panel -->
{#if showGuide}
<div class="guide-panel">
  <div class="guide-grid">
    <div class="guide-item"><strong>5wiss</strong> <span>Swiss score: (Win% × 5) + (Draw% × 1). Simulates expected swiss points.</span></div>
    <div class="guide-item"><strong>Color = + ⊆ ≠</strong> <span>= Exact match | + Must include | ⊆ Within colors | ≠ Exclude colors</span></div>
    <div class="guide-item"><strong>±Exp</strong> <span>Performance vs expected (random chance). Positive = overperforming.</span></div>
    <div class="guide-item"><strong>Δ Delta</strong> <span>Change from previous equivalent period (e.g. last 30d vs prior 30d).</span></div>
    <div class="guide-item"><strong>🏅 Medals</strong> <span>Shows top 3 for each column. Conv/Top4/🏆 medals based on ±Exp.</span></div>
    <div class="guide-item"><strong>↕</strong> <span>Sort by delta (appears when Δ is active).</span></div>
  </div>
</div>
{/if}

<!-- Time Period Toggle -->
<div class="period-toggle">
  <span class="period-group">
    {#each periodGroups.recent as p}
      <button
        class="period-btn"
        class:active={data.period === p.value}
        onclick={() => updatePeriod(p.value)}
      >{p.label}</button>
    {/each}
  </span>
  <span class="period-separator">|</span>
  <span class="period-group">
    {#each periodGroups.months as p}
      <button
        class="period-btn"
        class:active={data.period === p.value}
        onclick={() => updatePeriod(p.value)}
      >{p.label}</button>
    {/each}
  </span>
  <span class="period-separator">|</span>
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
    <span class="era-label">Era</span>
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
  {#if data.periodStart && data.periodEnd}
  <span class="date-nav-group">
    <button
      class="week-shift-btn"
      onclick={() => shiftPeriod(-1)}
      title="Previous period"
      disabled={data.period === 'all'}
    >&lt;&lt;</button>
    <input
      type="date"
      bind:value={dateStart}
      onchange={applyDateRange}
    />
    <span>-</span>
    <input
      type="date"
      bind:value={dateEnd}
      onchange={applyDateRange}
    />
    <button
      class="week-shift-btn"
      onclick={() => shiftPeriod(1)}
      title="Next period"
      disabled={data.period === 'all'}
    >&gt;&gt;</button>
  </span>
  &nbsp;|&nbsp;
  <label class="lock-label" title="Lock current sort order when changing periods">
    <input type="checkbox" checked={lockSelection} onchange={toggleLock}>
    Lock
  </label>
  &nbsp;|&nbsp;
  {/if}
  Event Size:
  <select
    class:filter-active={data.minSize !== 50}
    value={String(data.minSize)}
    onchange={(e) => updateMinSize(parseInt(e.currentTarget.value) || 50)}
  >
    <option value="16">16+</option>
    <option value="30">30+</option>
    <option value="50">50+</option>
    <option value="100">100+</option>
    <option value="250">250+</option>
  </select>
  &nbsp;|&nbsp;
  <strong>{data.tournamentCount || '-'}</strong> tournaments
  <span class="muted">({data.totalEntries?.toLocaleString() || 0} entries)</span>
</div>

<!-- Selected Tournament Banner -->
{#if data.selectedTournament}
<div class="selected-tournament-banner">
  <span class="label">Showing data for:</span>
  <a href="/tournaments/{data.selectedTournament.tid}" class="tournament-link">
    {data.selectedTournament.tournament_name}
  </a>
  <span class="players">({data.selectedTournament.total_players} players)</span>
  <button class="clear-tournament-btn" onclick={clearTournament}>✕ Clear</button>
</div>
{/if}

<!-- Live Tournaments -->
{#if !data.selectedTournament}
<div class="live-section">
  <div class="live-header">
    <span class="live-badge">LIVE</span>
    <span class="live-title">Live Tournaments</span>
    <button class="refresh-btn" onclick={fetchLiveTournaments} disabled={liveLoading}>
      {liveLoading ? 'Loading...' : 'Refresh'}
    </button>
    {#if liveLastFetched}
      <span class="live-timestamp">Updated {liveLastFetched}</span>
    {/if}
  </div>

  {#if !liveLastFetched && !liveLoading}
    <div class="live-prompt">
      <button class="load-live-btn" onclick={fetchLiveTournaments}>Load Live Tournament Data</button>
      <span class="live-note">Data cached server-side for 5 minutes</span>
    </div>
  {:else if liveError}
    <div class="live-error">{liveError}</div>
  {:else if liveTournaments.length > 0}
    <div class="live-tournaments">
      {#each liveTournaments as t}
        <div class="live-tournament-card" class:expanded={expandedLive.has(t.tid)}>
          <div class="live-card-header" onclick={() => toggleLiveExpand(t.tid)}>
            <span class="expand-arrow">{expandedLive.has(t.tid) ? '▼' : '▶'}</span>
            <span class="tournament-name">{t.name}</span>
            <span class="tournament-stats">
              <span class="player-count">{t.totalPlayers} players</span>
              {#if t.currentRound}
                <span class="round-info">Round {t.currentRound}</span>
              {/if}
            </span>
          </div>

          {#if expandedLive.has(t.tid)}
            <div class="live-card-body">
              <div class="view-toggle">
                <button
                  class:active={liveView[t.tid] === 'standings'}
                  onclick={() => setLiveView(t.tid, 'standings')}
                >Top 32</button>
                <button
                  class:active={liveView[t.tid] === 'commanders'}
                  onclick={() => setLiveView(t.tid, 'commanders')}
                >Commanders</button>
              </div>

              {#if liveView[t.tid] === 'standings'}
                <table class="live-standings-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Player</th>
                      <th>Commander</th>
                      <th>Record</th>
                    </tr>
                  </thead>
                  <tbody>
                    {#each t.topStandings as s}
                      <tr class:top4={s.standing <= 4}>
                        <td class="standing" class:gold={s.standing === 1} class:silver={s.standing === 2} class:bronze={s.standing === 3}>{s.standing}</td>
                        <td class="player-name">{s.name}</td>
                        <td class="commander">
                          {#if s.commander}
                            <a href="/commanders/{encodeURIComponent(s.commander)}">{s.commander}</a>
                          {:else}
                            <span class="unknown">Unknown</span>
                          {/if}
                        </td>
                        <td class="record">{s.wins}-{s.losses}-{s.draws}</td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              {:else}
                <table class="live-commanders-table">
                  <thead>
                    <tr>
                      <th>Commander</th>
                      <th>Count</th>
                      <th>Meta%</th>
                      <th>Win%</th>
                      <th>Best</th>
                    </tr>
                  </thead>
                  <tbody>
                    {#each t.commanderBreakdown.slice(0, 20) as c}
                      <tr>
                        <td class="commander">
                          {#if c.commander !== 'Unknown'}
                            <a href="/commanders/{encodeURIComponent(c.commander)}">{c.commander}</a>
                          {:else}
                            <span class="unknown">Unknown</span>
                          {/if}
                        </td>
                        <td class="metric">{c.count}</td>
                        <td class="metric">{c.metaPct.toFixed(1)}%</td>
                        <td class="metric">{(c.winRate * 100).toFixed(1)}%</td>
                        <td class="metric" class:gold={c.topStanding === 1} class:silver={c.topStanding === 2} class:bronze={c.topStanding === 3}>#{c.topStanding}</td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              {/if}
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>
{/if}

<!-- Featured Tournaments -->
{#if data.recentTournaments && data.recentTournaments.length > 0 && !data.selectedTournament}
<div class="featured-tournaments">
  <div class="tournament-search-container">
    <input
      type="text"
      class="tournament-search"
      placeholder="Search tournaments..."
      bind:value={tournamentSearch}
      onfocus={() => showTournamentDropdown = true}
    />
    {#if showTournamentDropdown}
      <div class="tournament-dropdown">
        <div class="tournament-option" onclick={() => { showTournamentDropdown = false; tournamentSearch = ''; }}>
          All Tournaments
        </div>
        {#each data.recentTournaments.filter(t => t.tournament_name.toLowerCase().includes(tournamentSearch.toLowerCase())) as t}
          <div class="tournament-option" onclick={() => { selectTournament(t.tid); showTournamentDropdown = false; }}>
            {t.tournament_name} <span class="size">({t.total_players} players)</span>
          </div>
        {/each}
      </div>
    {/if}
  </div>
  {#each data.recentTournaments.slice(0, 1) as t}
    <div class="featured-tournament" onclick={() => selectTournament(t.tid)}>
      <span class="size">{t.total_players}</span>
      <a href="/tournaments/{t.tid}" class="name" onclick={(e) => e.stopPropagation()}>{t.tournament_name}</a>
    </div>
  {/each}
</div>
{/if}

<!-- Filters -->
<div class="filters">
  <span class="filter-label">Entries</span>
  <select
    class:filter-active={minEntries > 1}
    bind:value={minEntries}
    title="Minimum entries"
  >
    <option value={1}>1+</option>
    <option value={2}>2+</option>
    <option value={5}>5+</option>
    <option value={10}>10+</option>
    <option value={20}>20+</option>
    <option value={50}>50+</option>
  </select>

  <span class="filter-label">Conv</span>
  <select
    class:filter-active={minConv > 0}
    bind:value={minConv}
    title="Minimum conversions"
  >
    <option value={0}>0+</option>
    <option value={1}>1+</option>
    <option value={2}>2+</option>
    <option value={3}>3+</option>
    <option value={5}>5+</option>
    <option value={10}>10+</option>
  </select>

  <div class="color-filter">
    <div class="color-checkboxes">
      <label class="color-check" title="White">
        <input type="checkbox" bind:checked={colorW}>
        <i class="ms ms-w ms-cost"></i>
      </label>
      <label class="color-check" title="Blue">
        <input type="checkbox" bind:checked={colorU}>
        <i class="ms ms-u ms-cost"></i>
      </label>
      <label class="color-check" title="Black">
        <input type="checkbox" bind:checked={colorB}>
        <i class="ms ms-b ms-cost"></i>
      </label>
      <label class="color-check" title="Red">
        <input type="checkbox" bind:checked={colorR}>
        <i class="ms ms-r ms-cost"></i>
      </label>
      <label class="color-check" title="Green">
        <input type="checkbox" bind:checked={colorG}>
        <i class="ms ms-g ms-cost"></i>
      </label>
      <label class="color-check" title="Colorless">
        <input type="checkbox" bind:checked={colorC}>
        <i class="ms ms-c ms-cost"></i>
      </label>
    </div>
    <button
      class="color-mode-toggle"
      onclick={() => {
        const modes = ['exactly', 'including', 'within', 'excluding'];
        const idx = modes.indexOf(colorMode);
        colorMode = modes[(idx + 1) % 4];
      }}
      title="Color match mode: {colorMode === 'exactly' ? 'Exact match' : colorMode === 'including' ? 'Must include' : colorMode === 'within' ? 'Within colors' : 'Exclude colors'}"
    >
      {colorMode === 'exactly' ? '=' : colorMode === 'including' ? '+' : colorMode === 'within' ? '⊆' : '≠'}
    </button>
  </div>

  <div class="toggle-pills">
    <button class="pill" class:active={showVsExpected} onclick={() => showVsExpected = !showVsExpected} title="Show vs Expected values">±Exp</button>
    <button class="pill" class:active={showDelta} onclick={() => showDelta = !showDelta} title="Show period-over-period changes">Δ</button>
    {#if showDelta}
      <button class="pill pill-small" class:active={sortByGains} onclick={() => sortByGains = !sortByGains} title="Sort by delta values">↕</button>
    {/if}
    <button class="pill" class:active={showMedals} onclick={() => showMedals = !showMedals} title="Show medals for top 3">🏅</button>
  </div>

  <div class="top-filter">
    <button
      class="top-toggle"
      class:include={topFilterMode === 'include'}
      class:exclude={topFilterMode === 'exclude'}
      onclick={cycleTopFilterMode}
      title="Filter by player ranking"
    >
      {#if topFilterMode === 'off'}⊘{:else if topFilterMode === 'include'}✓{:else}✗{/if}
    </button>
    <select bind:value={topFilterValue} disabled={topFilterMode === 'off'} onchange={updateTopFilter}>
      <option value="top">Top</option>
      <option value="1">1%</option>
      <option value="2">2%</option>
      <option value="5">5%</option>
      <option value="10">10%</option>
      <option value="20">20%</option>
      <option value="custom">#</option>
    </select>
    {#if topFilterValue === 'custom'}
      <input type="number" class="top-custom" bind:value={topFilterCustom} min="1" max="1000" disabled={topFilterMode === 'off'} onchange={updateTopFilter}>
    {/if}
    <select bind:value={topFilterStat} disabled={topFilterMode === 'off'} onchange={updateTopFilter}>
      <option value="elo">ELO</option>
      <option value="win_rate">Win%</option>
      <option value="conv_rate">Conv%</option>
      <option value="top4_rate">T4%</option>
      <option value="champ_rate">🏆%</option>
      <option value="conv_exp">Conv±</option>
      <option value="top4_exp">T4±</option>
      <option value="champ_exp">🏆±</option>
    </select>
  </div>

  <button class="clear-btn" onclick={clearFilters}>Clear</button>
</div>

<!-- Mobile Column Group Toggle -->
<div class="col-group-toggle">
  <button class="col-group-btn" class:active={mobileColGroup === 1} onclick={() => mobileColGroup = 1}>Meta</button>
  <button class="col-group-btn" class:active={mobileColGroup === 2} onclick={() => mobileColGroup = 2}>Win</button>
  <button class="col-group-btn" class:active={mobileColGroup === 3} onclick={() => mobileColGroup = 3}>Conv</button>
  <button class="col-group-btn" class:active={mobileColGroup === 4} onclick={() => mobileColGroup = 4}>Top4</button>
  <button class="col-group-btn" class:active={mobileColGroup === 5} onclick={() => mobileColGroup = 5}>🏆</button>
</div>

<!-- Commander Table -->
<div class="table-container">
  <table class="show-g{mobileColGroup}">
    <thead>
      <tr>
        <th style="width: 40px">#</th>
        <th
          class:sorted-asc={sortCol === 'commander_pair' && sortAsc}
          class:sorted-desc={sortCol === 'commander_pair' && !sortAsc}
          onclick={() => handleSort('commander_pair')}
        >
          Commander
        </th>
        <th
          class="metric colors-col col-g1"
          class:sorted-asc={sortCol === 'color_identity' && sortAsc}
          class:sorted-desc={sortCol === 'color_identity' && !sortAsc}
          onclick={() => handleSort('color_identity')}
        >
          Colors
        </th>
        <th
          class="metric col-g1"
          class:sorted-asc={sortCol === 'entries' && sortAsc}
          class:sorted-desc={sortCol === 'entries' && !sortAsc}
          onclick={() => handleSort('entries')}
        >
          Entries
        </th>
        <th
          class="metric col-g1"
          class:sorted-asc={sortCol === 'meta_pct' && sortAsc}
          class:sorted-desc={sortCol === 'meta_pct' && !sortAsc}
          onclick={() => handleSort('meta_pct')}
        >
          Meta%
        </th>
        <th
          class="metric col-g2"
          class:sorted-asc={sortCol === 'win_rate' && sortAsc}
          class:sorted-desc={sortCol === 'win_rate' && !sortAsc}
          onclick={() => handleSort('win_rate')}
        >
          Win%
        </th>
        <th
          class="metric col-g2"
          class:sorted-asc={sortCol === 'swiss5' && sortAsc}
          class:sorted-desc={sortCol === 'swiss5' && !sortAsc}
          onclick={() => handleSort('swiss5')}
        >
          5wiss
        </th>
        <th
          class="metric col-g3"
          class:sorted-asc={sortCol === 'conversions' && sortAsc}
          class:sorted-desc={sortCol === 'conversions' && !sortAsc}
          onclick={() => handleSort('conversions')}
        >
          Conv
        </th>
        <th
          class="metric col-g3"
          class:sorted-asc={(showVsExpected ? sortCol === 'conv_vs_expected' : sortCol === 'conversion_rate') && sortAsc}
          class:sorted-desc={(showVsExpected ? sortCol === 'conv_vs_expected' : sortCol === 'conversion_rate') && !sortAsc}
          onclick={() => handleSort(showVsExpected ? 'conv_vs_expected' : 'conversion_rate')}
        >
          {showVsExpected ? 'Conv±' : 'Conv%'}
        </th>
        <th
          class="metric col-g4"
          class:sorted-asc={sortCol === 'top4s' && sortAsc}
          class:sorted-desc={sortCol === 'top4s' && !sortAsc}
          onclick={() => handleSort('top4s')}
        >
          Top4
        </th>
        <th
          class="metric col-g4"
          class:sorted-asc={(showVsExpected ? sortCol === 'top4_vs_expected' : sortCol === 'top4_rate') && sortAsc}
          class:sorted-desc={(showVsExpected ? sortCol === 'top4_vs_expected' : sortCol === 'top4_rate') && !sortAsc}
          onclick={() => handleSort(showVsExpected ? 'top4_vs_expected' : 'top4_rate')}
        >
          {showVsExpected ? 'Top4±' : 'Top4%'}
        </th>
        <th
          class="metric col-g5"
          class:sorted-asc={sortCol === 'championships' && sortAsc}
          class:sorted-desc={sortCol === 'championships' && !sortAsc}
          onclick={() => handleSort('championships')}
        >
          🏆
        </th>
        <th
          class="metric col-g5"
          class:sorted-asc={(showVsExpected ? sortCol === 'champ_vs_expected' : sortCol === 'champ_rate') && sortAsc}
          class:sorted-desc={(showVsExpected ? sortCol === 'champ_vs_expected' : sortCol === 'champ_rate') && !sortAsc}
          onclick={() => handleSort(showVsExpected ? 'champ_vs_expected' : 'champ_rate')}
        >
          {showVsExpected ? '🏆±' : '🏆%'}
        </th>
      </tr>
    </thead>
    <tbody>
      {#each filteredCommanders() as cmd, i}
        {@const totalGames = cmd.total_wins + cmd.total_losses + cmd.total_draws}
        {@const drawRate = totalGames > 0 ? cmd.total_draws / totalGames : 0}
        {@const rank = i + 1}
        {@const expanded = isExpanded(cmd.commander_pair)}
        <tr class="cmd-row" class:expanded onclick={() => toggleRow(cmd.commander_pair)}>
          <td class="rank-cell">
            <span class="expand-arrow">{expanded ? '▼' : '▶'}</span>
            {rank}
          </td>
          <td>
            <a href="/commanders/{encodeURIComponent(cmd.commander_pair)}" onclick={(e) => e.stopPropagation()}>
              {cmd.commander_pair}
            </a>
          </td>
          <td class="metric colors-col col-g1">
            {#if cmd.color_identity}
              {#each [...cmd.color_identity] as color}
                <i class="ms ms-{color.toLowerCase()} ms-cost"></i>
              {/each}
            {:else}
              <i class="ms ms-c ms-cost"></i>
            {/if}
          </td>
          <td class="metric col-g1 {showMedals ? getMedalClass('entries', cmd.commander_pair) : ''}">
            {cmd.entries}
            {#if showDelta && cmd.delta_entries != null}
              <span class="delta" class:positive={cmd.delta_entries > 0} class:negative={cmd.delta_entries < 0}>
                {cmd.delta_entries > 0 ? '+' : ''}{cmd.delta_entries}
              </span>
            {/if}
            {#if cmd.is_new}
              <span class="new-badge">NEW</span>
            {/if}
          </td>
          <td class="metric col-g1 {showMedals ? getMedalClass('meta_pct', cmd.commander_pair) : ''}">{((cmd.entries / filteredTotalEntries) * 100).toFixed(1)}%</td>
          <td class="metric col-g2 {showMedals ? getMedalClass('win_rate', cmd.commander_pair) : ''}">
            {formatPct(cmd.win_rate, 1)}
            {#if showDelta && cmd.delta_win_rate != null}
              <span class="delta" class:positive={cmd.delta_win_rate > 0} class:negative={cmd.delta_win_rate < 0}>
                {cmd.delta_win_rate > 0 ? '+' : ''}{(cmd.delta_win_rate * 100).toFixed(1)}
              </span>
            {/if}
          </td>
          <td class="metric col-g2 {showMedals ? getMedalClass('swiss5', cmd.commander_pair) : ''}">{formatSwiss5(cmd.win_rate || 0, drawRate)}</td>
          <td class="metric col-g3 {showMedals ? getMedalClass('conversions', cmd.commander_pair) : ''}">{cmd.conversions}</td>
          <td class="metric col-g3 {showMedals ? getMedalClass('conversion_rate', cmd.commander_pair) : ''}">
            {#if showVsExpected}
              <span class="vs-exp {getVsExpClass(cmd.conv_vs_expected)}">{formatVsExp(cmd.conv_vs_expected)}</span>
            {:else}
              {formatPct(cmd.conversion_rate, 1)}
            {/if}
            {#if showDelta && cmd.delta_conv_rate != null}
              <span class="delta" class:positive={cmd.delta_conv_rate > 0} class:negative={cmd.delta_conv_rate < 0}>
                {cmd.delta_conv_rate > 0 ? '+' : ''}{(cmd.delta_conv_rate * 100).toFixed(1)}
              </span>
            {/if}
          </td>
          <td class="metric col-g4 {showMedals ? getMedalClass('top4s', cmd.commander_pair) : ''}">{cmd.top4s}</td>
          <td class="metric col-g4 {showMedals ? getMedalClass('top4_rate', cmd.commander_pair) : ''}">
            {#if showVsExpected}
              <span class="vs-exp {getVsExpClass(cmd.top4_vs_expected)}">{formatVsExp(cmd.top4_vs_expected)}</span>
            {:else}
              {formatPct(cmd.top4_rate, 1)}
            {/if}
            {#if showDelta && cmd.delta_top4_rate != null}
              <span class="delta" class:positive={cmd.delta_top4_rate > 0} class:negative={cmd.delta_top4_rate < 0}>
                {cmd.delta_top4_rate > 0 ? '+' : ''}{(cmd.delta_top4_rate * 100).toFixed(1)}
              </span>
            {/if}
          </td>
          <td class="metric col-g5 {showMedals ? getMedalClass('championships', cmd.commander_pair) : ''}">{cmd.championships}</td>
          <td class="metric col-g5 {showMedals ? getMedalClass('champ_rate', cmd.commander_pair) : ''}">
            {#if showVsExpected}
              <span class="vs-exp {getVsExpClass(cmd.champ_vs_expected)}">{formatVsExp(cmd.champ_vs_expected)}</span>
            {:else}
              {formatPct(cmd.champ_rate, 1)}
            {/if}
            {#if showDelta && cmd.delta_champ_rate != null}
              <span class="delta" class:positive={cmd.delta_champ_rate > 0} class:negative={cmd.delta_champ_rate < 0}>
                {cmd.delta_champ_rate > 0 ? '+' : ''}{(cmd.delta_champ_rate * 100).toFixed(1)}
              </span>
            {/if}
          </td>
        </tr>
        <!-- Accordion detail row -->
        {#if expanded}
          <tr class="detail-row">
            <td colspan="13">
              {#if loadingTournaments.has(cmd.commander_pair)}
                <div class="loading-tournaments">Loading tournaments...</div>
              {:else if tournamentData[cmd.commander_pair]?.length > 0}
                <div class="tournament-details">
                  <table class="tournaments-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Tournament</th>
                        <th>Size</th>
                        <th>Players</th>
                      </tr>
                    </thead>
                    <tbody>
                      {#each [...tournamentData[cmd.commander_pair]].sort((a, b) => Math.min(...a.entries.map(e => e.standing)) - Math.min(...b.entries.map(e => e.standing))) as t}
                        <tr class="tournament-header">
                          <td>{formatTournamentDate(t.start_date)}</td>
                          <td><a href="/tournaments/{t.tid}">{t.tournament_name}</a></td>
                          <td class="metric">{t.total_players}</td>
                          <td class="metric">{t.entries.length}</td>
                        </tr>
                        {#each [...t.entries].sort((a, b) => a.standing - b.standing) as entry}
                          <tr class="entry-row" class:top-cut={t.top_cut && entry.standing <= t.top_cut}>
                            <td></td>
                            <td>
                              <a href="/players/{entry.player_id}">{entry.player_name}</a>
                            </td>
                            <td class="metric">{entry.wins}-{entry.losses}-{entry.draws}</td>
                            <td class="metric" class:gold={entry.standing === 1} class:silver={entry.standing === 2} class:bronze={entry.standing === 3}>
                              #{entry.standing}
                            </td>
                          </tr>
                        {/each}
                      {/each}
                    </tbody>
                  </table>
                </div>
              {:else}
                <div class="no-tournaments">No tournament data available for this period.</div>
              {/if}
            </td>
          </tr>
        {/if}
      {/each}
    </tbody>
  </table>
</div>

<p class="legend">
  <strong>Entries:</strong> # of tournament entries &nbsp;|&nbsp;
  <strong>Win %:</strong> Game win rate &nbsp;|&nbsp;
  <strong>5wiss:</strong> (Win% x 5) + (Draw% x 1) &nbsp;|&nbsp;
  <strong>Conv:</strong> Top cuts &nbsp;|&nbsp;
  <strong>T4:</strong> Top 4 finishes &nbsp;|&nbsp;
  <strong>🏆:</strong> Tournament wins
</p>

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

  .title-link {
    color: inherit;
    text-decoration: none;
  }

  .title-link:hover {
    text-decoration: underline;
  }

  .beta-badge {
    font-size: 0.5em;
    color: var(--text-muted);
    vertical-align: middle;
  }

  .guide-btn {
    background: var(--bg-tertiary);
    border: 1px solid #555;
    color: var(--text-muted);
    padding: 2px 8px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.5em;
    margin-left: 10px;
    vertical-align: middle;
  }

  .guide-btn:hover {
    background: #444;
    color: var(--text-primary);
  }

  .guide-btn.active {
    background: var(--accent);
    color: var(--bg-primary);
    border-color: var(--accent);
  }

  .guide-panel {
    background: var(--bg-primary);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 20px;
    margin: 15px 0;
    font-size: 0.9em;
    line-height: 1.6;
  }

  .guide-section {
    margin-bottom: 20px;
  }

  .guide-section:last-child {
    margin-bottom: 0;
  }

  .guide-section h3 {
    color: var(--accent);
    margin: 0 0 10px 0;
    font-size: 1em;
    border-bottom: 1px solid var(--border);
    padding-bottom: 5px;
  }

  .guide-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 10px;
  }

  .guide-item {
    display: flex;
    gap: 8px;
  }

  .guide-item strong {
    color: var(--text-primary);
    min-width: 70px;
  }

  .guide-item span {
    color: var(--text-muted);
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

  .era-label {
    color: var(--text-muted);
    font-size: 0.75em;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-right: 2px;
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
    margin: 8px 0 12px 0;
    padding: 10px;
    background: var(--bg-secondary);
    border-radius: 8px;
    font-size: 0.9em;
  }

  .stats-summary strong {
    color: var(--accent);
  }

  .stats-summary select {
    padding: 4px 8px;
    background: var(--bg-tertiary);
    color: var(--text-primary);
    border: 1px solid var(--border);
    border-radius: 4px;
    font-size: 0.9em;
    cursor: pointer;
  }

  .stats-summary .muted {
    color: var(--text-muted);
  }

  /* Live Tournaments Section */
  .live-section {
    margin: 15px 0;
    padding: 15px;
    background: var(--bg-secondary);
    border: 1px solid #ef4444;
    border-radius: 8px;
    animation: pulse-border 3s infinite;
  }

  @keyframes pulse-border {
    0%, 100% { border-color: #ef4444; box-shadow: 0 0 5px rgba(239, 68, 68, 0.2); }
    50% { border-color: #f87171; box-shadow: 0 0 10px rgba(239, 68, 68, 0.4); }
  }

  .live-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 12px;
    flex-wrap: wrap;
  }

  .live-badge {
    background: #ef4444;
    color: white;
    padding: 3px 8px;
    border-radius: 4px;
    font-size: 0.75em;
    font-weight: bold;
    letter-spacing: 0.5px;
    animation: pulse-bg 1.5s infinite;
  }

  @keyframes pulse-bg {
    0%, 100% { background: #ef4444; }
    50% { background: #dc2626; }
  }

  .live-title {
    font-weight: 600;
    font-size: 1.1em;
  }

  .refresh-btn {
    margin-left: auto;
    padding: 4px 12px;
    background: var(--bg-tertiary);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--text-primary);
    font-size: 0.8em;
    cursor: pointer;
  }

  .refresh-btn:hover:not(:disabled) {
    border-color: var(--accent);
  }

  .refresh-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .live-timestamp {
    font-size: 0.75em;
    color: var(--text-muted);
  }

  .live-prompt {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 20px;
  }

  .load-live-btn {
    padding: 10px 24px;
    background: #ef4444;
    border: none;
    border-radius: 6px;
    color: white;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }

  .load-live-btn:hover {
    background: #dc2626;
    transform: scale(1.02);
  }

  .live-note {
    font-size: 0.75em;
    color: var(--text-muted);
  }

  .live-error {
    text-align: center;
    color: var(--negative);
    padding: 10px;
  }

  .live-tournaments {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .live-tournament-card {
    background: var(--bg-tertiary);
    border: 1px solid var(--border);
    border-radius: 6px;
    overflow: hidden;
  }

  .live-tournament-card.expanded {
    border-color: #ef4444;
  }

  .live-card-header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 15px;
    cursor: pointer;
    transition: background 0.15s;
  }

  .live-card-header:hover {
    background: var(--bg-card);
  }

  .live-card-header .expand-arrow {
    color: var(--text-muted);
    font-size: 0.8em;
  }

  .live-tournament-card.expanded .expand-arrow {
    color: #ef4444;
  }

  .tournament-name {
    font-weight: 600;
    flex: 1;
  }

  .tournament-stats {
    display: flex;
    gap: 12px;
    font-size: 0.85em;
  }

  .player-count {
    color: var(--accent);
    font-weight: 500;
  }

  .round-info {
    color: var(--text-muted);
  }

  .live-card-body {
    border-top: 1px solid var(--border);
    padding: 12px 15px;
  }

  .view-toggle {
    display: flex;
    gap: 6px;
    margin-bottom: 12px;
  }

  .view-toggle button {
    padding: 5px 12px;
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--text-muted);
    font-size: 0.8em;
    cursor: pointer;
  }

  .view-toggle button.active {
    background: #ef4444;
    border-color: #ef4444;
    color: white;
  }

  .live-standings-table, .live-commanders-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.85em;
  }

  .live-standings-table th, .live-commanders-table th {
    background: var(--bg-secondary);
    padding: 8px 10px;
    text-align: left;
    font-weight: 600;
    color: var(--text-secondary);
    border-bottom: 1px solid var(--border);
  }

  .live-standings-table td, .live-commanders-table td {
    padding: 6px 10px;
    border-bottom: 1px solid var(--border);
  }

  .live-standings-table tr.top4 {
    background: rgba(76, 175, 80, 0.1);
  }

  .live-standings-table .standing {
    font-weight: 600;
    width: 40px;
  }

  .live-standings-table .standing.gold { color: var(--gold); }
  .live-standings-table .standing.silver { color: var(--silver); }
  .live-standings-table .standing.bronze { color: var(--bronze); }

  .live-standings-table .player-name {
    font-weight: 500;
  }

  .live-standings-table .commander a,
  .live-commanders-table .commander a {
    color: var(--accent);
  }

  .live-standings-table .commander a:hover,
  .live-commanders-table .commander a:hover {
    text-decoration: underline;
  }

  .live-standings-table .unknown,
  .live-commanders-table .unknown {
    color: var(--text-muted);
    font-style: italic;
  }

  .live-standings-table .record {
    font-family: monospace;
    color: var(--text-secondary);
  }

  .live-commanders-table .gold { color: var(--gold); font-weight: 600; }
  .live-commanders-table .silver { color: var(--silver); font-weight: 600; }
  .live-commanders-table .bronze { color: var(--bronze); font-weight: 600; }

  /* Featured Tournaments */
  .featured-tournaments {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 12px 0;
    padding: 12px;
    background: var(--bg-secondary);
    border-radius: 8px;
    overflow: visible;
    position: relative;
    z-index: 50;
  }

  .tournament-search-container {
    position: relative;
    flex-shrink: 0;
    z-index: 200;
  }

  .tournament-search {
    width: 200px;
    padding: 8px 12px;
    background: var(--bg-tertiary);
    color: var(--text-primary);
    border: 1px solid var(--border);
    border-radius: 4px;
  }

  .tournament-dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    width: 350px;
    background: var(--bg-tertiary);
    border: 1px solid var(--border);
    border-radius: 4px;
    max-height: 400px;
    overflow-y: auto;
    z-index: 1000;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  }

  .tournament-option {
    padding: 8px 12px;
    cursor: pointer;
    border-bottom: 1px solid var(--border);
  }

  .tournament-option:hover {
    background: #333;
  }

  .tournament-option .size {
    color: var(--text-muted);
    font-size: 0.85em;
  }

  .featured-tournament {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 14px;
    background: var(--bg-tertiary);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--text-primary);
    text-decoration: none;
    font-size: 0.85em;
    transition: all 0.2s;
    white-space: nowrap;
    cursor: pointer;
  }

  .featured-tournament:hover {
    background: #333;
  }

  .featured-tournament:hover:not(:has(.name:hover)) {
    border-color: var(--accent);
  }

  .featured-tournament .size {
    background: var(--accent);
    color: var(--bg-primary);
    padding: 2px 8px;
    border-radius: 4px;
    font-weight: bold;
    font-size: 0.9em;
  }

  .featured-tournament .name {
    color: var(--accent);
    max-width: 250px;
    overflow: hidden;
    text-overflow: ellipsis;
    text-decoration: none;
  }

  .featured-tournament .name:hover {
    text-decoration: underline;
  }

  .featured-tournament:has(.name:hover) {
    border-color: var(--border);
    cursor: default;
  }

  /* Selected Tournament Banner */
  .selected-tournament-banner {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    margin: 12px 0;
    padding: 12px 20px;
    background: rgba(76, 175, 80, 0.15);
    border: 1px solid var(--accent);
    border-radius: 8px;
  }

  .selected-tournament-banner .label {
    color: var(--text-muted);
  }

  .selected-tournament-banner .tournament-link {
    color: var(--accent);
    font-weight: 600;
    text-decoration: none;
  }

  .selected-tournament-banner .tournament-link:hover {
    text-decoration: underline;
  }

  .selected-tournament-banner .players {
    color: var(--text-muted);
    font-size: 0.9em;
  }

  .clear-tournament-btn {
    background: var(--bg-tertiary);
    border: 1px solid var(--border);
    color: var(--text-primary);
    padding: 4px 10px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.85em;
    margin-left: 10px;
  }

  .clear-tournament-btn:hover {
    background: #444;
    border-color: var(--negative);
    color: var(--negative);
  }

  /* Filters */
  .filters {
    display: flex;
    justify-content: center;
    align-items: center;
    flex-wrap: wrap;
    gap: 10px;
    margin: 8px 0 16px 0;
    padding: 10px 12px;
    background: var(--bg-secondary);
    border-radius: 8px;
  }

  .filters select {
    padding: 5px 8px;
    background: var(--bg-tertiary);
    color: var(--text-primary);
    border: 1px solid var(--border);
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.8em;
  }

  .filters select.filter-active {
    border-color: var(--accent);
    box-shadow: 0 0 0 1px rgba(76, 175, 80, 0.25);
  }

  .filter-label {
    color: var(--text-muted);
    font-size: 0.8em;
  }

  /* Toggle pills */
  .toggle-pills {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  .pill {
    padding: 5px 12px;
    background: var(--bg-tertiary);
    border: 1px solid var(--border);
    border-radius: 20px;
    color: var(--text-muted);
    font-size: 0.8em;
    cursor: pointer;
    transition: all 0.15s;
  }

  .pill:hover {
    border-color: var(--text-muted);
    color: var(--text-primary);
  }

  .pill.active {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--bg-primary);
  }

  .pill-small {
    padding: 5px 8px;
    min-width: auto;
  }

  /* Color filter */
  .color-filter {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .color-mode-toggle {
    width: 26px;
    height: 26px;
    padding: 0;
    background: var(--bg-tertiary);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--text-primary);
    font-size: 14px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .color-mode-toggle:hover {
    border-color: var(--accent);
  }

  .color-checkboxes {
    display: flex;
    gap: 0;
  }

  .color-check {
    display: flex;
    align-items: center;
    cursor: pointer;
    padding: 1px;
    border-radius: 3px;
  }

  .color-check:hover {
    background: var(--bg-tertiary);
  }

  .color-check input {
    display: none;
  }

  .color-check input:checked + .ms {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
    border-radius: 50%;
  }

  .color-filter .ms {
    font-size: 14px;
  }

  .clear-btn {
    padding: 6px 12px;
    background: var(--bg-tertiary);
    color: var(--text-primary);
    border: 1px solid var(--border);
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.85em;
  }

  .clear-btn:hover {
    background: #444;
  }

  /* Date nav */
  .date-nav-group {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .stats-summary input[type="date"] {
    background: var(--bg-tertiary);
    border: 1px solid var(--border);
    color: var(--text-primary);
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 0.9em;
    cursor: pointer;
  }

  .stats-summary input[type="date"]::-webkit-calendar-picker-indicator {
    filter: invert(1);
    cursor: pointer;
  }

  .week-shift-btn {
    background: var(--bg-tertiary);
    border: 1px solid var(--border);
    color: var(--accent);
    padding: 4px 10px;
    border-radius: 4px;
    cursor: pointer;
    font-weight: bold;
    transition: all 0.2s;
  }

  .week-shift-btn:hover:not(:disabled) {
    background: #444;
    border-color: var(--accent);
  }

  .week-shift-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .lock-label {
    cursor: pointer;
    color: var(--text-muted);
    display: inline-flex;
    align-items: center;
    gap: 3px;
  }

  .lock-label input {
    cursor: pointer;
  }

  /* Top filter */
  .top-filter {
    display: flex;
    align-items: center;
    gap: 4px;
    border-left: 1px solid var(--border);
    padding-left: 10px;
    margin-left: 4px;
  }

  .top-toggle {
    cursor: pointer;
    width: 26px;
    height: 26px;
    padding: 0;
    border-radius: 50%;
    border: 2px solid var(--text-muted);
    background: transparent;
    color: var(--text-muted);
    font-size: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .top-toggle.include {
    background: rgba(76, 175, 80, 0.2);
    border-color: var(--accent);
    color: var(--accent);
  }

  .top-toggle.exclude {
    background: rgba(244, 67, 54, 0.2);
    border-color: var(--negative);
    color: var(--negative);
  }

  .top-filter select:disabled,
  .top-filter input:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .top-custom {
    width: 50px;
    padding: 4px 6px;
    background: var(--bg-tertiary);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--text-primary);
    font-size: 0.8em;
  }

  /* Table styles */
  thead {
    position: sticky;
    top: 0;
    z-index: 10;
  }

  thead th {
    background: var(--bg-secondary);
    border-bottom: 2px solid var(--border);
  }

  .rank-cell {
    color: var(--text-muted);
    text-align: center;
  }

  .colors-col {
    white-space: nowrap;
  }

  .colors-col .ms {
    font-size: 14px;
    margin-right: 2px;
    vertical-align: middle;
  }

  /* Vs Expected values - colored spans */
  .vs-exp {
    color: var(--text-muted);
  }

  .vs-exp.positive {
    color: var(--positive);
  }

  .vs-exp.negative {
    color: var(--negative);
  }

  .delta {
    font-size: 0.7em;
    margin-left: 3px;
    padding: 1px 3px;
    border-radius: 3px;
    background: var(--bg-tertiary);
  }

  .delta.positive {
    color: var(--positive);
  }

  .delta.negative {
    color: var(--negative);
  }

  .new-badge {
    font-size: 0.6em;
    margin-left: 4px;
    padding: 1px 4px;
    border-radius: 3px;
    background: var(--accent);
    color: var(--bg-primary);
    font-weight: 600;
    vertical-align: middle;
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

  .legend {
    text-align: center;
    color: var(--text-muted);
    font-size: 0.8em;
    margin-top: 1rem;
    padding: 12px;
    background: var(--bg-secondary);
    border-radius: 8px;
  }

  .legend strong {
    color: var(--text-secondary);
  }

  /* Medal classes */
  .stat-gold::before { content: '🥇 '; }
  .stat-silver::before { content: '🥈 '; }
  .stat-bronze::before { content: '🥉 '; }

  /* Commander row accordion */
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
    margin-right: 4px;
    display: inline-block;
    transition: color 0.15s;
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

  .loading-tournaments, .no-tournaments {
    padding: 20px;
    text-align: center;
    color: var(--text-muted);
    font-size: 0.9em;
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

  .tournament-header td {
    background: rgba(76, 175, 80, 0.1);
    font-weight: 500;
  }

  .entry-row td {
    padding-left: 30px;
    color: var(--text-secondary);
  }

  .entry-row.top-cut td {
    color: var(--accent);
  }

  .entry-row td.gold {
    color: var(--gold);
    font-weight: bold;
  }

  .entry-row td.silver {
    color: var(--silver);
    font-weight: bold;
  }

  .entry-row td.bronze {
    color: var(--bronze);
    font-weight: bold;
  }

  /* Column group toggle - hidden on desktop */
  .col-group-toggle {
    display: none;
    justify-content: center;
    gap: 4px;
    margin: 10px 0;
  }

  .col-group-btn {
    padding: 6px 12px;
    background: var(--bg-tertiary);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--text-muted);
    font-size: 0.8em;
    cursor: pointer;
  }

  .col-group-btn.active {
    background: #333;
    color: var(--accent);
    border-color: var(--accent);
  }

  /* Column groups - show all by default on desktop */
  .col-g1, .col-g2, .col-g3, .col-g4, .col-g5 {
    display: table-cell;
  }

  @media (max-width: 768px) {
    /* Show column group toggle on mobile */
    .col-group-toggle {
      display: flex;
    }

    /* Hide all column groups by default on mobile */
    .col-g1, .col-g2, .col-g3, .col-g4, .col-g5 {
      display: none;
    }

    /* Show only active column group */
    table.show-g1 .col-g1 { display: table-cell; }
    table.show-g2 .col-g2 { display: table-cell; }
    table.show-g3 .col-g3 { display: table-cell; }
    table.show-g4 .col-g4 { display: table-cell; }
    table.show-g5 .col-g5 { display: table-cell; }

    .period-toggle {
      gap: 4px;
    }

    .period-btn {
      padding: 4px 8px;
      font-size: 0.75em;
    }

    .period-separator {
      display: none;
    }

    .filters {
      gap: 6px;
      padding: 8px;
      flex-wrap: wrap;
    }

    .filter-group {
      font-size: 0.85em;
    }

    .filter-group select {
      padding: 4px 6px;
      font-size: 0.85em;
    }

    .stats-summary {
      display: none;
    }

    .featured-tournaments {
      display: none;
    }

    table {
      font-size: 0.85em;
    }

    th, td {
      padding: 6px 4px;
    }

    .colors-col .ms {
      font-size: 12px !important;
    }
  }

  @media (max-width: 480px) {
    body {
      padding: 5px;
    }

    h1 {
      font-size: 1.2em;
    }

    table {
      font-size: 0.75em;
    }

    th, td {
      padding: 4px 2px;
    }

    .period-toggle {
      gap: 2px;
    }

    .period-btn {
      padding: 3px 6px;
      font-size: 0.7em;
    }

    .filter-group select {
      padding: 3px 4px;
      font-size: 0.8em;
    }

    .colors-col .ms {
      font-size: 10px !important;
    }

    .col-group-btn {
      padding: 4px 8px;
      font-size: 0.75em;
    }
  }
</style>
