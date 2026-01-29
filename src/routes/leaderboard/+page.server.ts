import { supabase } from '$lib/supabase';
import type { PageServerLoad } from './$types';

const PRECALC_PERIODS: Record<string, string> = {
  'all': 'all',
  '1y': '1y',
  '6m': '6m',
  '3m': '3m',
  '1m': '1m',
  'post_ban': 'post_ban',
};

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

function bayesianWinRate(wins: number, games: number, priorGames = 30): number {
  const priorWinRate = 0.25;
  const priorWins = priorGames * priorWinRate;
  return (wins + priorWins) / (games + priorGames);
}

const PROVEN_THRESHOLD = 50;
const RISING_THRESHOLD = 30;

function getPlayerTier(games: number): 'proven' | 'rising' | 'provisional' {
  if (games >= PROVEN_THRESHOLD) return 'proven';
  if (games >= RISING_THRESHOLD) return 'rising';
  return 'provisional';
}

export const load: PageServerLoad = async ({ url }) => {
  const period = url.searchParams.get('period') || 'all';
  const minSize = parseInt(url.searchParams.get('min_size') || '50') || 50;
  const minEntries = parseInt(url.searchParams.get('min_entries') || '1') || 1;
  const rankedOnly = url.searchParams.get('ranked') === 'true';
  const search = url.searchParams.get('search') || '';

  const precalcPeriod = PRECALC_PERIODS[period];
  const precalcMinSize = getClosestMinSize(minSize);
  const dataType = rankedOnly ? 'ranked' : 'all';

  if (!precalcPeriod) {
    return {
      players: [],
      period,
      minSize,
      minEntries,
      rankedOnly,
      search,
      totalCount: 0,
      avgElo: null,
      maxElo: null,
      periodLabel: 'Unsupported period',
      tierThresholds: { provenGames: PROVEN_THRESHOLD, risingGames: RISING_THRESHOLD, provenPct: 0, risingPct: 0 },
    };
  }

  let query = supabase
    .from('leaderboard_stats')
    .select('*')
    .eq('data_type', dataType)
    .eq('period', precalcPeriod)
    .eq('min_size', precalcMinSize)
    .order('openskill_elo', { ascending: false, nullsFirst: false })
    .limit(100000);

  if (minEntries > 1) {
    query = query.gte('entries', minEntries);
  }

  const { data: players, error } = await query;

  if (error) {
    console.error('Error fetching leaderboard:', error);
    return {
      players: [],
      period,
      minSize,
      minEntries,
      rankedOnly,
      search,
      totalCount: 0,
      avgElo: null,
      maxElo: null,
      periodLabel: getPeriodLabel(period),
      tierThresholds: { provenGames: PROVEN_THRESHOLD, risingGames: RISING_THRESHOLD, provenPct: 0, risingPct: 0 },
    };
  }

  const allGames = (players || [])
    .map(p => (p.total_wins || 0) + (p.total_losses || 0) + (p.total_draws || 0))
    .filter(g => g > 0)
    .sort((a, b) => a - b);

  const provenPct = allGames.length > 0
    ? Math.round((allGames.filter(g => g < PROVEN_THRESHOLD).length / allGames.length) * 100)
    : 0;
  const risingPct = allGames.length > 0
    ? Math.round((allGames.filter(g => g < RISING_THRESHOLD).length / allGames.length) * 100)
    : 0;

  const formattedPlayers = (players || []).map((p, idx) => {
    const games = (p.total_wins || 0) + (p.total_losses || 0) + (p.total_draws || 0);
    return {
      player_id: p.player_id,
      player_name: p.player_name,
      openskill_elo: p.openskill_elo,
      entries: p.entries,
      wins: p.total_wins,
      losses: p.total_losses,
      draws: p.total_draws,
      games,
      conversions: p.conversions,
      top4s: p.top4s,
      championships: p.championships,
      main_commander: p.main_commander,
      commander_pct: p.commander_pct,
      avg_placement_pct: p.avg_placement_pct,
      win_rate: p.win_rate,
      bayesian_win_rate: bayesianWinRate(p.total_wins || 0, games),
      tier: getPlayerTier(games),
      five_swiss: p.five_swiss,
      conversion_rate: p.conversion_rate,
      top4_rate: p.top4_rate,
      champ_rate: p.champ_rate,
      elo_rank: idx + 1,
    };
  });

  const eloValues = formattedPlayers.map(p => p.openskill_elo).filter(e => e != null) as number[];
  const avgElo = eloValues.length > 0 ? eloValues.reduce((a, b) => a + b, 0) / eloValues.length : null;
  const maxElo = eloValues.length > 0 ? Math.max(...eloValues) : null;

  return {
    players: formattedPlayers,
    period,
    minSize,
    minEntries,
    rankedOnly,
    search,
    totalCount: formattedPlayers.length,
    avgElo,
    maxElo,
    periodLabel: getPeriodLabel(period),
    tierThresholds: {
      provenGames: PROVEN_THRESHOLD,
      risingGames: RISING_THRESHOLD,
      provenPct,
      risingPct
    },
  };
};
