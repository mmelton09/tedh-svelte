<script lang="ts">
  import '../app.css';
  import { page, navigating } from '$app/stores';
  import { goto } from '$app/navigation';

  let { children, data } = $props();

  // Show loading indicator when navigating (includes filter changes)
  let isLoading = $derived(!!$navigating);

  function formatDataDate(dateStr: string | null): string {
    if (!dateStr) return 'Unknown';
    const date = new Date(dateStr);
    const day = date.getDate();
    const month = date.toLocaleDateString('en-US', { month: 'short' });
    return `${day} ${month}`;
  }

  const navLinks = [
    { href: '/', label: 'Meta' },
    { href: '/leaderboard', label: 'Leaderboard' },
    { href: '/?preset=commanders&period=1m', label: 'Commanders', preset: 'commanders' },
    { href: '/players', label: 'Players' },
    { href: '/tournaments', label: 'Tournaments' }
  ];

  // Ranked vs All data toggle (default: all)
  let rankedOnly = $derived($page.url.searchParams.get('ranked') === 'true');

  function toggleRanked() {
    const params = new URLSearchParams($page.url.searchParams);
    if (rankedOnly) {
      params.delete('ranked');
    } else {
      params.set('ranked', 'true');
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
    <div class="nav-left">
      <a href="/" class="nav-logo">
        <span class="t-accent">t</span>EDH Stats
        <span class="beta-ribbon">BETA</span>
      </a>
      <button class="data-toggle" onclick={toggleRanked} title={rankedOnly ? 'Showing ranked players only (10+ games)' : 'Showing all players'}>
        data:{rankedOnly ? 'ranked' : 'all'}
      </button>
      <span class="data-timestamp" title="Most recent tournament data">
        ↻ {formatDataDate(data.dataUpdated)}
      </span>
    </div>

    <div class="nav-links">
      {#each navLinks as link}
        <a
          href={link.href}
          class="nav-link"
          class:active={link.preset
            ? $page.url.searchParams.get('preset') === link.preset
            : link.href === '/'
              ? $page.url.pathname === '/' && !$page.url.searchParams.has('preset')
              : $page.url.pathname.startsWith(link.href)}
        >
          {link.label}
        </a>
      {/each}
    </div>

    <div class="nav-right">
      <!-- Future: account dropdown -->
    </div>
  </div>
</nav>

{#if isLoading}
  <div class="loading-bar"></div>
{/if}

<main class="main">
  {@render children()}
</main>

<style>
  .loading-bar {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 3px;
    background: linear-gradient(90deg, var(--accent) 0%, var(--accent) 30%, transparent 30%);
    background-size: 200% 100%;
    animation: loading 1s ease-in-out infinite;
    z-index: 9999;
  }

  @keyframes loading {
    0% {
      background-position: 200% 0;
    }
    100% {
      background-position: -200% 0;
    }
  }
</style>
