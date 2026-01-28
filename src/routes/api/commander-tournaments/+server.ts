import { supabase } from '$lib/supabase';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
  const commanderPair = url.searchParams.get('commander');
  const minSize = parseInt(url.searchParams.get('min_size') || '50') || 50;
  const convertedOnly = url.searchParams.get('converted_only') === 'true';

  if (!commanderPair) {
    return json({ error: 'Commander parameter required' }, { status: 400 });
  }

  const now = new Date();
  const start = url.searchParams.get('start') || new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const end = url.searchParams.get('end') || now.toISOString().split('T')[0];

  // Get tournaments in date range
  const { data: tournaments } = await supabase
    .from('tournaments')
    .select('tid, tournament_name, start_date, total_players, top_cut')
    .gte('start_date', start)
    .lte('start_date', end)
    .gte('total_players', minSize)
    .eq('is_league', false)
    .eq('is_precon', false)
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
      .eq('played', true)
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
      const topCut = tournamentMap[entry.tid].top_cut || 0;
      if (convertedOnly && (topCut === 0 || entry.standing > topCut)) continue;
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

  // Convert to list with entries, sorted by date
  const result = Object.values(tournamentMap)
    .filter((t: any) => t.entries.length > 0)
    .sort((a: any, b: any) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime())
    .map((t: any) => ({
      ...t,
      entries: t.entries.sort((a: any, b: any) => a.standing - b.standing)
    }));

  return json({ tournaments: result });
};
