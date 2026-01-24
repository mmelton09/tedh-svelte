import { supabase } from '$lib/supabase';
import type { PageServerLoad } from './$types';

// Active live tournaments - edit this list when events go live
const LIVE_TOURNAMENT_IDS = [
  'the-royal-rumble-the-second-showdown-cedh-12k',
  'breach-the-bay-cedh-10k'
];

// Map URL periods to precalc periods
const PRECALC_PERIODS: Record<string, string> = {
  'all': 'all',
  '1y': '1y',
  '6m': '6m',
  '3m': '3m',
  '1m': '1m',
  'post_ban': 'post_ban',
};

// Map periods to their comparison periods for delta calculation
// For month views: compare to previous month
// For rolling periods: compare to same length period ending at start of current
const COMPARISON_PERIODS: Record<string, string> = {
  'current_month': 'prev_month',
  'prev_month': 'prev_month_2',
  '1m': '1m_prev',      // Will calculate dynamically
  '3m': '3m_prev',
  '6m': '6m_prev',
  '1y': '1y_prev',
  // 'all' and 'post_ban' have no comparison
};

// Valid min sizes in precalc table
const VALID_MIN_SIZES = [16, 30, 50, 100, 250];

function getClosestMinSize(size: number): number {
  const valid = VALID_MIN_SIZES.filter(s => s <= size);
  return valid.length > 0 ? Math.max(...valid) : 16;
}

function getPeriodLabel(period: string): string {
  const now = new Date();
  const labels: Record<string, string> = {
    'all': 'All Time',
    '1y': 'Last Year',
    '6m': 'Last 6 Months',
    '3m': 'Last 3 Months',
    '1m': 'Last 30 Days',
    'post_ban': 'Post-RC Era',
    'last_week': 'Last Week',
    'current_month': now.toLocaleDateString('en-US', { month: 'long' }),
    'prev_month': new Date(now.getFullYear(), now.getMonth() - 1, 1).toLocaleDateString('en-US', { month: 'long' }),
    'prev_month_2': new Date(now.getFullYear(), now.getMonth() - 2, 1).toLocaleDateString('en-US', { month: 'long' }),
  };
  return labels[period] || period;
}

// Helper: calculate date range for period
function getDateRange(period: string): { start: string; end: string; label: string } {
  const now = new Date();
  const end = now.toISOString().split('T')[0];

  let start: Date;
  let label: string;
  switch (period) {
    case 'last_week': {
      start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      label = 'Last Week';
      break;
    }
    case 'current_month': {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      label = now.toLocaleDateString('en-US', { month: 'long' });
      break;
    }
    case 'prev_month': {
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const endOfPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0);
      const prevMonthLabel = start.toLocaleDateString('en-US', { month: 'long' });
      return { start: start.toISOString().split('T')[0], end: endOfPrevMonth.toISOString().split('T')[0], label: prevMonthLabel };
    }
    case 'prev_month_2': {
      start = new Date(now.getFullYear(), now.getMonth() - 2, 1);
      const endOfPrevMonth2 = new Date(now.getFullYear(), now.getMonth() - 1, 0);
      const prevMonth2Label = start.toLocaleDateString('en-US', { month: 'long' });
      return { start: start.toISOString().split('T')[0], end: endOfPrevMonth2.toISOString().split('T')[0], label: prevMonth2Label };
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
      start = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      label = 'Last Year';
  }

  return { start: start.toISOString().split('T')[0], end, label };
}

