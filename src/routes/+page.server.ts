import { supabase } from '$lib/supabase';
import type { PageServerLoad } from './$types';

// Map URL periods to precalc periods
const PRECALC_PERIODS: Record<string, string> = {
  'all': 'all',
  '1y': '1y',
  '6m': '6m',
  '3m': '3m',
  '1m': '1m',
  'post_ban': 'post_ban',
};

// Map periods for delta lookup (current -> previous)
const DELTA_PERIOD_MAP: Record<string, string> = {
  '1y': '1y',    // Compare 1y to previous 1y
  '6m': '6m',
  '3m': '3m',
  '1m': '1m',
  'post_ban': 'post_ban',
};

// Valid min sizes in precalc table
const VALID_MIN_SIZES = [16, 30, 50, 100, 250];

function getClosestMinSize(size: number): number {
  const valid = VALID_MIN_SIZES.filter(s => s <= size);
  return valid.length > 0 ? Math.max(...valid) : 16;
}

function getPeriodLabel(period: string): string {
  const labels: Record<string, string> = {
    'all': 'All Time',
    '1y': 'Last Year',
    '6m': 'Last 6 Months',
    '3m': 'Last 3 Months',
    '1m': 'Last 30 Days',
    'post_ban': 'Post-RC Era',
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

export const load: PageServerLoad = async ({ url }) => {
  const period = url.searchParams.get('period') || '1y';
  const minSize = parseInt(url.searchParams.get('min_size') || '50') || 50;
  const tid = url.searchParams.get('tid');

  // Top player filter params (used for live calculation fallback)
  const topMode = url.searchParams.get('top_mode') || 'off';
  const topValue = url.searchParams.get('top_value') || 'top';
  const topCustom = parseInt(url.searchParams.get('top_custom') || '100') || 100;
  const topStat = url.searchParams.get('top_stat') || 'elo';

  const dateRange = getDateRange(period);
  const precalcPeriod = PRECALC_PERIODS[period];
  const precalcMinSize = getClosestMinSize(minSize);

  // Fetch top tournaments by size for the featured bar
  const { data: recentTournaments } = await supabase
    .from('tournaments')
    .select('tid, tournament_name, total_players, start_date')
    .gte('total_players', minSize)
    .eq('is_league', false)
    .gte('start_date', dateRange.start)
    .lte('start_date', dateRange.end)
    .order('total_players', { ascending: false })
    .limit(50);

  // If a specific tournament is selected, compute stats for that tournament (live)
  if (tid) {
    return await loadSingleTournament(tid, period, minSize, recentTournaments || []);
  }

  // Use precalc table if available and no special filters
  if (precalcPeriod && topMode === 'off') {
    // Get tournament count for display
    const { count: tournamentCount } = await supabase
      .from('tournaments')
      .select('*', { count: 'exact', head: true })
      .gte('total_players', minSize)
      .eq('is_league', false)
      .gte('start_date', dateRange.start)
      .lte('start_date', dateRange.end);

    // Fetch from precalc table
    const { data: precalcCommanders, error } = await supabase
      .from('commander_stats')
      .select('*')
      .eq('period', precalcPeriod)
      .eq('min_size', precalcMinSize)
      .order('entries', { ascending: false })
      .limit(10000);

    if (error) {
      console.error('Error fetching from commander_stats:', error);
    }

    if (precalcCommanders && precalcCommanders.length > 0) {
      // For delta calculation, we can compare to current period stats
      // but that requires knowing what each commander's "previous" stats were
      // For now, we'll skip delta for precalc (it's complex without storing both periods)
      // The delta would need to compare current period to previous same-length period

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
        // Delta fields - not available from precalc yet
        is_new: false,
        delta_entries: null,
        delta_win_rate: null,
        delta_conv_rate: null,
        delta_top4_rate: null,
        delta_champ_rate: null,
      }));

      const totalEntries = commanders.reduce((sum: number, c: any) => sum + c.entries, 0);

      return {
        commanders,
        totalEntries,
        period,
        minSize,
        recentTournaments: recentTournaments || [],
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
    period, minSize, dateRange, recentTournaments || [],
    topMode, topValue, topCustom, topStat
  );
};

// Load stats for a single tournament
async function loadSingleTournament(
  tid: string,
  period: string,
  minSize: number,
  recentTournaments: any[]
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
    .limit(10000);

  const commanders = await aggregateCommanderStats(entries || [], { [tid]: tournament });
  const totalEntries = commanders.reduce((sum, c) => sum + c.entries, 0);

  return {
    commanders,
    totalEntries,
    period,
    minSize,
    recentTournaments,
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

  return {
    commanders: commanders.map(cmd => ({
      ...cmd,
      is_new: false,
      delta_entries: null,
      delta_win_rate: null,
      delta_conv_rate: null,
      delta_top4_rate: null,
      delta_champ_rate: null,
    })),
    totalEntries,
    period,
    minSize,
    recentTournaments,
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
