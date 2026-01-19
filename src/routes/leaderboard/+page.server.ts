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

// Valid min sizes in precalc table
const VALID_MIN_SIZES = [16, 30, 50, 100, 250];

function getClosestMinSize(size: number): number {
  // Find the largest valid size <= requested size
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

export const load: PageServerLoad = async ({ url }) => {
  const page = parseInt(url.searchParams.get('page') || '1');
  const perPage = parseInt(url.searchParams.get('per_page') || '100') || 100;
  const period = url.searchParams.get('period') || 'all';
  const minSize = parseInt(url.searchParams.get('min_size') || '50') || 50;
  const minEntries = parseInt(url.searchParams.get('min_entries') || '1') || 1;
  const sortBy = url.searchParams.get('sort') || 'openskill_elo';
  const sortOrder = url.searchParams.get('order') || 'desc';
  const search = url.searchParams.get('search') || '';
  const rankedOnly = url.searchParams.get('ranked') !== 'false';

  const offset = (page - 1) * perPage;

  // Map to precalc period
  const precalcPeriod = PRECALC_PERIODS[period];
  const precalcMinSize = getClosestMinSize(minSize);

  if (!precalcPeriod) {
    // Unsupported period - return empty for now
    // TODO: Could fall back to live calculation for custom periods
    return {
      players: [],
      page,
      perPage,
      period,
      minSize,
      minEntries,
      rankedOnly,
      sortBy,
      sortOrder,
      search,
      totalCount: 0,
      totalPages: 0,
      avgElo: null,
      maxElo: null,
      periodLabel: 'Unsupported period',
      usingPrecalc: false,
    };
  }

  // Map sortBy to column names
  const sortColumnMap: Record<string, string> = {
    'openskill_elo': 'openskill_elo',
    'player_name': 'player_name',
    'entries': 'entries',
    'wins': 'total_wins',
    'win_rate': 'win_rate',
    'five_swiss': 'five_swiss',
    'conversions': 'conversions',
    'conv_pct': 'conversion_rate',
    'top4s': 'top4s',
    'top4_pct': 'top4_rate',
    'championships': 'championships',
    'champ_pct': 'champ_rate',
    'placement_pct': 'avg_placement_pct',
  };
  const sortColumn = sortColumnMap[sortBy] || 'openskill_elo';

  // Build query for precalc table
  let query = supabase
    .from('leaderboard_stats')
    .select('*', { count: 'exact' })
    .eq('period', precalcPeriod)
    .eq('min_size', precalcMinSize);

  // Apply min entries filter
  if (minEntries > 1) {
    query = query.gte('entries', minEntries);
  }

  // Apply search filter
  if (search) {
    query = query.ilike('player_name', `%${search}%`);
  }

  // Apply sorting
  const ascending = sortOrder === 'asc';
  query = query.order(sortColumn, { ascending, nullsFirst: false });

  // Secondary sort by entries for ties
  if (sortColumn !== 'entries') {
    query = query.order('entries', { ascending: false });
  }

  // Apply pagination
  query = query.range(offset, offset + perPage - 1);

  const { data: players, error, count } = await query;

  if (error) {
    console.error('Error fetching leaderboard:', error);
    return {
      players: [],
      page,
      perPage,
      period,
      minSize,
      minEntries,
      rankedOnly,
      sortBy,
      sortOrder,
      search,
      totalCount: 0,
      totalPages: 0,
      avgElo: null,
      maxElo: null,
      periodLabel: getPeriodLabel(period),
      usingPrecalc: true,
      error: error.message,
    };
  }

  const totalCount = count || 0;
  const totalPages = Math.ceil(totalCount / perPage);

  // Calculate ELO ranks for display
  // For accurate global rank, we'd need to query separately, but for now use page-relative
  const formattedPlayers = (players || []).map((p, idx) => ({
    player_id: p.player_id,
    player_name: p.player_name,
    openskill_elo: p.openskill_elo,
    entries: p.entries,
    wins: p.total_wins,
    losses: p.total_losses,
    draws: p.total_draws,
    conversions: p.conversions,
    top4s: p.top4s,
    championships: p.championships,
    main_commander: p.main_commander,
    commander_pct: p.commander_pct,
    avg_placement_pct: p.avg_placement_pct,
    win_rate: p.win_rate,
    five_swiss: p.five_swiss,
    conversion_rate: p.conversion_rate,
    top4_rate: p.top4_rate,
    champ_rate: p.champ_rate,
    elo_rank: offset + idx + 1, // Approximate rank based on sort position
  }));

  // Get ELO stats from the full filtered set
  const { data: statsData } = await supabase
    .from('leaderboard_stats')
    .select('openskill_elo')
    .eq('period', precalcPeriod)
    .eq('min_size', precalcMinSize)
    .gte('entries', minEntries)
    .not('openskill_elo', 'is', null);

  const eloValues = (statsData || []).map(p => p.openskill_elo).filter(e => e != null) as number[];
  const avgElo = eloValues.length > 0 ? eloValues.reduce((a, b) => a + b, 0) / eloValues.length : null;
  const maxElo = eloValues.length > 0 ? Math.max(...eloValues) : null;

  return {
    players: formattedPlayers,
    page,
    perPage,
    period,
    minSize,
    minEntries,
    rankedOnly,
    sortBy,
    sortOrder,
    search,
    totalCount,
    totalPages,
    avgElo,
    maxElo,
    periodLabel: getPeriodLabel(period),
    usingPrecalc: true,
  };
};
