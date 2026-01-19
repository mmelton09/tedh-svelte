import { supabase } from '$lib/supabase';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
  const commanderPair = url.searchParams.get('commander');
  const period = url.searchParams.get('period') || '1y';
  const minSize = parseInt(url.searchParams.get('min_size') || '50') || 50;

  if (!commanderPair) {
    return json({ error: 'Commander parameter required' }, { status: 400 });
  }

  // Calculate date range based on period
  const now = new Date();
  const end = now.toISOString().split('T')[0];
  let start: string;

  switch (period) {
    case '30d':
      start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      break;
    case '90d':
      start = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      break;
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

  // Get tournaments in date range
  const { data: tournaments } = await supabase
    .from('tournaments')
    .select('tid, tournament_name, start_date, total_players, top_cut')
    .gte('start_date', start)
    .lte('start_date', end)
    .gte('total_players', minSize)
    .eq('is_league', false)
    .order('start_date', { ascending: false })
    .limit(10000);

  if (!tournaments || tournaments.length === 0) {
    return json({ tournaments: [] });
  }

  const tournamentIds = tournaments.map(t => t.tid);

  // Batch fetch entries to avoid .in() limits
  const BATCH_SIZE = 100;
  let entries: any[] = [];
  for (let i = 0; i < tournamentIds.length; i += BATCH_SIZE) {
    const batch = tournamentIds.slice(i, i + BATCH_SIZE);
    const { data: batchEntries, error: batchError } = await supabase
      .from('tournament_entries')
      .select(`
        entry_id,
        tid,
        player_id,
        standing,
        wins,
        losses,
        draws,
        players (player_name),
        deck_commanders (commander_name)
      `)
      .in('tid', batch)
      .or('wins.gt.0,losses.gt.0,draws.gt.0')
      .limit(100000);

    if (batchError) {
      console.error('Error fetching batch:', batchError);
    }
    if (batchEntries) {
      entries = entries.concat(batchEntries);
    }
  }

  if (entries.length === 0) {
    return json({ tournaments: [] });
  }

  // Filter entries where commander pair matches
  const matchingEntries = entries.filter(entry => {
    const entryCommanders = ((entry.deck_commanders as any[]) || [])
      .map((c: any) => c.commander_name)
      .sort()
      .join(' / ');
    return entryCommanders === commanderPair;
  });

  // Group by tournament
  const tournamentMap: Record<string, any> = {};
  for (const t of tournaments) {
    tournamentMap[t.tid] = {
      ...t,
      entries: []
    };
  }

  for (const entry of matchingEntries) {
    if (tournamentMap[entry.tid]) {
      tournamentMap[entry.tid].entries.push({
        player_id: entry.player_id,
        player_name: (entry.players as any)?.player_name || 'Unknown',
        standing: entry.standing,
        wins: entry.wins,
        losses: entry.losses,
        draws: entry.draws
      });
    }
  }

  // Convert to list, sorted by date, limited to 5 tournaments with entries
  const result = Object.values(tournamentMap)
    .filter((t: any) => t.entries.length > 0)
    .sort((a: any, b: any) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime())
    .slice(0, 5)
    .map((t: any) => ({
      ...t,
      entries: t.entries.sort((a: any, b: any) => a.standing - b.standing)
    }));

  return json({ tournaments: result });
};
