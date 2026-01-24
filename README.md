# tEDH Stats

Competitive EDH (cEDH) tournament analytics platform. Track commander performance, player rankings, and tournament statistics.

**Live site:** [tedhstats.com](https://www.tedhstats.com)

## Features

### Meta Page (`/`)
- Commander statistics with win rates, conversion rates, top 4s, and championships
- **Filters:** Period (30d, 3m, 6m, 1y, Post-RC, All Time), Event Size (16+, 30+, 50+, 100+, 250+)
- **Color Mode Toggle:** Filter by exact color identity (=), includes (+), or excludes (-)
- **Top Player Filter:** Include/exclude top X players by ELO or other stats
- **Delta/Gains:** Compare current stats to previous period
- **Medals:** Visual indicators for top performers in conversion, top 4, and championship rates
- **Data Toggle:** Switch between "all" data and "ranked" data (tournaments with pod-level match data)

### Leaderboard (`/leaderboard`)
- Player rankings sorted by OpenSkill ELO
- Stats: entries, win rate, 5wiss score, conversions, top 4s, championships
- Player tiers: Proven (50+ games), Rising (30+ games), Provisional
- Search and filter by period, event size, min entries

### Commander Page (`/commanders/[name]`)
- Detailed stats for a specific commander pair
- Weekly trend chart (last 6 months)
- Pilot leaderboard with expandable tournament history
- Commander search to quickly navigate between commanders

### Player Page (`/players/[id]`)
- Individual player statistics and tournament history
- Commander breakdown
- Recent tournament results

### Tournament Page (`/tournaments/[id]`)
- Full standings with commander and decklist links
- Pairings/match data (expandable rows)
- Seat win rates for Swiss rounds
- Week navigation (prev/next tournament, first of prev/next week)
- Stats vs bracket average

### Tournaments List (`/tournaments`)
- Browse all tournaments with search and size filter

## Tech Stack

- **Frontend:** SvelteKit 5 with Svelte runes (`$state`, `$derived`, `$effect`)
- **Database:** Supabase (PostgreSQL)
- **Styling:** CSS custom properties with dark theme
- **Data Pipeline:** Python scripts for data refresh, ELO calculation, and precalculation

## Data Sources

- **TopDeck.gg API:** Primary source for tournament data
- **EDHTop16:** Additional tournament data (standings only, no pod data)
- Tournaments are classified as:
  - **Ranked:** Has pod-level match data (who played who) - used for ELO calculations
  - **Unranked:** Has standings only - contributes to meta stats but not ELO

## Development

```sh
# Install dependencies
npm install

# Start dev server
npm run dev

# Type check
npm run check

# Build for production
npm run build
```

## Related Repository

Data pipeline and precalculation scripts: [tedh-stats](https://github.com/mmelton09/tedh-stats)

## Key Precalculated Tables

| Table | Description |
|-------|-------------|
| `commander_stats` | Commander meta stats by period/size/data_type |
| `leaderboard_stats` | Player rankings by period/size |
| `commander_pilots` | Per-commander pilot stats |

## Recent Changes

- **Data Type Toggle:** Switch between all tournaments and ranked-only (pod data) tournaments
- **Commander Search:** Search and navigate between commanders from the commander page
- **Week Navigation:** Double-arrow buttons to jump to first tournament of prev/next week
- **Delta Columns:** Track stat changes between periods
- **Medals System:** Visual indicators based on vs-expected performance
