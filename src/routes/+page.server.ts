import { supabase } from '$lib/supabase';
import type { PageServerLoad } from './$types';

// Helper: aggregate entries into commander stats
async function aggregateCommanderStats(
  entries: any[],
  tournamentMap: Record<string, { top_cut: number; total_players: number }>
) {
  const commanderStats: Record<string, any> = {};

  for (const entry of entries) {
    const commanders = (entry.deck_commanders as any[]) || [];
    const commanderPair = commanders
      .map((c: any) => c.commander_name)
      .sort()
      .join(' / ');

    if (!commanderPair) continue;

    if (!commanderStats[commanderPair]) {
      commanderStats[commanderPair] = {
        commander_pair: commanderPair,
        entries: 0,
        unique_pilots: new Set(),
        total_wins: 0,
        total_losses: 0,
        total_draws: 0,
        conversions: 0,
        top4s: 0,
        championships: 0,
        // Expected values (per-tournament accumulation)
        expected_conv: 0,
        expected_top4: 0,
        expected_champ: 0
      };
    }

    const stats = commanderStats[commanderPair];
    stats.entries++;
    stats.unique_pilots.add(entry.player_id);
    stats.total_wins += entry.wins || 0;
    stats.total_losses += entry.losses || 0;
    stats.total_draws += entry.draws || 0;

    const tournament = tournamentMap[entry.tid];
    const totalPlayers = tournament?.total_players || 1;

    // Accumulate expected values based on tournament size
    if (tournament?.top_cut && tournament.top_cut > 0) {
      stats.expected_conv += tournament.top_cut / totalPlayers;
      if (tournament.top_cut >= 4) {
        stats.expected_top4 += 4.0 / totalPlayers;
      }
    }
    stats.expected_champ += 1.0 / totalPlayers;

    // Track actuals
    if (tournament?.top_cut && entry.standing <= tournament.top_cut) {
      stats.conversions++;
    }
    if (entry.standing <= 4 && tournament?.top_cut && tournament.top_cut >= 4) {
      stats.top4s++;
    }
    if (entry.standing === 1) {
      stats.championships++;
    }
  }

  // Get color identities - fetch all commanders to avoid IN clause limits
  const { data: commanderColors } = await supabase
    .from('commanders')
    .select('commander_name, color_identity')
    .limit(10000);

  const colorMap: Record<string, string> = {};
  for (const c of commanderColors || []) {
    colorMap[c.commander_name] = c.color_identity || '';
  }

  // Calculate rates and add colors
  return Object.values(commanderStats).map((stats: any) => {
    const totalGames = stats.total_wins + stats.total_losses + stats.total_draws;
    const cmdNames = stats.commander_pair.split(' / ');
    const allColors = new Set<string>();
    for (const name of cmdNames) {
      for (const c of colorMap[name] || '') {
        if ('WUBRG'.includes(c)) allColors.add(c);
      }
    }
    const colorOrder = ['W', 'U', 'B', 'R', 'G'];
    const colorIdentity = colorOrder.filter(c => allColors.has(c)).join('') || 'C';

    // Calculate vs expected: ((actual - expected) / entries) * 100
    const convVsExpected = stats.entries > 0
      ? ((stats.conversions - stats.expected_conv) / stats.entries) * 100
      : 0;
    const top4VsExpected = stats.entries > 0
      ? ((stats.top4s - stats.expected_top4) / stats.entries) * 100
      : 0;
    const champVsExpected = stats.entries > 0
      ? ((stats.championships - stats.expected_champ) / stats.entries) * 100
      : 0;

    return {
      ...stats,
      unique_pilots: stats.unique_pilots.size,
      color_identity: colorIdentity,
      win_rate: totalGames > 0 ? stats.total_wins / totalGames : 0,
      conversion_rate: stats.entries > 0 ? stats.conversions / stats.entries : 0,
      top4_rate: stats.entries > 0 ? stats.top4s / stats.entries : 0,
      champ_rate: stats.entries > 0 ? stats.championships / stats.entries : 0,
      // Vs expected values (percentage points above/below random chance)
      conv_vs_expected: convVsExpected,
      top4_vs_expected: top4VsExpected,
      champ_vs_expected: champVsExpected
    };
  }).sort((a, b) => b.entries - a.entries);
}