// Get comparison period date range for delta calculation
function getComparisonDateRange(period: string): { start: string; end: string } | null {
  const now = new Date();

  switch (period) {
    case 'current_month': {
      // Compare to previous month
      const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const prevEnd = new Date(now.getFullYear(), now.getMonth(), 0);
      return { start: prevStart.toISOString().split('T')[0], end: prevEnd.toISOString().split('T')[0] };
    }
    case 'prev_month': {
      // Compare to two months ago
      const prevStart = new Date(now.getFullYear(), now.getMonth() - 2, 1);
      const prevEnd = new Date(now.getFullYear(), now.getMonth() - 1, 0);
      return { start: prevStart.toISOString().split('T')[0], end: prevEnd.toISOString().split('T')[0] };
    }
    case 'prev_month_2': {
      // Compare to three months ago
      const prevStart = new Date(now.getFullYear(), now.getMonth() - 3, 1);
      const prevEnd = new Date(now.getFullYear(), now.getMonth() - 2, 0);
      return { start: prevStart.toISOString().split('T')[0], end: prevEnd.toISOString().split('T')[0] };
    }
    case 'last_week': {
      // Compare to the week before last
      const prevEnd = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const prevStart = new Date(prevEnd.getTime() - 7 * 24 * 60 * 60 * 1000);
      return { start: prevStart.toISOString().split('T')[0], end: prevEnd.toISOString().split('T')[0] };
    }
    case '1m': {
      // 30 days ending at current period start
      const currentStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const prevEnd = new Date(currentStart.getTime() - 1);
      const prevStart = new Date(prevEnd.getTime() - 30 * 24 * 60 * 60 * 1000);
      return { start: prevStart.toISOString().split('T')[0], end: prevEnd.toISOString().split('T')[0] };
    }
    case '3m': {
      const currentStart = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      const prevEnd = new Date(currentStart.getTime() - 1);
      const prevStart = new Date(prevEnd.getTime() - 90 * 24 * 60 * 60 * 1000);
      return { start: prevStart.toISOString().split('T')[0], end: prevEnd.toISOString().split('T')[0] };
    }
    case '6m': {
      const currentStart = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
      const prevEnd = new Date(currentStart.getTime() - 1);
      const prevStart = new Date(prevEnd.getTime() - 180 * 24 * 60 * 60 * 1000);
      return { start: prevStart.toISOString().split('T')[0], end: prevEnd.toISOString().split('T')[0] };
    }
    case '1y': {
      const currentStart = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      const prevEnd = new Date(currentStart.getTime() - 1);
      const prevStart = new Date(prevEnd.getTime() - 365 * 24 * 60 * 60 * 1000);
      return { start: prevStart.toISOString().split('T')[0], end: prevEnd.toISOString().split('T')[0] };
    }
    default:
      return null; // 'all', 'post_ban', 'custom' have no comparison
  }
}

