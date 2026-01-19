import { supabase } from '$lib/supabase';
import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';

// Calculate date range from period string
function getDateRange(period: string): { start: string | null; end: string | null } {
  const now = new Date();

  switch (period) {
    case 'all':
      return { start: null, end: null };
    case 'post_ban':
      return { start: '2024-09-23', end: null };
    case 'last_week': {
      const lastWeek = new Date(now);
      lastWeek.setDate(lastWeek.getDate() - 7);
      return { start: lastWeek.toISOString().split('T')[0], end: null };
    }
    case 'current_month': {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      return { start: monthStart.toISOString().split('T')[0], end: null };
    }
    case 'prev_month': {
      const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
      return { start: prevMonthStart.toISOString().split('T')[0], end: prevMonthEnd.toISOString().split('T')[0] };
    }
    case '3m': {
      const threeMonths = new Date(now);
      threeMonths.setMonth(threeMonths.getMonth() - 3);
      return { start: threeMonths.toISOString().split('T')[0], end: null };
    }
    case '6m': {
      const sixMonths = new Date(now);
      sixMonths.setMonth(sixMonths.getMonth() - 6);
      return { start: sixMonths.toISOString().split('T')[0], end: null };
    }
    case '1y': {
      const oneYear = new Date(now);
      oneYear.setFullYear(oneYear.getFullYear() - 1);
      return { start: oneYear.toISOString().split('T')[0], end: null };
    }
    default:
      return { start: null, end: null };
  }
}

