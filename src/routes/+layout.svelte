<script lang="ts">
  import '../app.css';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';

  let { children, data } = $props();

  function formatDataDate(dateStr: string | null): string {
    if (!dateStr) return 'Unknown';
    const date = new Date(dateStr);
    const day = date.getDate();
    const month = date.toLocaleDateString('en-US', { month: 'short' });
    return `${day} ${month}`;
  }

  const navLinks = [
    { href: '/', label: 'Meta' },
    { href: '/leaderboard', label: 'Leaderboard' }
  ];

  // Ranked vs All data toggle
  let rankedOnly = $derived($page.url.searchParams.get('ranked') !== 'false');

  function toggleRanked() {
    const params = new URLSearchParams($page.url.searchParams);
    if (rankedOnly) {
      params.set('ranked', 'false');
    } else {
      params.delete('ranked');
    }
    goto(`${$page.url.pathname}?${params.toString()}`, { replaceState: true });
  }
</script>

<svelte:head>
  <title>tEDH Stats - Competitive EDH Tournament Analytics</title>
  <meta name="description" content="Comprehensive cEDH tournament statistics with ELO ratings, commander performance, and player analytics." />
</svelte:head>

<nav class="nav">
  <div class="nav-container">
    <div class="nav-brand">
      <div class="brand-top">
        <a href="/" class="nav-logo">
          <span class="t-accent">t</span>EDH Stats
        </a>
        <button class="data-toggle" onclick={toggleRanked} title={rankedOnly ? 'Showing ranked players only (10+ games)' : 'Showing all players'}>
          data:{rankedOnly ? 'ranked' : 'all'}
        </button>
      </div>
      <div class="brand-bottom">
        <span class="beta-tag">BETA</span>
        <span class="data-timestamp" title="Most recent tournament data">
          ↻ {formatDataDate(data.dataUpdated)}
        </span>
      </div>
    </div>

    <div class="nav-links">
      {#each navLinks as link}
        <a
          href={link.href}
          class="nav-link"
          class:active={$page.url.pathname === link.href}
        >
          {link.label}
        </a>
      {/each}
    </div>
  </div>
</nav>

<main class="main">
  {@render children()}
</main>