// Helper: calculate previous period date range (same duration, shifted back)
function getPreviousPeriodRange(start: string, end: string): { start: string; end: string } {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const duration = endDate.getTime() - startDate.getTime();

  const prevEnd = new Date(startDate.getTime() - 1); // Day before current start
  const prevStart = new Date(prevEnd.getTime() - duration);

  return {
    start: prevStart.toISOString().split('T')[0],
    end: prevEnd.toISOString().split('T')[0]
  };
}

// Helper: get qualifying player IDs based on top filter
async function getTopPlayerIds(
  topMode: string,
  topValue: string,
  topCustom: number,
  topStat: string
): Promise<Set<string> | null> {
  if (topMode === 'off') return null;

  // Determine count limit
  let limit: number;
  if (topValue === 'top') {
    limit = 1;
  } else if (topValue === 'custom') {
    limit = topCustom;
  } else {
    // Percentage - we need total count first
    const { count } = await supabase
      .from('players')
      .select('*', { count: 'exact', head: true })
      .gte('openskill_games', 10);

    const totalPlayers = count || 1000;
    const pct = parseInt(topValue);
    limit = Math.ceil(totalPlayers * (pct / 100));
  }

  // Map stat names to database columns
  const statToColumn: Record<string, string> = {
    'elo': 'openskill_elo',
    'win_rate': 'win_rate',
    'conv_rate': 'conversion_rate',
    'top4_rate': 'top4_rate',
    'champ_rate': 'champ_rate',
    'conv_exp': 'conv_vs_expected',
    'top4_exp': 'top4_vs_expected',
    'champ_exp': 'champ_vs_expected'
  };

  const column = statToColumn[topStat] || 'openskill_elo';

  // Fetch top players by the selected stat
  const { data: topPlayers } = await supabase
    .from('players')
    .select('player_id')
    .gte('openskill_games', 10)
    .order(column, { ascending: false })
    .limit(limit);

  if (!topPlayers) return new Set();
  return new Set(topPlayers.map(p => p.player_id));
}

// Helper: calculate date range for period (matches Flask get_time_range)
function getDateRange(period: string, customStart?: string, customEnd?: string): { start: string; end: string; label: string } | null {
  const now = new Date();
  const end = now.toISOString().split('T')[0];

  if (period === 'custom' && customStart && customEnd) {
    return { start: customStart, end: customEnd, label: 'Custom Range' };
  }

  let start: Date;
  let label: string;
  switch (period) {
    case 'last_week': {
      // Get last complete week (Mon-Sun)
      const dayOfWeek = now.getDay();
      const daysToLastMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const thisMonday = new Date(now);
      thisMonday.setDate(now.getDate() - daysToLastMonday);
      thisMonday.setHours(0, 0, 0, 0);
      const lastMonday = new Date(thisMonday);
      lastMonday.setDate(thisMonday.getDate() - 7);
      const lastSunday = new Date(thisMonday);
      lastSunday.setDate(thisMonday.getDate() - 1);
      return {
        start: lastMonday.toISOString().split('T')[0],
        end: lastSunday.toISOString().split('T')[0],
        label: 'Last Week'
      };
    }
    case 'current_month':
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      label = start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      break;
    case 'prev_month': {
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const endPrev = new Date(now.getFullYear(), now.getMonth(), 0);
      label = start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      return { start: start.toISOString().split('T')[0], end: endPrev.toISOString().split('T')[0], label };
    }
    case 'prev_month_2': {
      start = new Date(now.getFullYear(), now.getMonth() - 2, 1);
      const endPrev2 = new Date(now.getFullYear(), now.getMonth() - 1, 0);
      label = start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      return { start: start.toISOString().split('T')[0], end: endPrev2.toISOString().split('T')[0], label };
    }
    case '1m':
      start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      label = 'Last 30 Days';
      break;
    case '3m':
      start = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      label = 'Last 3 Months';
      break;
    case '6m':
      start = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
      label = 'Last 6 Months';
      break;
    case '1y':
      start = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      label = 'Last Year';
      break;
    case 'post_ban':
      return { start: '2024-09-23', end, label: 'Post-RC Era' };
    case 'all':
      return { start: '2020-01-01', end, label: 'All Time' };
    default:
      // Default to 1 year
      start = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      label = 'Last Year';
  }

  return { start: start.toISOString().split('T')[0], end, label };
}