export const load: PageServerLoad = async ({ params, url }) => {
  const identifier = decodeURIComponent(params.name);
  const minSize = parseInt(url.searchParams.get('min_size') || '50') || 50;
  const period = url.searchParams.get('period') || 'all';
  const dateRange = getDateRange(period);

  // Get player stats - try player_id first (from leaderboard links), then player_name
  let { data: playerStats, error: statsError } = await supabase
    .from('players')
    .select('*')
    .eq('player_id', identifier)
    .single();

  // If player_id lookup fails, try by player_name
  if (!playerStats) {
    const { data: nameData, error: nameError } = await supabase
      .from('players')
      .select('*')
      .eq('player_name', identifier)
      .single();

    if (!nameData) {
      // Try case-insensitive as last resort
      const { data: ciData, error: ciError } = await supabase
        .from('players')
        .select('*')
        .ilike('player_name', identifier)
        .single();
      playerStats = ciData;
      statsError = ciError;
    } else {
      playerStats = nameData;
      statsError = nameError;
    }
  }

  if (statsError && statsError.code !== 'PGRST116') {
    console.error('Error fetching player stats:', statsError, 'for identifier:', identifier);
  }

  if (!playerStats) {
    throw error(404, `Player not found: ${identifier}`);
  }

  // Use actual player name from database for display
  const playerName = playerStats.player_name;

  // Get tournament history with commander info
  let historyQuery = supabase
    .from('tournament_entries')
    .select(`
      entry_id,
      standing,
      wins,
      losses,
      draws,
      decklist,
      tournaments!inner (
        tid,
        tournament_name,
        start_date,
        total_players,
        top_cut
      ),
      deck_commanders (
        commander_name
      )
    `)
    .eq('player_id', playerStats.player_id)
    .gte('tournaments.total_players', minSize)
    .eq('tournaments.is_league', false)
    .or('wins.gt.0,losses.gt.0,draws.gt.0');

  // Apply date filters
  if (dateRange.start) {
    historyQuery = historyQuery.gte('tournaments.start_date', dateRange.start);
  }
  if (dateRange.end) {
    historyQuery = historyQuery.lte('tournaments.start_date', dateRange.end);
  }

  const { data: history, error: historyError } = await historyQuery
    .order('tournaments(start_date)', { ascending: false })
    .limit(10000);

  if (historyError) {
    console.error('Error fetching tournament history:', historyError);
  }
  const tournamentHistory = history || [];

  // Aggregate commander stats from tournament history
  const commanderMap: Record<string, {
    commander_pair: string;
    entries: number;
    total_wins: number;
    total_losses: number;
    total_draws: number;
    conversions: number;
    top4s: number;
    championships: number;
    placement_sum: number;
  }> = {};

  for (const entry of tournamentHistory) {
    const commanders = (entry.deck_commanders as any[]) || [];
    const commanderPair = commanders
      .map((c: any) => c.commander_name)
      .sort()
      .join(' / ');

    if (!commanderPair) continue;

    if (!commanderMap[commanderPair]) {
      commanderMap[commanderPair] = {
        commander_pair: commanderPair,
        entries: 0,
        total_wins: 0,
        total_losses: 0,
        total_draws: 0,
        conversions: 0,
        top4s: 0,
        championships: 0,
        placement_sum: 0
      };
    }

    const stats = commanderMap[commanderPair];
    stats.entries++;
    stats.total_wins += entry.wins || 0;
    stats.total_losses += entry.losses || 0;
    stats.total_draws += entry.draws || 0;

    const tournament = entry.tournaments as any;
    if (tournament?.top_cut && entry.standing <= tournament.top_cut) {
      stats.conversions++;
    }
    if (entry.standing <= 4 && tournament?.top_cut) {
      stats.top4s++;
    }
    if (entry.standing === 1) {
      stats.championships++;
    }

    // Calculate placement percentile for AvgX%
    if (tournament?.total_players && entry.standing) {
      const placementPct = ((tournament.total_players - entry.standing) / (tournament.total_players - 1)) * 100;
      stats.placement_sum += placementPct;
    }
  }

  // Calculate rates and sort by entries
  const commanderStats = Object.values(commanderMap).map(stats => {
    const totalGames = stats.total_wins + stats.total_losses + stats.total_draws;
    const winRate = totalGames > 0 ? stats.total_wins / totalGames : 0;
    const drawRate = totalGames > 0 ? stats.total_draws / totalGames : 0;
    return {
      ...stats,
      win_rate: winRate,
      five_swiss: totalGames >= 7 ? (winRate * 5) + (drawRate * 1) : null,
      avg_placement_pct: stats.entries > 0 ? stats.placement_sum / stats.entries : null,
      conversion_rate: stats.entries > 0 ? stats.conversions / stats.entries : 0,
      top4_rate: stats.entries > 0 ? stats.top4s / stats.entries : 0,
      champ_rate: stats.entries > 0 ? stats.championships / stats.entries : 0
    };
  }).sort((a, b) => b.entries - a.entries);

  // Calculate overall stats for the period (from tournament history)
  const periodStats = {
    entries: tournamentHistory.length,
    total_wins: tournamentHistory.reduce((sum, e) => sum + (e.wins || 0), 0),
    total_losses: tournamentHistory.reduce((sum, e) => sum + (e.losses || 0), 0),
    total_draws: tournamentHistory.reduce((sum, e) => sum + (e.draws || 0), 0),
    conversions: 0,
    top4s: 0,
    championships: 0
  };

  for (const entry of tournamentHistory) {
    const tournament = entry.tournaments as any;
    if (tournament?.top_cut && entry.standing <= tournament.top_cut) {
      periodStats.conversions++;
    }
    if (entry.standing <= 4 && tournament?.top_cut) {
      periodStats.top4s++;
    }
    if (entry.standing === 1) {
      periodStats.championships++;
    }
  }

  const totalGames = periodStats.total_wins + periodStats.total_losses + periodStats.total_draws;
  const enhancedPeriodStats = {
    ...periodStats,
    win_rate: totalGames > 0 ? periodStats.total_wins / totalGames : 0,
    conversion_rate: periodStats.entries > 0 ? periodStats.conversions / periodStats.entries : 0,
    top4_rate: periodStats.entries > 0 ? periodStats.top4s / periodStats.entries : 0,
    champ_rate: periodStats.entries > 0 ? periodStats.championships / periodStats.entries : 0
  };

  return {
    playerName,
    playerId: playerStats.player_id,
    stats: playerStats,
    periodStats: enhancedPeriodStats,
    commanderStats,
    tournamentHistory,
    minSize,
    period
  };
};
