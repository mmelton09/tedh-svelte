# tEDH Stats - Project Notes

This document captures design decisions and feature specifications for the tEDH Stats SvelteKit application.

## Meta Page (`/`)

### Filters

1. **Entries Filter** - Dropdown to filter commanders by minimum number of tournament entries (1+, 2+, 5+, 10+, 20+, 50+)

2. **Conversions Filter** - Dropdown to filter by minimum conversions (0+, 1+, 2+, 3+, 5+, 10+)

3. **Color Filter** - Six mana symbol checkboxes (WUBRGC) with a 4-mode toggle:
   - `=` (exactly): Match exact color identity
   - `+` (including): Must include selected colors
   - `⊆` (within): Colors must be within selected colors
   - `≠` (excluding): Exclude selected colors

4. **Top Player Filter** - Three-part filter for player skill level:
   - **Mode Toggle** (circular button):
     - `⊘` (grey) = Off
     - `✓` (green) = Include only these players
     - `✗` (red) = Exclude these players
   - **Threshold Dropdown**: Top, 1%, 2%, 5%, 10%, 20%, # (custom number)
   - **Stat Dropdown**: ELO, Win%, Conv%, T4%, Trophy%, Conv±, T4±, Trophy±

### Display Toggles (Pill Buttons)

- **±Exp** - Show "vs Expected" values (performance vs random chance)
- **Δ** - Show delta/change from previous period
- **🏅** - Show medals (🥇🥈🥉) for top 3 commanders
- **New** - Filter to only show new commanders (not in previous period)
- **Gains** - Sort by delta values instead of absolute values

### Period Selection

- Quick periods: Last Week
- Calendar months: Current month, Previous 2 months
- Rolling periods: 30d, 3mo, 6mo, 1yr
- Era periods: Post-RC (Sept 23, 2024), All History
- Custom date range with navigation arrows (<<, >>)
- **Lock** checkbox: Preserve sort order when changing periods

### Table Columns

- Rank (#)
- Commander name (linked to commander page)
- Colors (mana symbols)
- Entries (with optional delta and NEW badge)
- Meta % (percentage of total entries)
- Win % (pod win rate)
- 5wiss (Swiss score: Win% × 5 + Draw% × 1)
- Conv (conversion count)
- Conv % or Conv± (rate or vs expected)
- Top4 (count)
- Top4 % or Top4± (rate or vs expected)
- 🏆 (championship count)
- 🏆 % or 🏆± (rate or vs expected)

### Accordion Rows

Click any row to expand and see recent tournament results with that commander.

---

## Leaderboard Page (`/leaderboard`)

### Filters

- Period selection (same as meta page)
- Event size minimum
- Min entries filter
- Ranked only toggle (players with 10+ games)
- Search by player name

### Table Columns

- Rank
- Player name
- ELO
- Entries
- Win %
- Conv %
- Top4 %
- Championships
- Main commander

---

## Commander Page (`/commanders/[pair]`)

Shows detailed stats for a specific commander pair.

---

## Player Page (`/players/[name]`)

Shows detailed stats for a specific player.

---

## Tournament Page (`/tournaments/[id]`)

Shows standings and results for a specific tournament.

---

## Technical Notes

### Supabase Queries

- Use `.limit(10000)` or `.limit(100000)` to override default 1000 row limit
- Use batching for `.in()` queries with many IDs (batch size: 100)
- The Supabase dashboard "Max Rows" setting also affects results

### Delta Calculations

- Previous period = same duration, shifted back in time
- Delta values show change from previous period to current
- "New" commanders appear in current period but not previous

### Color Identity

- Fetch all commanders to avoid `.in()` clause limits for color lookup
- Color order: WUBRG, with C for colorless