export const load: PageServerLoad = async ({ url }) => {
  const period = url.searchParams.get('period') || '1y';
  const minSize = parseInt(url.searchParams.get('min_size') || '50') || 50;
  const tid = url.searchParams.get('tid');
  const customStart = url.searchParams.get('start') || undefined;
  const customEnd = url.searchParams.get('end') || undefined;

  // Top player filter params
  const topMode = url.searchParams.get('top_mode') || 'off'; // 'off', 'include', 'exclude'
  const topValue = url.searchParams.get('top_value') || 'top'; // 'top', '1', '2', '5', '10', '20', 'custom'
  const topCustom = parseInt(url.searchParams.get('top_custom') || '100') || 100;
  const topStat = url.searchParams.get('top_stat') || 'elo';

  // Get date range first (needed for tournament list)
  const dateRange = getDateRange(period, customStart, customEnd);

  // Fetch top tournaments by size for the featured bar (filtered by date range)
  let tournamentsQuery = supabase
    .from('tournaments')
    .select('tid, tournament_name, total_players, start_date')
    .gte('total_players', minSize)
    .eq('is_league', false)
    .order('total_players', { ascending: false })
    .limit(50);

  if (dateRange) {
    tournamentsQuery = tournamentsQuery
      .gte('start_date', dateRange.start)
      .lte('start_date', dateRange.end);
  }

  const { data: recentTournaments } = await tournamentsQuery;

  // If a specific tournament is selected, compute stats for that tournament
  if (tid) {
    const { data: tournament } = await supabase
      .from('tournaments')
      .select('tid, tournament_name, total_players, start_date, top_cut')
      .eq('tid', tid)
      .single();

    if (!tournament) {
      return {
        commanders: [],
        period,
        minSize,
        totalEntries: 0,
        recentTournaments: recentTournaments || [],
        tournamentCount: 0,
        selectedTournament: null
      };
    }

    const { data: entries } = await supabase
      .from('tournament_entries')
      .select(`
        entry_id,
        tid,
        player_id,
        wins,
        losses,
        draws,
        standing,
        deck_commanders (commander_name)
      `)
      .eq('tid', tid)
      .limit(10000);

    const commanders = await aggregateCommanderStats(entries || [], { [tid]: tournament });
    const totalEntries = commanders.reduce((sum, c) => sum + c.entries, 0);

    return {
      commanders,
      totalEntries,
      period,
      minSize,
      recentTournaments: recentTournaments || [],
      tournamentCount: 1,
      selectedTournament: tournament,
      periodStart: tournament.start_date,
      periodEnd: tournament.start_date
    };
  }

  // Use date range for filtering (already calculated above)
  if (dateRange) {
    // Get tournaments in date range
    const { data: tournaments } = await supabase
      .from('tournaments')
      .select('tid, top_cut, total_players, start_date')
      .gte('start_date', dateRange.start)
      .lte('start_date', dateRange.end)
      .gte('total_players', minSize)
      .eq('is_league', false)
      .limit(10000);

    if (!tournaments || tournaments.length === 0) {
      return {
        commanders: [],
        totalEntries: 0,
        period,
        minSize,
        recentTournaments: recentTournaments || [],
        tournamentCount: 0,
        selectedTournament: null,
        periodStart: dateRange.start,
        periodEnd: dateRange.end,
        periodLabel: dateRange.label
      };
    }

    const tournamentIds = tournaments.map(t => t.tid);
    const tournamentMap: Record<string, { top_cut: number; total_players: number }> = {};
    for (const t of tournaments) {
      tournamentMap[t.tid] = { top_cut: t.top_cut, total_players: t.total_players };
    }

    // Get all entries for these tournaments (batch to avoid .in() limits)
    const BATCH_SIZE = 100;
    let entries: any[] = [];
    for (let i = 0; i < tournamentIds.length; i += BATCH_SIZE) {
      const batch = tournamentIds.slice(i, i + BATCH_SIZE);
      const { data: batchEntries } = await supabase
        .from('tournament_entries')
        .select(`
          entry_id,
          tid,
          player_id,
          wins,
          losses,
          draws,
          standing,
          deck_commanders (commander_name)
        `)
        .in('tid', batch)
        .limit(100000);
      if (batchEntries) {
        entries = entries.concat(batchEntries);
      }
    }

    // Apply top player filter if active
    const topPlayerIds = await getTopPlayerIds(topMode, topValue, topCustom, topStat);
    if (topPlayerIds !== null) {
      if (topMode === 'include') {
        entries = entries.filter(e => topPlayerIds.has(e.player_id));
      } else if (topMode === 'exclude') {
        entries = entries.filter(e => !topPlayerIds.has(e.player_id));
      }
    }

    const commanders = await aggregateCommanderStats(entries || [], tournamentMap);

    // Fetch previous period data for delta calculation (skip for 'all' period)
    let prevCommanderMap: Record<string, any> = {};
    if (period !== 'all') {
      const prevRange = getPreviousPeriodRange(dateRange.start, dateRange.end);

      const { data: prevTournaments } = await supabase
        .from('tournaments')
        .select('tid, top_cut, total_players, start_date')
        .gte('start_date', prevRange.start)
        .lte('start_date', prevRange.end)
        .gte('total_players', minSize)
        .eq('is_league', false)
        .limit(10000);

      if (prevTournaments && prevTournaments.length > 0) {
        const prevTournamentIds = prevTournaments.map(t => t.tid);
        const prevTournamentMap: Record<string, { top_cut: number; total_players: number }> = {};
        for (const t of prevTournaments) {
          prevTournamentMap[t.tid] = { top_cut: t.top_cut, total_players: t.total_players };
        }

        // Batch previous period entries query
        let prevEntries: any[] = [];
        for (let i = 0; i < prevTournamentIds.length; i += BATCH_SIZE) {
          const batch = prevTournamentIds.slice(i, i + BATCH_SIZE);
          const { data: batchEntries } = await supabase
            .from('tournament_entries')
            .select(`
              entry_id,
              tid,
              player_id,
              wins,
              losses,
              draws,
              standing,
              deck_commanders (commander_name)
            `)
            .in('tid', batch)
            .limit(100000);
          if (batchEntries) {
            prevEntries = prevEntries.concat(batchEntries);
          }
        }

        const prevCommanders = await aggregateCommanderStats(prevEntries, prevTournamentMap);
        for (const cmd of prevCommanders) {
          prevCommanderMap[cmd.commander_pair] = cmd;
        }
      }
    }

    // Calculate deltas and mark new commanders
    const commandersWithDelta = commanders.map(cmd => {
      const prev = prevCommanderMap[cmd.commander_pair];
      const isNew = !prev && period !== 'all';

      return {
        ...cmd,
        is_new: isNew,
        delta_entries: prev ? cmd.entries - prev.entries : null,
        delta_win_rate: prev ? cmd.win_rate - prev.win_rate : null,
        delta_conv_rate: prev ? cmd.conversion_rate - prev.conversion_rate : null,
        delta_top4_rate: prev ? cmd.top4_rate - prev.top4_rate : null,
        delta_champ_rate: prev ? cmd.champ_rate - prev.champ_rate : null
      };
    });

    const totalEntries = commandersWithDelta.reduce((sum, c) => sum + c.entries, 0);

    return {
      commanders: commandersWithDelta,
      totalEntries,
      period,
      minSize,
      recentTournaments: recentTournaments || [],
      tournamentCount: tournaments.length,
      selectedTournament: null,
      periodStart: dateRange.start,
      periodEnd: dateRange.end,
      periodLabel: dateRange.label,
      topMode,
      topValue,
      topCustom,
      topStat
    };
  }

  // This should never be reached since getDateRange always returns a value
  return {
    commanders: [],
    totalEntries: 0,
    period,
    minSize,
    recentTournaments: recentTournaments || [],
    tournamentCount: 0,
    selectedTournament: null
  };
};
