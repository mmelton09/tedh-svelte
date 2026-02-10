<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { Chart, registerables } from 'chart.js';

  Chart.register(...registerables);

  let { data } = $props();
  let chartCanvas: HTMLCanvasElement;
  let chart: Chart | null = null;

  // Chart toggle state
  let showEntries = $state(true);
  let showConv = $state(true);
  let showWin = $state(false);
  let showTop4 = $state(false);
  let showChamp = $state(false);
  let useWeeklyView = $state(false);

  let trendData = $derived(useWeeklyView ? data.weeklyTrends : data.monthlyTrends);

  function buildDatasets() {
    const datasets: any[] = [];

    if (showEntries) {
      datasets.push({
        type: 'line',
        label: 'Entries',
        data: trendData.map((m: any) => m.entries),
        borderColor: 'rgba(99, 102, 241, 1)',
        backgroundColor: 'rgba(99, 102, 241, 0.2)',
        borderWidth: 2,
        pointRadius: 3,
        yAxisID: 'y',
        tension: 0.3,
        fill: true
      });
    }

    if (showConv) {
      datasets.push({
        type: 'line',
        label: '±Conv%',
        data: trendData.map((m: any) => m.convVsExpected),
        borderColor: 'rgba(34, 197, 94, 1)',
        backgroundColor: 'rgba(34, 197, 94, 0.2)',
        borderWidth: 2,
        pointRadius: 4,
        yAxisID: 'y1',
        tension: 0.3
      });
    }

    if (showWin) {
      datasets.push({
        type: 'line',
        label: '±Win%',
        data: trendData.map((m: any) => m.winVsExpected),
        borderColor: 'rgba(251, 191, 36, 1)',
        backgroundColor: 'rgba(251, 191, 36, 0.2)',
        borderWidth: 2,
        pointRadius: 4,
        yAxisID: 'y1',
        tension: 0.3
      });
    }

    if (showTop4) {
      datasets.push({
        type: 'line',
        label: '±Top4%',
        data: trendData.map((m: any) => m.top4VsExpected),
        borderColor: 'rgba(168, 85, 247, 1)',
        backgroundColor: 'rgba(168, 85, 247, 0.2)',
        borderWidth: 2,
        pointRadius: 4,
        yAxisID: 'y1',
        tension: 0.3
      });
    }

    if (showChamp) {
      datasets.push({
        type: 'line',
        label: '±Champ%',
        data: trendData.map((m: any) => m.champVsExpected),
        borderColor: 'rgba(236, 72, 153, 1)',
        backgroundColor: 'rgba(236, 72, 153, 0.2)',
        borderWidth: 2,
        pointRadius: 4,
        yAxisID: 'y1',
        tension: 0.3
      });
    }

    // Add dotted average lines for each visible metric
    if (showEntries) {
      const values = trendData.map((m: any) => m.entries).filter((v: number) => v > 0);
      const avg = values.length > 0 ? values.reduce((a: number, b: number) => a + b, 0) / values.length : 0;
      datasets.push({
        type: 'line',
        label: 'Avg Entries',
        data: trendData.map(() => avg),
        borderColor: 'rgba(99, 102, 241, 0.6)',
        borderWidth: 1,
        borderDash: [5, 5],
        pointRadius: 0,
        yAxisID: 'y',
        tension: 0
      });
    }

    if (showConv) {
      const values = trendData.map((m: any) => m.convVsExpected);
      const avg = values.reduce((a: number, b: number) => a + b, 0) / values.length;
      datasets.push({
        type: 'line',
        label: 'Avg Conv',
        data: trendData.map(() => avg),
        borderColor: 'rgba(34, 197, 94, 0.6)',
        borderWidth: 1,
        borderDash: [5, 5],
        pointRadius: 0,
        yAxisID: 'y1',
        tension: 0
      });
    }

    if (showWin) {
      const values = trendData.map((m: any) => m.winVsExpected);
      const avg = values.reduce((a: number, b: number) => a + b, 0) / values.length;
      datasets.push({
        type: 'line',
        label: 'Avg Win',
        data: trendData.map(() => avg),
        borderColor: 'rgba(251, 191, 36, 0.6)',
        borderWidth: 1,
        borderDash: [5, 5],
        pointRadius: 0,
        yAxisID: 'y1',
        tension: 0
      });
    }

    if (showTop4) {
      const values = trendData.map((m: any) => m.top4VsExpected);
      const avg = values.reduce((a: number, b: number) => a + b, 0) / values.length;
      datasets.push({
        type: 'line',
        label: 'Avg Top4',
        data: trendData.map(() => avg),
        borderColor: 'rgba(168, 85, 247, 0.6)',
        borderWidth: 1,
        borderDash: [5, 5],
        pointRadius: 0,
        yAxisID: 'y1',
        tension: 0
      });
    }

    if (showChamp) {
      const values = trendData.map((m: any) => m.champVsExpected);
      const avg = values.reduce((a: number, b: number) => a + b, 0) / values.length;
      datasets.push({
        type: 'line',
        label: 'Avg Champ',
        data: trendData.map(() => avg),
        borderColor: 'rgba(236, 72, 153, 0.6)',
        borderWidth: 1,
        borderDash: [5, 5],
        pointRadius: 0,
        yAxisID: 'y1',
        tension: 0
      });
    }

    return datasets;
  }

  function updateChart() {
    if (chart) {
      chart.data.datasets = buildDatasets();
      chart.update();
    }
  }

  function initChart() {
    if (!chartCanvas || !trendData?.length) return;

    const ctx = chartCanvas.getContext('2d');
    if (!ctx) return;

    if (chart) chart.destroy();

    chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: trendData.map((m: any) => m.label),
        datasets: buildDatasets()
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false
        },
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            callbacks: {
              title: function(contexts) {
                const idx = contexts[0]?.dataIndex;
                if (idx !== undefined && trendData[idx]) {
                  return trendData[idx].fullLabel;
                }
                return '';
              },
              filter: function(item) {
                return !item.dataset.label?.startsWith('Avg');
              },
              label: function(context) {
                if (context.dataset.label === 'Entries') {
                  return `Entries: ${context.parsed.y}`;
                }
                const val = context.parsed.y;
                return `${context.dataset.label}: ${val >= 0 ? '+' : ''}${val.toFixed(1)}%`;
              }
            }
          }
        },
        scales: {
          x: {
            ticks: { color: '#9ca3af' },
            grid: { color: 'rgba(75, 85, 99, 0.3)' }
          },
          y: {
            type: 'linear',
            display: showEntries,
            position: 'left',
            title: {
              display: true,
              text: 'Entries',
              color: '#9ca3af'
            },
            ticks: { color: '#9ca3af' },
            grid: { color: 'rgba(75, 85, 99, 0.3)' },
            beginAtZero: true
          },
          y1: {
            type: 'linear',
            display: true,
            position: 'right',
            title: {
              display: true,
              text: '± vs Expected',
              color: '#9ca3af'
            },
            ticks: {
              color: '#9ca3af',
              callback: function(value) {
                return (Number(value) >= 0 ? '+' : '') + value + '%';
              }
            },
            grid: { drawOnChartArea: false }
          }
        }
      }
    });
  }

  onMount(() => {
    initChart();
    return () => {
      if (chart) chart.destroy();
    };
  });

  // Reactive update when toggles change
  $effect(() => {
    showEntries; showConv; showWin; showTop4; showChamp;
    updateChart();
  });

  // Reinit chart when data source changes
  $effect(() => {
    useWeeklyView;
    initChart();
  });

  // Accordion state - track which pilot rows are expanded
  let expandedPilots = $state<Set<string>>(new Set());

  // Cache for fetched tournament data
  let pilotTournaments = $state<Record<string, any[]>>({});
  let loadingPilots = $state<Set<string>>(new Set());

  // Toggle state for ±Exp display
  let showVsExpected = $state(false);

  async function togglePilot(playerId: string) {
    const newSet = new Set(expandedPilots);
    if (newSet.has(playerId)) {
      newSet.delete(playerId);
    } else {
      newSet.add(playerId);
      // Fetch tournaments if not already cached
      if (!pilotTournaments[playerId] && !loadingPilots.has(playerId)) {
        loadingPilots = new Set([...loadingPilots, playerId]);
        try {
          const rankedParam = $page.url.searchParams.get('ranked') === 'true' ? 'ranked' : 'all';
          const response = await fetch(
            `/api/pilot-tournaments?player_id=${encodeURIComponent(playerId)}&commander=${encodeURIComponent(data.commanderName)}&min_size=${data.minSize}&period=${data.period}&data_type=${rankedParam}`
          );
          if (response.ok) {
            const result = await response.json();
            pilotTournaments = { ...pilotTournaments, [playerId]: result.tournaments || [] };
          }
        } catch (e) {
          console.error('Failed to fetch pilot tournaments:', e);
        }
        const newLoading = new Set(loadingPilots);
        newLoading.delete(playerId);
        loadingPilots = newLoading;
      }
    }
    expandedPilots = newSet;
  }

  function isPilotExpanded(playerId: string): boolean {
    return expandedPilots.has(playerId);
  }

  function getPilotTournaments(playerId: string): any[] {
    return pilotTournaments[playerId] || [];
  }

  function isPilotLoading(playerId: string): boolean {
    return loadingPilots.has(playerId);
  }

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

  // For summary stats that are rate values (0.0 to 1.0), calculate vs 25% expected
  function formatVsExpected(rate: number | null): string {
    if (rate === null || rate === undefined) return '';
    const diff = (rate - 0.25) * 100;
    const prefix = diff >= 0 ? '+' : '';
    return `${prefix}${diff.toFixed(1)}%`;
  }

  function getVsExpectedClass(rate: number | null): string {
    if (rate === null || rate === undefined) return '';
    return rate > 0.25 ? 'positive' : rate < 0.25 ? 'negative' : '';
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

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }

  function updateParams(updates: Record<string, string | number>) {
    const params = new URLSearchParams($page.url.searchParams);
    for (const [key, value] of Object.entries(updates)) {
      if (value === '' || value === null || value === undefined) {
        params.delete(key);
      } else {
        params.set(key, value.toString());
      }
    }
    goto(`?${params.toString()}`, { replaceState: true });
  }

  // Commander search state
  let commanderSearch = $state('');
  let commanderSuggestions = $state<string[]>([]);
  let showSuggestions = $state(false);
  let searchTimeout: ReturnType<typeof setTimeout> | null = null;

  async function searchCommanders(query: string) {
    if (query.length < 2) {
      commanderSuggestions = [];
      return;
    }

    try {
      const response = await fetch(`/api/commander-search?q=${encodeURIComponent(query)}`);
      if (response.ok) {
        const results = await response.json();
        commanderSuggestions = results.slice(0, 10);
      }
    } catch {
      commanderSuggestions = [];
    }
  }

  function handleSearchInput(e: Event) {
    const value = (e.target as HTMLInputElement).value;
    commanderSearch = value;
    showSuggestions = true;

    if (searchTimeout) clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => searchCommanders(value), 200);
  }

  function selectCommander(commander: string) {
    commanderSearch = '';
    commanderSuggestions = [];
    showSuggestions = false;
    goto(`/commanders/${encodeURIComponent(commander)}`);
  }

  function handleSearchKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      showSuggestions = false;
      commanderSearch = '';
    }
  }

  // Date range state
  let dateStart = $state(data.periodStart || '');
  let dateEnd = $state(data.periodEnd || '');

  // Keep date inputs in sync with server data
  $effect(() => {
    dateStart = data.periodStart || '';
    dateEnd = data.periodEnd || '';
  });

  function updateMinSize(newMinSize: number) {
    updateParams({ min_size: newMinSize, page: 1 });
  }

  function updatePeriod(newPeriod: string) {
    updateParams({ period: newPeriod, page: 1 });
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

  function getSortIndicator(col: string): string {
    if (data.sortBy !== col) return '';
    return data.sortOrder === 'desc' ? ' ▼' : ' ▲';
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
</script>

<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/mana-font@latest/css/mana.min.css">

<!-- Commander Header with Card Images and Chart -->
<div class="commander-header">
  <div class="header-left">
    {#if data.cardImages && data.cardImages.length > 0}
      <div class="commander-cards">
        {#each data.cardImages as card}
          {#if card.full}
            <img
              src={card.full}
              alt={card.name}
              class="commander-card-img"
            />
          {/if}
        {/each}
      </div>
    {/if}
  </div>
  <div class="header-right">
    {#if trendData && trendData.length > 0}
      <div class="chart-controls">
        <div class="granularity-toggle">
          <button class:active={!useWeeklyView} onclick={() => useWeeklyView = false}>Mo</button>
          <button class:active={useWeeklyView} onclick={() => useWeeklyView = true}>Wk</button>
        </div>
        <label class="chart-toggle">
          <input type="checkbox" bind:checked={showEntries} />
          <span class="toggle-label" style="--color: rgba(99, 102, 241, 1)">Entries</span>
        </label>
        <label class="chart-toggle">
          <input type="checkbox" bind:checked={showConv} />
          <span class="toggle-label" style="--color: rgba(34, 197, 94, 1)">±Conv</span>
        </label>
        <label class="chart-toggle">
          <input type="checkbox" bind:checked={showWin} />
          <span class="toggle-label" style="--color: rgba(251, 191, 36, 1)">±Win</span>
        </label>
        <label class="chart-toggle">
          <input type="checkbox" bind:checked={showTop4} />
          <span class="toggle-label" style="--color: rgba(168, 85, 247, 1)">±Top4</span>
        </label>
        <label class="chart-toggle">
          <input type="checkbox" bind:checked={showChamp} />
          <span class="toggle-label" style="--color: rgba(236, 72, 153, 1)">±🏆</span>
        </label>
      </div>
      <div class="header-chart-container">
        <canvas bind:this={chartCanvas}></canvas>
      </div>
    {/if}
  </div>
</div>
<div class="commander-title">
  <h1>
    {data.commanderName}
    {#if data.colorIdentity}
      <span class="color-identity">
        {#each [...data.colorIdentity] as color}
          <i class="ms ms-{color.toLowerCase()} ms-cost"></i>
        {/each}
      </span>
    {/if}
  </h1>
  <div class="commander-search">
    <input
      type="text"
      placeholder="Search commanders..."
      value={commanderSearch}
      oninput={handleSearchInput}
      onkeydown={handleSearchKeydown}
      onfocus={() => showSuggestions = commanderSuggestions.length > 0}
      onblur={() => setTimeout(() => showSuggestions = false, 200)}
    />
    {#if showSuggestions && commanderSuggestions.length > 0}
      <ul class="suggestions">
        {#each commanderSuggestions as suggestion}
          <li>
            <button type="button" onmousedown={() => selectCommander(suggestion)}>
              {suggestion}
            </button>
          </li>
        {/each}
      </ul>
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
  Event Size:
  <select
    class="size-select"
    value={String(data.minSize)}
    onchange={(e) => updateMinSize(parseInt(e.currentTarget.value) || 16)}
  >
    <option value="16">16+</option>
    <option value="30">30+</option>
    <option value="50">50+</option>
    <option value="100">100+</option>
    <option value="250">250+</option>
  </select>
  &nbsp;|&nbsp;
  <strong>{data.summary.entries}</strong> entries
  &nbsp;|&nbsp;
  <strong>{data.totalPilots || 0}</strong> pilots
</div>

<!-- Stats Cards -->
<div class="stats-grid">
  <div class="stat-card">
    <div class="stat-value">{data.summary.entries}</div>
    <div class="stat-label">Entries</div>
  </div>
  <div class="stat-card">
    <div class="stat-value">{data.summary.unique_pilots || '-'}</div>
    <div class="stat-label">Unique Pilots</div>
  </div>
  <div class="stat-card">
    <div class="stat-value">
      {formatPct(data.summary.win_rate, 1)}
      <span class="vs-expected {getVsExpectedClass(data.summary.win_rate)}">
        {formatVsExpected(data.summary.win_rate)}
      </span>
    </div>
    <div class="stat-label">Win Rate</div>
  </div>
  <div class="stat-card">
    <div class="stat-value">{data.summary.conversions}</div>
    <div class="stat-label">Conversions</div>
  </div>
  <div class="stat-card">
    <div class="stat-value">
      {formatPct(data.summary.conversion_rate, 1)}
      <span class="vs-expected {getVsExpectedClass(data.summary.conversion_rate)}">
        {formatVsExpected(data.summary.conversion_rate)}
      </span>
    </div>
    <div class="stat-label">Conv Rate</div>
  </div>
  <div class="stat-card">
    <div class="stat-value">{data.summary.top4s}</div>
    <div class="stat-label">Top 4s</div>
  </div>
  <div class="stat-card">
    <div class="stat-value">
      {formatPct(data.summary.top4_rate, 1)}
      <span class="vs-expected {getVsExpectedClass(data.summary.top4_rate)}">
        {formatVsExpected(data.summary.top4_rate)}
      </span>
    </div>
    <div class="stat-label">Top 4 Rate</div>
  </div>
  <div class="stat-card highlight">
    <div class="stat-value">{data.summary.championships}</div>
    <div class="stat-label">🏆 Wins</div>
  </div>
  <div class="stat-card highlight">
    <div class="stat-value">
      {formatPct(data.summary.champ_rate, 1)}
      <span class="vs-expected {getVsExpectedClass(data.summary.champ_rate)}">
        {formatVsExpected(data.summary.champ_rate)}
      </span>
    </div>
    <div class="stat-label">Champ Rate</div>
  </div>
</div>

<!-- Stats Breakdown -->
<section class="section">
  <h2>Performance Breakdown</h2>
  <div class="breakdown-grid">
    <div class="breakdown-item">
      <div class="breakdown-label">Total Games</div>
      <div class="breakdown-value">{data.summary.total_wins + data.summary.total_losses + data.summary.total_draws}</div>
    </div>
    <div class="breakdown-item">
      <div class="breakdown-label">Record</div>
      <div class="breakdown-value">{data.summary.total_wins}-{data.summary.total_losses}-{data.summary.total_draws}</div>
    </div>
    <div class="breakdown-item">
      <div class="breakdown-label">Avg Standing</div>
      <div class="breakdown-value">{data.summary.avg_standing?.toFixed(1) || '-'}</div>
    </div>
  </div>
</section>

<!-- Pilots Table with Accordions -->
{#if data.pilots && data.pilots.length > 0}
<section class="section">
  <div class="pilots-header">
    <h2>Pilots</h2>
    <div class="pilots-controls">
      <label class="toggle-label">
        <input type="checkbox" bind:checked={showVsExpected}>
        ±Exp
      </label>
      <span class="entries-filter">
        Min Entries:
        <select
          class="size-select"
          value={String(data.minEntries)}
          onchange={(e) => updateParams({ min_entries: parseInt(e.currentTarget.value) || 1, page: 1 })}
        >
          <option value="1">1+</option>
          <option value="2">2+</option>
          <option value="3">3+</option>
          <option value="5">5+</option>
          <option value="10">10+</option>
        </select>
      </span>
      <span class="pilot-count">{data.totalPilots} pilots</span>
    </div>
  </div>

  <!-- Pagination (top) -->
  {#if data.totalPages > 1}
    <div class="pagination">
      <button class="page-btn" disabled={data.page <= 1} onclick={() => goToPage(1)}>First</button>
      <button class="page-btn" disabled={data.page <= 1} onclick={() => goToPage(data.page - 1)}>Prev</button>
      <span class="page-info">Page <strong>{data.page}</strong> of <strong>{data.totalPages}</strong></span>
      <button class="page-btn" disabled={data.page >= data.totalPages} onclick={() => goToPage(data.page + 1)}>Next</button>
      <button class="page-btn" disabled={data.page >= data.totalPages} onclick={() => goToPage(data.totalPages)}>Last</button>
    </div>
  {/if}

  <div class="table-container">
    <table>
      <thead>
        <tr>
          <th style="width: 40px">#</th>
          <th class="sortable" onclick={() => handleSort('name')}>Player{getSortIndicator('name')}</th>
          <th class="metric sortable" onclick={() => handleSort('elo')}>ELO{getSortIndicator('elo')}</th>
          <th class="metric sortable" onclick={() => handleSort('entries')}>Entries{getSortIndicator('entries')}</th>
          <th class="metric">Record</th>
          <th class="metric sortable" onclick={() => handleSort('win_rate')}>Win%{getSortIndicator('win_rate')}</th>
          <th class="metric sortable" onclick={() => handleSort('five_swiss')} title="5wiss = (Win% × 5) + (Draw% × 1)">5wiss{getSortIndicator('five_swiss')}</th>
          <th class="metric sortable" onclick={() => handleSort('conversions')}>Conv{getSortIndicator('conversions')}</th>
          <th class="metric sortable" onclick={() => handleSort('conv_rate')}>{showVsExpected ? 'Conv±' : 'Conv%'}{getSortIndicator('conv_rate')}</th>
          <th class="metric sortable" onclick={() => handleSort('top4_rate')}>{showVsExpected ? 'Top4±' : 'Top4%'}{getSortIndicator('top4_rate')}</th>
          <th class="metric sortable" onclick={() => handleSort('champ_rate')}>{showVsExpected ? '🏆±' : '🏆%'}{getSortIndicator('champ_rate')}</th>
          <th class="metric sortable" onclick={() => handleSort('placement_pct')} title="Average placement percentile">AvgX%{getSortIndicator('placement_pct')}</th>
        </tr>
      </thead>
      <tbody>
        {#each data.pilots as pilot, i}
          {@const rank = (data.page - 1) * data.perPage + i + 1}
          {@const expanded = isPilotExpanded(pilot.player_id)}
          <tr class="pilot-row" class:expanded onclick={() => togglePilot(pilot.player_id)}>
            <td class="rank-cell">
              <span class="expand-arrow">{expanded ? '▼' : '▶'}</span>
              {rank}
            </td>
            <td>
              <a href="/players/{pilot.player_id}" onclick={(e) => e.stopPropagation()}>{pilot.player_name}</a>
            </td>
            <td class="metric {getEloClass(pilot.openskill_elo)}">{formatElo(pilot.openskill_elo)}</td>
            <td class="metric">{pilot.entries}</td>
            <td class="metric">{pilot.total_wins}-{pilot.total_losses}-{pilot.total_draws}</td>
            <td class="metric">{formatPct(pilot.win_rate, 1)}</td>
            <td class="metric">{pilot.five_swiss?.toFixed(2) || '-'}</td>
            <td class="metric">{pilot.conversions}</td>
            <td class="metric">
              {#if showVsExpected}
                <span class="vs-exp {getVsExpClass(pilot.conv_vs_expected)}">{formatVsExp(pilot.conv_vs_expected)}</span>
              {:else}
                {formatPct(pilot.conversion_rate, 1)}
              {/if}
            </td>
            <td class="metric">
              {#if showVsExpected}
                <span class="vs-exp {getVsExpClass(pilot.top4_vs_expected)}">{formatVsExp(pilot.top4_vs_expected)}</span>
              {:else}
                {formatPct(pilot.top4_rate, 1)}
              {/if}
            </td>
            <td class="metric">
              {#if showVsExpected}
                <span class="vs-exp {getVsExpClass(pilot.champ_vs_expected)}">{formatVsExp(pilot.champ_vs_expected)}</span>
              {:else}
                {formatPct(pilot.champ_rate, 1)}
              {/if}
            </td>
            <td class="metric">{pilot.avg_placement_pct?.toFixed(1) || '0.0'}%</td>
          </tr>
          <!-- Expanded detail row with tournaments -->
          {#if expanded}
            {@const tournaments = getPilotTournaments(pilot.player_id)}
            {@const loading = isPilotLoading(pilot.player_id)}
            <tr class="detail-row">
              <td colspan="12">
                <div class="tournament-details">
                  {#if loading}
                    <div class="loading-tournaments">Loading tournaments...</div>
                  {:else if tournaments.length > 0}
                    <table class="tournaments-table">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Tournament</th>
                          <th class="metric">Record</th>
                          <th class="metric">Place</th>
                          <th>Decklist</th>
                        </tr>
                      </thead>
                      <tbody>
                        {#each tournaments as t}
                          <tr class:gold={t.standing === 1} class:silver={t.standing === 2} class:bronze={t.standing === 3} class:top-cut={t.standing <= 4}>
                            <td>{t.start_date ? formatDate(t.start_date) : '-'}</td>
                            <td><a href="/tournaments/{t.tid}">{t.tournament_name}</a></td>
                            <td class="metric">{t.wins}-{t.losses}-{t.draws}</td>
                            <td class="metric">{t.standing}/{t.total_players}</td>
                            <td>
                              {#if t.decklist}
                                <a href={t.decklist.startsWith('http') ? t.decklist : `https://topdeck.gg/deck/${t.tid}/${pilot.player_id}`} target="_blank">Decklist</a>
                              {:else}
                                <a href="https://topdeck.gg/deck/{t.tid}/{pilot.player_id}" target="_blank">Decklist</a>
                              {/if}
                            </td>
                          </tr>
                        {/each}
                      </tbody>
                    </table>
                  {:else}
                    <div class="no-tournaments">No tournament data available for this period.</div>
                  {/if}
                </div>
              </td>
            </tr>
          {/if}
        {/each}
      </tbody>
    </table>
  </div>

  <!-- Pagination (bottom) -->
  {#if data.totalPages > 1}
    <div class="pagination">
      <button class="page-btn" disabled={data.page <= 1} onclick={() => goToPage(1)}>First</button>
      <button class="page-btn" disabled={data.page <= 1} onclick={() => goToPage(data.page - 1)}>Prev</button>
      <span class="page-info">Page <strong>{data.page}</strong> of <strong>{data.totalPages}</strong></span>
      <button class="page-btn" disabled={data.page >= data.totalPages} onclick={() => goToPage(data.page + 1)}>Next</button>
      <button class="page-btn" disabled={data.page >= data.totalPages} onclick={() => goToPage(data.totalPages)}>Last</button>
    </div>
  {/if}
</section>
{/if}

<style>
  /* Commander Header with Card Images and Chart side by side */
  .commander-header {
    display: flex;
    gap: 2rem;
    align-items: flex-start;
    margin-bottom: 1rem;
  }

  .header-left {
    flex-shrink: 0;
  }

  .header-right {
    flex: 1;
    min-width: 0;
  }

  .commander-cards {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .commander-card-img {
    width: 145px;
    height: auto;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  }

  .header-chart-container {
    background: var(--bg-card);
    border-radius: 8px;
    padding: 1rem;
    height: 280px;
  }

  .commander-title {
    text-align: center;
    margin-bottom: 0.5rem;
  }

  .commander-title h1 {
    font-size: 1.75rem;
    margin-bottom: 0.25rem;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    flex-wrap: wrap;
  }

  .commander-search {
    position: relative;
    max-width: 300px;
    margin: 0.5rem auto 0;
  }

  .commander-search input {
    width: 100%;
    padding: 0.4rem 0.75rem;
    background: var(--bg-tertiary);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--text-primary);
    font-size: 0.85rem;
  }

  .commander-search input:focus {
    outline: none;
    border-color: var(--accent);
  }

  .commander-search .suggestions {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 6px;
    margin-top: 4px;
    list-style: none;
    z-index: 100;
    max-height: 300px;
    overflow-y: auto;
  }

  .commander-search .suggestions li button {
    width: 100%;
    padding: 0.5rem 0.75rem;
    text-align: left;
    background: none;
    border: none;
    color: var(--text-primary);
    cursor: pointer;
    font-size: 0.85rem;
  }

  .commander-search .suggestions li button:hover {
    background: var(--bg-tertiary);
  }

  @media (max-width: 900px) {
    .commander-header {
      flex-direction: column;
      align-items: center;
    }

    .commander-cards {
      flex-direction: row;
      justify-content: center;
    }

    .commander-card-img {
      width: 100px;
    }

    .header-right {
      width: 100%;
    }

    .header-chart-container {
      height: 200px;
    }
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

  .color-identity {
    display: inline-flex;
    gap: 2px;
  }

  .color-identity .ms {
    font-size: 1.25rem;
  }

  .subtitle {
    color: var(--text-muted);
    font-size: 0.9rem;
    display: flex;
    align-items: center;
    gap: 10px;
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

  .breakdown-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 1rem;
  }

  .breakdown-item {
    background: var(--bg-card);
    border-radius: 8px;
    padding: 1rem;
    text-align: center;
  }

  .breakdown-label {
    font-size: 0.8rem;
    color: var(--text-muted);
    margin-bottom: 0.25rem;
  }

  .breakdown-value {
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--text-primary);
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

  td a {
    color: var(--text-primary);
  }

  td a:hover {
    color: var(--accent);
  }

  /* Chart styles */
  .chart-controls {
    display: flex;
    justify-content: flex-start;
    flex-wrap: wrap;
    gap: 0.75rem;
    margin-bottom: 0.5rem;
  }

  .chart-toggle {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    cursor: pointer;
  }

  .chart-toggle input {
    width: 14px;
    height: 14px;
    cursor: pointer;
  }

  .toggle-label {
    color: var(--color);
    font-size: 0.8rem;
    font-weight: 500;
  }

  .granularity-toggle {
    display: flex;
    gap: 2px;
    margin-right: 0.5rem;
  }

  .granularity-toggle button {
    padding: 0.2rem 0.5rem;
    font-size: 0.75rem;
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--text-muted);
    cursor: pointer;
  }

  .granularity-toggle button:first-child {
    border-radius: 4px 0 0 4px;
  }

  .granularity-toggle button:last-child {
    border-radius: 0 4px 4px 0;
  }

  .granularity-toggle button.active {
    background: var(--accent);
    color: white;
    border-color: var(--accent);
  }

  @media (max-width: 768px) {
    .stats-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  /* Pilots section */
  .pilots-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
  }

  .pilots-header h2 {
    margin: 0;
  }

  .pilots-controls {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .pilots-controls .toggle-label {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    cursor: pointer;
    font-size: 0.85rem;
    color: var(--text-muted);
  }

  .entries-filter {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.85rem;
    color: var(--text-muted);
  }

  .pilot-count {
    font-size: 0.85rem;
    color: var(--text-muted);
  }

  /* Pagination */
  .pagination {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 0.5rem;
    margin: 1rem 0;
  }

  .page-btn {
    padding: 6px 12px;
    background: var(--bg-tertiary);
    color: var(--text-primary);
    border: 1px solid var(--border);
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.85rem;
  }

  .page-btn:hover:not(:disabled) {
    background: var(--bg-card);
    border-color: var(--accent);
  }

  .page-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .page-info {
    font-size: 0.85rem;
    color: var(--text-muted);
    padding: 0 0.5rem;
  }

  /* Sortable headers */
  th.sortable {
    cursor: pointer;
    user-select: none;
  }

  th.sortable:hover {
    background: var(--bg-tertiary);
  }

  /* Pilot rows with accordion */
  .pilot-row {
    cursor: pointer;
  }

  .pilot-row:hover {
    background: var(--bg-tertiary);
  }

  .pilot-row.expanded {
    background: var(--bg-tertiary);
  }

  .rank-cell {
    white-space: nowrap;
  }

  .expand-arrow {
    color: var(--accent);
    font-size: 0.8em;
    margin-right: 4px;
  }

  /* ELO classes */
  .elo-high {
    color: var(--positive, #4CAF50);
    font-weight: 600;
  }

  .elo-mid {
    color: #8BC34A;
  }

  .elo-low {
    color: var(--text-muted);
  }

  /* Vs Expected values */
  .vs-exp {
    color: var(--text-muted);
  }

  .vs-exp.positive {
    color: var(--positive, #4CAF50);
  }

  .vs-exp.negative {
    color: var(--negative, #f44336);
  }

  /* Detail row for tournaments */
  .detail-row td {
    padding: 0;
    background: var(--bg-secondary);
  }

  .tournament-details {
    padding: 0.5rem 1rem 1rem;
  }

  .tournaments-table {
    width: 100%;
    margin: 0;
    background: var(--bg-card);
    border-radius: 4px;
    font-size: 0.9em;
  }

  .tournaments-table th {
    background: var(--bg-tertiary);
    padding: 8px 12px;
    font-size: 0.85em;
  }

  .tournaments-table td {
    padding: 8px 12px;
    border-bottom: 1px solid var(--border);
  }

  .tournaments-table tr:last-child td {
    border-bottom: none;
  }

  .tournaments-table tr.gold td:first-child {
    border-left: 3px solid var(--gold, #ffd700);
  }

  .tournaments-table tr.silver td:first-child {
    border-left: 3px solid var(--silver, #c0c0c0);
  }

  .tournaments-table tr.bronze td:first-child {
    border-left: 3px solid var(--bronze, #cd7f32);
  }

  .tournaments-table tr.top-cut {
    background: rgba(76, 175, 80, 0.1);
  }

  .no-tournaments {
    padding: 1rem;
    text-align: center;
    color: var(--text-muted);
  }

  .loading-tournaments {
    padding: 1rem;
    text-align: center;
    color: var(--text-muted);
    font-style: italic;
  }
</style>
