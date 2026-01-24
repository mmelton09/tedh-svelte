import { supabase } from '$lib/supabase';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
  const playerId = url.searchParams.get('player_id');
  const commanderPair = url.searchParams.get('commander');
  const minSize = parseInt(url.searchParams.get('min_size') || '16') || 16;
  const period = url.searchParams.get('period') || '1y';
  const dataType = url.searchParams.get('data_type') || 'all';

  if (!playerId || !commanderPair) {
    return json({ error: 'player_id and commander parameters required' }, { status: 400 });
  }

  // Calculate date range
  const now = new Date();
  let start: string;

  switch (period) {
    case '1m':
    case '30d':
      start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      break;
    case '3m':
    case '90d':
      start = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      break;
    case '6m':
    case '6mo':
      start = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      break;
    case '1y':
      start = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      break;
    case 'post_ban':
      start = '2024-09-23';
      break;
    case 'all':
      start = '2020-01-01';
      break;
    default:
      start = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  }

  // Build query for player's entries
  let query = supabase
    .from('tournament_entries')
    .select(`
      entry_id,
      tid,
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
        top_cut,
        has_pod_data
      ),
      deck_commanders (
        commander_name
      )
    `)
    .eq('player_id', playerId)
    .gte('tournaments.total_players', minSize)
    .eq('tournaments.is_league', false)
    .gte('tournaments.start_date', start)
    .or('wins.gt.0,losses.gt.0,draws.gt.0');

  // Filter by has_pod_data if ranked
  if (dataType === 'ranked') {
    query = query.eq('tournaments.has_pod_data', true);
  }

  const { data: entries, error } = await query
    .order('tournaments(start_date)', { ascending: false })
    .limit(100);

  if (error) {
    console.error('Error fetching pilot tournaments:', error);
    return json({ error: 'Failed to fetch tournaments' }, { status: 500 });
  }

  // Filter to matching commander pair
  const tournaments = (entries || [])
    .filter(entry => {
      const commanders = ((entry.deck_commanders as any[]) || [])
        .map((c: any) => c.commander_name)
        .sort()
        .join(' / ');
      return commanders === commanderPair;
    })
    .map(entry => {
      const t = entry.tournaments as any;
      return {
        tid: t.tid,
        tournament_name: t.tournament_name,
        start_date: t.start_date,
        total_players: t.total_players,
        top_cut: t.top_cut,
        standing: entry.standing,
        wins: entry.wins,
        losses: entry.losses,
        draws: entry.draws,
        decklist: entry.decklist
      };
    });

  return json({ tournaments });
};