export const load: PageServerLoad = async ({ url }) => {
  const period = url.searchParams.get('period') || '1y';
  const minSize = parseInt(url.searchParams.get('min_size') || '50') || 50;
  const tid = url.searchParams.get('tid');
  const rankedOnly = url.searchParams.get('ranked') === 'true';
  const dataType = rankedOnly ? 'ranked' : 'all';

  // Top player filter params (used for live calculation fallback)
  const topMode = url.searchParams.get('top_mode') || 'off';
  const topValue = url.searchParams.get('top_value') || 'top';
  const topCustom = parseInt(url.searchParams.get('top_custom') || '100') || 100;
  const topStat = url.searchParams.get('top_stat') || 'elo';

  const dateRange = getDateRange(period);
  const precalcPeriod = PRECALC_PERIODS[period];
  const precalcMinSize = getClosestMinSize(minSize);

  // Fetch top tournaments by size for the featured bar
  let recentTournamentsQuery = supabase
    .from('tournaments')
    .select('tid, tournament_name, total_players, start_date')
    .gte('total_players', minSize)
    .eq('is_league', false)
    .gte('start_date', dateRange.start)
    .lte('start_date', dateRange.end);

  if (rankedOnly) {
    recentTournamentsQuery = recentTournamentsQuery.eq('has_pod_data', true);
  }

  const { data: recentTournaments } = await recentTournamentsQuery
    .order('total_players', { ascending: false })
    .limit(50);

  // Fetch live tournaments separately (always, regardless of date/size filters)
  const { data: liveTournaments } = await supabase
    .from('tournaments')
    .select('tid, tournament_name, total_players, start_date')
    .in('tid', LIVE_TOURNAMENT_IDS);

  // If a specific tournament is selected, compute stats for that tournament (live)
  if (tid) {
    return await loadSingleTournament(tid, period, minSize, recentTournaments || [], liveTournaments || []);
  }

  // Use precalc table if available and no special filters
  if (precalcPeriod && topMode === 'off') {
    // Get tournament count for display
    let tournamentCountQuery = supabase
      .from('tournaments')
      .select('*', { count: 'exact', head: true })
      .gte('total_players', minSize)
      .eq('is_league', false)
      .gte('start_date', dateRange.start)
      .lte('start_date', dateRange.end);

    if (rankedOnly) {
      tournamentCountQuery = tournamentCountQuery.eq('has_pod_data', true);
    }

    const { count: tournamentCount } = await tournamentCountQuery;

    // Fetch from precalc table
    const { data: precalcCommanders, error } = await supabase
      .from('commander_stats')
      .select('*')
      .eq('period', precalcPeriod)
      .eq('min_size', precalcMinSize)
      .eq('data_type', dataType)
      .order('entries', { ascending: false })
      .limit(10000);

    if (error) {
      console.error('Error fetching from commander_stats:', error);
    }

    if (precalcCommanders && precalcCommanders.length > 0) {
      // Use precalculated deltas directly from the table
      const commanders = precalcCommanders.map((cmd: any) => ({
        commander_pair: cmd.commander_pair,
        color_identity: cmd.color_identity || 'C',
        entries: cmd.entries,
        unique_pilots: cmd.unique_pilots,
        total_wins: cmd.total_wins,
        total_losses: cmd.total_losses,
        total_draws: cmd.total_draws,
        win_rate: Number(cmd.win_rate) || 0,
        conversions: cmd.conversions,
        conversion_rate: Number(cmd.conversion_rate) || 0,
        top4s: cmd.top4s,
        top4_rate: Number(cmd.top4_rate) || 0,
        championships: cmd.championships,
        champ_rate: Number(cmd.champ_rate) || 0,
        conv_vs_expected: Number(cmd.conv_vs_expected) || 0,
        top4_vs_expected: Number(cmd.top4_vs_expected) || 0,
        champ_vs_expected: Number(cmd.champ_vs_expected) || 0,
        is_new: cmd.is_new || false,
        delta_entries: cmd.delta_entries,
        delta_win_rate: cmd.delta_win_rate != null ? Number(cmd.delta_win_rate) : null,
        delta_conv_rate: cmd.delta_conv_rate != null ? Number(cmd.delta_conv_rate) : null,
        delta_top4_rate: cmd.delta_top4_rate != null ? Number(cmd.delta_top4_rate) : null,
        delta_champ_rate: cmd.delta_champ_rate != null ? Number(cmd.delta_champ_rate) : null,
      }));

      const totalEntries = commanders.reduce((sum: number, c: any) => sum + c.entries, 0);

      return {
        commanders,
        totalEntries,
        period,
        minSize,
        recentTournaments: recentTournaments || [],
        liveTournaments: liveTournaments || [],
        tournamentCount: tournamentCount || 0,
        selectedTournament: null,
        periodStart: dateRange.start,
        periodEnd: dateRange.end,
        periodLabel: dateRange.label,
        topMode,
        topValue,
        topCustom,
        topStat,
        usingPrecalc: true,
      };
    }
  }

  // Fallback to live calculation (for top player filter or if precalc failed)
  return await loadLiveCalculation(
    period, minSize, dateRange, recentTournaments || [], liveTournaments || [],
    topMode, topValue, topCustom, topStat
  );
};

// Load stats for a single tournament
async function loadSingleTournament(
  tid: string,
  period: string,
  minSize: number,
  recentTournaments: any[],
  liveTournaments: any[]
) {
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
      recentTournaments,
      liveTournaments,
      tournamentCount: 0,
      selectedTournament: null,
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
    .or('wins.gt.0,losses.gt.0,draws.gt.0')
    .limit(10000);

  const commanders = await aggregateCommanderStats(entries || [], { [tid]: tournament });
  const totalEntries = commanders.reduce((sum, c) => sum + c.entries, 0);

  return {
    commanders,
    totalEntries,
    period,
    minSize,
    recentTournaments,
    liveTournaments,
    tournamentCount: 1,
    selectedTournament: tournament,
    periodStart: tournament.start_date,
    periodEnd: tournament.start_date,
  };
}

