import { supabase } from '$lib/supabase';
import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async () => {
  // Get the current month's date range
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

  // Find the largest tournament this month
  const { data: tournaments } = await supabase
    .from('tournaments')
    .select('tid, tournament_name, total_players, start_date')
    .gte('start_date', monthStart)
    .lte('start_date', monthEnd)
    .order('total_players', { ascending: false })
    .limit(1);

  if (tournaments && tournaments.length > 0) {
    const largestTournament = tournaments[0];

    // Find the winner (standing = 1) of that tournament
    const { data: winner } = await supabase
      .from('tournament_entries')
      .select(`
        player_id,
        players!inner (
          player_name
        )
      `)
      .eq('tid', largestTournament.tid)
      .eq('standing', 1)
      .limit(1)
      .single();

    const playerData = winner?.players as unknown as { player_name: string } | null;
    if (playerData?.player_name) {
      throw redirect(307, `/players/${encodeURIComponent(playerData.player_name)}`);
    }
  }

  // Fallback: if no current month data, try last month
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0];
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split('T')[0];

  const { data: lastMonthTournaments } = await supabase
    .from('tournaments')
    .select('tid, tournament_name, total_players')
    .gte('start_date', lastMonthStart)
    .lte('start_date', lastMonthEnd)
    .order('total_players', { ascending: false })
    .limit(1);

  if (lastMonthTournaments && lastMonthTournaments.length > 0) {
    const { data: winner } = await supabase
      .from('tournament_entries')
      .select(`
        player_id,
        players!inner (
          player_name
        )
      `)
      .eq('tid', lastMonthTournaments[0].tid)
      .eq('standing', 1)
      .limit(1)
      .single();

    const playerData = winner?.players as unknown as { player_name: string } | null;
    if (playerData?.player_name) {
      throw redirect(307, `/players/${encodeURIComponent(playerData.player_name)}`);
    }
  }

  // Final fallback: redirect to top ELO player
  const { data: topPlayer } = await supabase
    .from('players')
    .select('player_name')
    .not('league_elo', 'is', null)
    .order('league_elo', { ascending: false })
    .limit(1)
    .single();

  if (topPlayer?.player_name) {
    throw redirect(307, `/players/${encodeURIComponent(topPlayer.player_name)}`);
  }

  // If all else fails, just show an empty state
  return { featuredPlayer: null };
};
