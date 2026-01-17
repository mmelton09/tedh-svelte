<script lang="ts">
  interface CommanderData {
    commander_pair: string;
    entries: number;
    win_rate: number | null;
  }

  let { data, totalEntries }: { data: CommanderData[]; totalEntries: number } = $props();

  // Take top 15 commanders for the chart
  let chartData = $derived(
    data.slice(0, 15).map(d => ({
      name: d.commander_pair.length > 30
        ? d.commander_pair.substring(0, 30) + '...'
        : d.commander_pair,
      fullName: d.commander_pair,
      metaShare: (d.entries / totalEntries) * 100,
      entries: d.entries,
      winRate: d.win_rate ? (d.win_rate * 100).toFixed(1) : '0.0'
    }))
  );
</script>

<div class="chart-container">
  <h3>Top 15 Commanders by Meta Share</h3>
  <div class="bar-chart">
    {#each chartData as cmd, i}
      {@const maxShare = chartData[0]?.metaShare || 1}
      {@const barWidth = (cmd.metaShare / maxShare) * 100}
      <div class="bar-row" title="{cmd.fullName}: {cmd.entries} entries ({cmd.metaShare.toFixed(1)}%)">
        <div class="rank">{i + 1}</div>
        <div class="bar-label">{cmd.name}</div>
        <div class="bar-track">
          <div
            class="bar-fill"
            style="width: {barWidth}%"
          >
            <span class="bar-value">{cmd.metaShare.toFixed(1)}%</span>
          </div>
        </div>
        <div class="win-rate" class:positive={parseFloat(cmd.winRate) > 25} class:negative={parseFloat(cmd.winRate) < 20}>
          {cmd.winRate}%
        </div>
      </div>
    {/each}
  </div>
</div>

<style>
  .chart-container {
    background: var(--bg-card);
    border-radius: 8px;
    padding: 1.25rem;
    margin-bottom: 1.5rem;
  }

  h3 {
    font-size: 1rem;
    font-weight: 600;
    margin-bottom: 1rem;
    color: var(--text-primary);
  }

  .bar-chart {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .bar-row {
    display: grid;
    grid-template-columns: 28px 180px 1fr 60px;
    align-items: center;
    gap: 0.75rem;
    font-size: 0.85rem;
  }

  .rank {
    color: var(--text-muted);
    text-align: right;
    font-weight: 500;
  }

  .bar-label {
    color: var(--text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .bar-track {
    background: var(--bg-tertiary);
    border-radius: 4px;
    height: 24px;
    overflow: hidden;
  }

  .bar-fill {
    height: 100%;
    background: linear-gradient(90deg, var(--accent), #66bb6a);
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    padding-right: 8px;
    min-width: 50px;
    transition: width 0.3s ease;
  }

  .bar-value {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--bg-primary);
  }

  .win-rate {
    text-align: right;
    font-weight: 500;
    color: var(--text-secondary);
  }

  .win-rate.positive {
    color: var(--positive);
  }

  .win-rate.negative {
    color: var(--negative);
  }

  @media (max-width: 768px) {
    .bar-row {
      grid-template-columns: 24px 120px 1fr 50px;
    }

    .bar-label {
      font-size: 0.75rem;
    }
  }
</style>