// Live calculation fallback (for top player filter or custom periods)
async function loadLiveCalculation(
  period: string,
  minSize: number,
  dateRange: { start: string; end: string; label: string },
  recentTournaments: any[],
  liveTournaments: any[],
  topMode: string,
  topValue: string,
  topCustom: number,
  topStat: string
) {
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
      recentTournaments,
      liveTournaments,
      tournamentCount: 0,
      selectedTournament: null,
      periodStart: dateRange.start,
      periodEnd: dateRange.end,
      periodLabel: dateRange.label,
    };
  }

  const tournamentIds = tournaments.map(t => t.tid);
  const tournamentMap: Record<string, { top_cut: number; total_players: number }> = {};
  for (const t of tournaments) {
    tournamentMap[t.tid] = { top_cut: t.top_cut, total_players: t.total_players };
  }

  // Get all entries (batch to avoid .in() limits)
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
      .or('wins.gt.0,losses.gt.0,draws.gt.0')
      .limit(100000);
    if (batchEntries) {
      entries = entries.concat(batchEntries);
    }
  }

  // Apply top player filter if active
  if (topMode !== 'off') {
    const topPlayerIds = await getTopPlayerIds(topMode, topValue, topCustom, topStat);
    if (topPlayerIds !== null) {
      if (topMode === 'include') {
        entries = entries.filter(e => topPlayerIds.has(e.player_id));
      } else if (topMode === 'exclude') {
        entries = entries.filter(e => !topPlayerIds.has(e.player_id));
      }
    }
  }

  const commanders = await aggregateCommanderStats(entries || [], tournamentMap);
  const totalEntries = commanders.reduce((sum, c) => sum + c.entries, 0);

  // Fetch comparison period data for delta calculation
  const comparisonRange = getComparisonDateRange(period);
  let comparisonMap: Record<string, any> = {};

  if (comparisonRange) {
    const compStats = await fetchComparisonStats(
      comparisonRange.start,
      comparisonRange.end,
      minSize
    );
    for (const cmd of compStats) {
      comparisonMap[cmd.commander_pair] = cmd;
    }
  }

  const commandersWithDelta = commanders.map(cmd => {
    const comp = comparisonMap[cmd.commander_pair];

    let deltaEntries: number | null = null;
    let deltaWinRate: number | null = null;
    let deltaConvRate: number | null = null;
    let deltaTop4Rate: number | null = null;
    let deltaChampRate: number | null = null;
    let isNew = false;

    if (comp) {
      deltaEntries = cmd.entries - comp.entries;
      deltaWinRate = cmd.win_rate - comp.win_rate;
      deltaConvRate = cmd.conversion_rate - comp.conversion_rate;
      deltaTop4Rate = cmd.top4_rate - comp.top4_rate;
      deltaChampRate = cmd.champ_rate - comp.champ_rate;
    } else if (comparisonRange) {
      isNew = true;
      deltaEntries = cmd.entries;
    }

    return {
      ...cmd,
      is_new: isNew,
      delta_entries: deltaEntries,
      delta_win_rate: deltaWinRate,
      delta_conv_rate: deltaConvRate,
      delta_top4_rate: deltaTop4Rate,
      delta_champ_rate: deltaChampRate,
    };
  });

  return {
    commanders: commandersWithDelta,
    totalEntries,
    period,
    minSize,
    recentTournaments,
    liveTournaments,
    tournamentCount: tournaments.length,
    selectedTournament: null,
    periodStart: dateRange.start,
    periodEnd: dateRange.end,
    periodLabel: dateRange.label,
    topMode,
    topValue,
    topCustom,
    topStat,
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

  let limit: number;
  if (topValue === 'top') {
    limit = 1;
  } else if (topValue === 'custom') {
    limit = topCustom;
  } else {
    const { count } = await supabase
      .from('players')
      .select('*', { count: 'exact', head: true })
      .gte('openskill_games', 10);

    const totalPlayers = count || 1000;
    const pct = parseInt(topValue);
    limit = Math.ceil(totalPlayers * (pct / 100));
  }

  const statToColumn: Record<string, string> = {
    'elo': 'openskill_elo',
    'win_rate': 'win_rate',
    'conv_rate': 'conversion_rate',
    'top4_rate': 'top4_rate',
    'champ_rate': 'champ_rate',
    'conv_exp': 'conv_vs_expected',
    'top4_exp': 'top4_vs_expected',
    'champ_exp': 'champ_vs_expected',
  };

  const column = statToColumn[topStat] || 'openskill_elo';

  const { data: topPlayers } = await supabase
    .from('players')
    .select('player_id')
    .gte('openskill_games', 10)
    .order(column, { ascending: false })
    .limit(limit);

  if (!topPlayers) return new Set();
  return new Set(topPlayers.map(p => p.player_id));
}

