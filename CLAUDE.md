# tEDH Stats - Project Context for Claude

## Overview
SvelteKit app for Tournament EDH (Magic: The Gathering) statistics. Migrated from Flask. Uses Supabase for data.

## Tech Stack
- SvelteKit with Svelte 5 (uses runes: `$state`, `$derived`, `$effect`)
- Supabase (PostgreSQL)
- TypeScript

## Critical: Supabase Query Patterns

### Empty .in() Calls
NEVER call `.in('column', [])` with an empty array — it hangs indefinitely in Supabase/PostgREST and causes 504 timeouts on Vercel. Always guard:
```typescript
if (ids.length > 0) {
  const { data } = await supabase.from('table').select('*').in('id', ids);
}
```

### Timeout Protection
Server load functions should not hang if Supabase is unreachable (maintenance, outages). Use timeout wrappers for critical queries and throw SvelteKit errors so the error page renders instead of a raw Vercel 504:
```typescript
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))
  ]);
}
```

### Error Page
`+error.svelte` handles errors within the site layout (nav stays visible). Database outages (502/503/504) show a "Repointing the Foundation" message. Always prefer throwing a SvelteKit `error()` over letting a function timeout silently.

### Row Limits
- Default Supabase limit is 1000 rows - ALWAYS add `.limit(10000)` or `.limit(100000)` for large queries
- Also check Supabase dashboard "Max Rows" setting

### Batching for .in() Queries
When using `.in()` with many IDs (100+), queries fail silently. ALWAYS batch:
```typescript
const BATCH_SIZE = 100;
let results: any[] = [];
for (let i = 0; i < ids.length; i += BATCH_SIZE) {
  const batch = ids.slice(i, i + BATCH_SIZE);
  const { data } = await supabase.from('table').select('*').in('id', batch).limit(100000);
  if (data) results = results.concat(data);
}
```

### Nested Relations Type Casting
Supabase infers nested relations as arrays. Cast through `unknown`:
```typescript
const playerData = entry?.players as unknown as { player_name: string } | null;
```

## Key Pages

### Meta Page (`/routes/+page.svelte`, `+page.server.ts`)
- Commander statistics with filters
- **Filters (single row):** Period, Event Size (default 50+), Color Mode (4-mode toggle: All/=/+/-)
- **Top Player Filter:** 3-part system - toggle (off/include/exclude), threshold dropdown, stat dropdown
- **Lock toggle:** Preserves sort order when changing periods
- **Sort Gains toggle:** Sorts by delta OF current sort column
- **Medals:** Use emojis (not text)

### Leaderboard (`/routes/leaderboard/`)
- Player rankings — loads ALL players at once, client-side search/sort/pagination
- Default: 16+ player events
- **Qualification message:** "Qualification: 10+ ranked games in 30+ player tournaments"
- Event size dropdown: 16+, 30+, 50+, 100+, 250+
- ELO Methodology modal (click link at bottom of page)

### Player Page (`/routes/players/[name]/`)
- Individual player stats
- Event size dropdown: 16+ (All), 30+, 50+, 100+, 250+

### Commander Page (`/routes/commanders/[name]/`)
- Individual commander stats
- Uses `/api/commander-tournaments` for recent tournament data

## Event Size Standards
- Default on all pages: **50+**
- Dropdown options: 16+ (labeled "All"), 30+, 50+, 100+, 250+
- NO 32+ option (use 30+ instead)

## UI Conventions
- BETA tag in header (global nav)
- Medals as emojis: first 3 positions use direct emoji output
- Single-row filter layout on meta page
- Color mode: 4-mode toggle button (not dropdown)

## Date Periods
- `post_ban`: September 23, 2024 ("Post-RC Era")
- Standard periods: 1m, 3m, 6m, 1y, all
- Custom date range support

## Related Project: tedh-stats
The data pipeline lives in `/Users/MM/projects/tedh-stats/` - see its CLAUDE.md for:
- GitHub Actions daily refresh workflow
- Supabase connection pooler setup (IPv4 vs IPv6 issues)
- TopDeck.gg API integration
- ELO calculation scripts

## Supabase Connection Notes
Both projects use the same Supabase database. Key gotcha:
- **GitHub Actions** needs the **pooler URL** (`pooler.supabase.com`) not direct (`db.xxx.supabase.co`)
- Direct connection uses IPv6 which GitHub Actions can't reach
- Get pooler URL: Supabase dashboard → **Connect** button → **Session** mode

## CRITICAL: Check Original Flask Code First

**When implementing or fixing features that existed on the old site:**
1. ALWAYS read `/Users/MM/projects/tedh-stats/weekly_meta.py` FIRST
2. Find the original implementation before writing new code
3. The Flask app has working implementations for: tournament pages, player pages, commander pages, leaderboard, decklist links, pairings, etc.
4. Copy the logic, don't reinvent it

Key patterns from original site:
- **Decklist links**: If decklist starts with 'http' use it, otherwise `https://topdeck.gg/deck/{tid}/{player_id}`
- **Player matches**: Organized by player_id, keyed by round_number
- **Color identity**: Uses mana-font CDN icons

## When Adding Features: Don't Break Existing Functionality

**Before modifying working code:**
1. Note the last working commit hash
2. Understand ALL the code involved (HTML, CSS, JS) - not just the part you're changing
3. When renaming classes or restructuring, copy ALL related CSS rules

**When something breaks:**
1. FIRST step: `git show <last-working-commit>:path/to/file` to see exactly what worked
2. Compare the working version to current - don't guess at fixes
3. The answer is in the diff, not in trying random changes

**Common pitfalls:**
- Changing `div` to `button` breaks nested interactive elements (anchors, buttons)
- Renaming CSS classes without copying all associated rules (especially `:has()`, `:hover`, etc.)
- Changing element structure without updating all selectors

## Common Issues & Solutions

1. **0 data showing**: Check batching on `.in()` queries
2. **Colors all colorless**: Fetch ALL commanders, don't use `.in()` with too many names
3. **API errors**: Check if endpoint needs batching (see `/api/commander-tournaments`)
4. **TypeScript errors on Supabase relations**: Cast through `unknown`
5. **Data refresh failing**: Check tedh-stats workflow - likely IPv6/pooler issue
6. **Site 504/502/503**: Likely Supabase outage or maintenance. Check status.supabase.com and project dashboard. The `+error.svelte` page will show a friendly message if server loads throw properly.
7. **Empty .in() hanging**: Never pass empty array to `.in()` — guard with `if (ids.length > 0)`
