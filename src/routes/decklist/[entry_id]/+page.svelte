<script lang="ts">
  let { data } = $props();

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
  }

  function getCardName(line: string): string {
    // Remove quantity prefix like "1 " or "1x "
    return line.replace(/^\d+x?\s+/, '');
  }

  function getScryfallUrl(cardName: string): string {
    return `https://scryfall.com/search?q=!"${encodeURIComponent(cardName)}"`;
  }
</script>

<div class="decklist-page">
  <div class="header">
    <h1>Decklist</h1>
    <div class="meta">
      <a href="/players/{data.player.player_id}">{data.player.player_name}</a>
      <span class="separator">|</span>
      <a href="/tournaments/{data.tournament.tid}">{data.tournament.tournament_name}</a>
      <span class="separator">|</span>
      <span>{formatDate(data.tournament.start_date)}</span>
    </div>
    <div class="result">
      Standing: <strong>#{data.entry.standing}</strong>
      <span class="separator">|</span>
      Record: <strong>{data.entry.wins}-{data.entry.losses}-{data.entry.draws}</strong>
    </div>
  </div>

  <div class="sections">
    {#each data.sections as section}
      <div class="section">
        <h2>{section.name}</h2>
        <ul>
          {#each section.cards as card}
            <li>
              <a href={getScryfallUrl(getCardName(card))} target="_blank" rel="noopener">
                {card}
              </a>
            </li>
          {/each}
        </ul>
      </div>
    {/each}
  </div>

  <div class="back-link">
    <a href="/tournaments/{data.tournament.tid}">← Back to tournament</a>
  </div>
</div>

<style>
  .decklist-page {
    max-width: 800px;
    margin: 0 auto;
    padding: 1rem;
  }

  .header {
    margin-bottom: 2rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid var(--border);
  }

  .header h1 {
    margin-bottom: 0.5rem;
  }

  .meta {
    color: var(--text-secondary);
    margin-bottom: 0.5rem;
  }

  .meta a {
    color: var(--accent);
  }

  .separator {
    margin: 0 0.5rem;
    color: var(--text-muted);
  }

  .result {
    color: var(--text-secondary);
  }

  .sections {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 1.5rem;
  }

  .section {
    background: var(--bg-card);
    border-radius: 8px;
    padding: 1rem;
  }

  .section h2 {
    font-size: 1rem;
    color: var(--accent);
    margin-bottom: 0.75rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--border);
  }

  .section ul {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .section li {
    padding: 0.25rem 0;
    font-size: 0.9rem;
  }

  .section a {
    color: var(--text-primary);
    text-decoration: none;
  }

  .section a:hover {
    color: var(--accent);
  }

  .back-link {
    margin-top: 2rem;
    padding-top: 1rem;
    border-top: 1px solid var(--border);
  }

  .back-link a {
    color: var(--accent);
  }
</style>