// Helper: aggregate entries into commander stats (for live calculation)
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
        expected_conv: 0,
        expected_top4: 0,
        expected_champ: 0,
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

    if (tournament?.top_cut && tournament.top_cut > 0) {
      stats.expected_conv += tournament.top_cut / totalPlayers;
      if (tournament.top_cut >= 4) {
        stats.expected_top4 += 4.0 / totalPlayers;
      }
    }
    stats.expected_champ += 1.0 / totalPlayers;

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

  // Get color identities
  const { data: commanderColors } = await supabase
    .from('commanders')
    .select('commander_name, color_identity')
    .limit(10000);

  const colorMap: Record<string, string> = {};
  for (const c of commanderColors || []) {
    colorMap[c.commander_name] = c.color_identity || '';
  }

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
      conv_vs_expected: convVsExpected,
      top4_vs_expected: top4VsExpected,
      champ_vs_expected: champVsExpected,
    };
  }).sort((a, b) => b.entries - a.entries);
}

// Fetch comparison period stats for delta calculation
async function fetchComparisonStats(
  startDate: string,
  endDate: string,
  minSize: number
): Promise<any[]> {
  // Get tournaments in comparison date range
  const { data: tournaments } = await supabase
    .from('tournaments')
    .select('tid, top_cut, total_players')
    .gte('start_date', startDate)
    .lte('start_date', endDate)
    .gte('total_players', minSize)
    .eq('is_league', false)
    .limit(10000);

  if (!tournaments || tournaments.length === 0) {
    return [];
  }

  const tournamentIds = tournaments.map(t => t.tid);
  const tournamentMap: Record<string, { top_cut: number; total_players: number }> = {};
  for (const t of tournaments) {
    tournamentMap[t.tid] = { top_cut: t.top_cut, total_players: t.total_players };
  }

  // Get all entries (batch to avoid .in() limits)
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
      .or('wins.gt.0,losses.gt.0,draws.gt.0')
      .limit(100000);
    if (batchEntries) {
      entries = entries.concat(batchEntries);
    }
  }

  // Aggregate into commander stats (simplified version without color identity)
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
        total_wins: 0,
        total_losses: 0,
        total_draws: 0,
        conversions: 0,
        top4s: 0,
        championships: 0,
      };
    }

    const stats = commanderStats[commanderPair];
    stats.entries++;
    stats.total_wins += entry.wins || 0;
    stats.total_losses += entry.losses || 0;
    stats.total_draws += entry.draws || 0;

    const tournament = tournamentMap[entry.tid];
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

  return Object.values(commanderStats).map((stats: any) => {
    const totalGames = stats.total_wins + stats.total_losses + stats.total_draws;
    return {
      commander_pair: stats.commander_pair,
      entries: stats.entries,
      win_rate: totalGames > 0 ? stats.total_wins / totalGames : 0,
      conversion_rate: stats.entries > 0 ? stats.conversions / stats.entries : 0,
      top4_rate: stats.entries > 0 ? stats.top4s / stats.entries : 0,
      champ_rate: stats.entries > 0 ? stats.championships / stats.entries : 0,
    };
  });
}
