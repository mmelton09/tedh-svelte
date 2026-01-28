import { supabase } from '$lib/supabase';
import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async () => {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const today = now.toISOString().split('T')[0];

  // Find the largest tournament in the last 30 days
  const { data: tournaments } = await supabase
    .from('tournaments')
    .select('tid, tournament_name, total_players, start_date')
    .gte('start_date', thirtyDaysAgo)
    .lte('start_date', today)
    .order('total_players', { ascending: false })
    .limit(1);

  if (tournaments && tournaments.length > 0) {
    const { data: winner } = await supabase
      .from('tournament_entries')
      .select(`
        player_id,
        players!inner (
          player_name
        )
      `)
      .eq('tid', tournaments[0].tid)
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
