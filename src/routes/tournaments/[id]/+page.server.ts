import { supabase } from '$lib/supabase';
import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ params, url }) => {
  const tournamentId = params.id;

  // Get tournament info first to determine dynamic default
  const { data: tournament, error: tournamentError } = await supabase
    .from('tournaments')
    .select('*')
    .eq('tid', tournamentId)
    .single();

  if (tournamentError || !tournament) {
    console.error('Error fetching tournament:', tournamentError);
    throw error(404, 'Tournament not found');
  }

  // Determine default minSize based on tournament size
  // Use highest bracket that fits the tournament's player count
  const tournamentSize = tournament.total_players || 0;
  let defaultMinSize = 50;
  if (tournamentSize < 50) {
    if (tournamentSize >= 30) defaultMinSize = 30;
    else defaultMinSize = 16;
  }

  // Use URL param if set, otherwise use calculated default
  const minSizeParam = url.searchParams.get('min_size');
  const minSize = minSizeParam ? parseInt(minSizeParam) || defaultMinSize : defaultMinSize;

  // Get prev/next tournaments (same size filter, ordered by date)
  const { data: prevTournament } = await supabase
    .from('tournaments')
    .select('tid, tournament_name, total_players')
    .gte('total_players', minSize)
    .eq('is_league', false)
    .lt('start_date', tournament.start_date)
    .order('start_date', { ascending: false })
    .limit(1)
    .single();

  const { data: nextTournament } = await supabase
    .from('tournaments')
    .select('tid, tournament_name, total_players')
    .gte('total_players', minSize)
    .eq('is_league', false)
    .gt('start_date', tournament.start_date)
    .order('start_date', { ascending: true })
    .limit(1)
    .single();

  // Get standings with player and commander info
  const { data: standings, error: standingsError } = await supabase
    .from('tournament_entries')
    .select(`
      entry_id,
      standing,
      wins,
      losses,
      draws,
      decklist,
      players!inner (
        player_id,
        player_name,
        openskill_elo
      ),
      deck_commanders (
        commander_name
      )
    `)
    .eq('tid', tournamentId)
    .order('standing', { ascending: true })
    .limit(10000);

  if (standingsError) {
    console.error('Error fetching standings:', standingsError);
  }

  // Debug: log decklist data
  const decklistSamples = (standings || []).slice(0, 5).map(s => ({
    standing: s.standing,
    decklist: s.decklist,
    hasUrl: s.decklist?.includes('http')
  }));
  console.log('Decklist samples:', JSON.stringify(decklistSamples, null, 2));

  // Get match/pairings data for this tournament
  const { data: matches } = await supabase
    .from('matches')
    .select(`
      match_id,
      round_number,
      round_name,
      table_number,
      winner_id,
      match_players (
        player_id,
        is_winner,
        turn_order
      )
    `)
    .eq('tid', tournamentId)
    .order('round_number', { ascending: true })
    .limit(10000);

  // Build a map of player_id -> player_name for quick lookup
  const playerNameMap: Record<string, string> = {};
  for (const s of standings || []) {
    const player = s.players as any;
    if (player?.player_id) {
      playerNameMap[player.player_id] = player.player_name;
    }
  }

  // Get color identities for all commanders in this tournament
  const allCommanderNames = new Set<string>();
  for (const s of standings || []) {
    const commanders = (s.deck_commanders as any[]) || [];
    for (const c of commanders) {
      if (c.commander_name) {
        allCommanderNames.add(c.commander_name);
      }
    }
  }

  const { data: commanderColors } = await supabase
    .from('commanders')
    .select('commander_name, color_identity')
    .in('commander_name', Array.from(allCommanderNames))
    .limit(1000);

  const colorMap: Record<string, string> = {};
  for (const c of commanderColors || []) {
    colorMap[c.commander_name] = c.color_identity || '';
  }

  // Organize matches by player_id
  const playerMatches: Record<string, any[]> = {};
  for (const match of matches || []) {
    const players = (match.match_players as any[]) || [];
    for (const mp of players) {
      if (!playerMatches[mp.player_id]) {
        playerMatches[mp.player_id] = [];
      }

      // Get opponents (other players in this match)
      const opponents = players
        .filter(p => p.player_id !== mp.player_id)
        .map(p => playerNameMap[p.player_id] || 'Unknown');

      // Determine result
      let result = '—'; // Draw or unknown
      if (match.winner_id === mp.player_id) {
        result = 'Won';
      } else if (match.winner_id && match.winner_id !== mp.player_id) {
        result = 'Lost';
      }

      playerMatches[mp.player_id].push({
        round: match.round_name || `R${match.round_number}`,
        roundNumber: match.round_number,
        seat: mp.turn_order,
        opponents,
        result
      });
    }
  }

  // Sort each player's matches by round number
  for (const playerId of Object.keys(playerMatches)) {
    playerMatches[playerId].sort((a, b) => a.roundNumber - b.roundNumber);
  }

  // Calculate vs 100+ average stats
  // Get baseline averages from 100+ player tournaments
  const { data: baselineData } = await supabase
    .from('tournaments')
    .select('tid, total_players, top_cut')
    .gte('total_players', 100)
    .eq('is_league', false)
    .limit(10000);

  let baselineConvRate = 0;
  let baselineTop4Rate = 0;
  let baselineChampRate = 0;

  if (baselineData && baselineData.length > 0) {
    let totalEntries = 0;
    let totalConv = 0;
    let totalTop4 = 0;
    let totalChamp = 0;

    for (const t of baselineData) {
      const players = t.total_players || 0;
      const topCut = t.top_cut || 0;
      totalEntries += players;
      totalConv += topCut;
      totalTop4 += Math.min(4, topCut);
      totalChamp += 1;
    }

    if (totalEntries > 0) {
      baselineConvRate = totalConv / totalEntries;
      baselineTop4Rate = totalTop4 / totalEntries;
      baselineChampRate = totalChamp / totalEntries;
    }
  }

  // Calculate this tournament's rates
  const totalPlayers = tournament.total_players || standings?.length || 0;
  const topCut = tournament.top_cut || 0;

  const thisConvRate = topCut > 0 ? topCut / totalPlayers : 0;
  const thisTop4Rate = topCut >= 4 ? 4 / totalPlayers : 0;
  const thisChampRate = totalPlayers > 0 ? 1 / totalPlayers : 0;

  const vsAvg = {
    convRate: thisConvRate * 100,
    convDelta: (thisConvRate - baselineConvRate) * 100,
    top4Rate: thisTop4Rate * 100,
    top4Delta: (thisTop4Rate - baselineTop4Rate) * 100,
    champRate: thisChampRate * 100,
    champDelta: (thisChampRate - baselineChampRate) * 100
  };

  return {
    tournament,
    standings: standings || [],
    prevTournament,
    nextTournament,
    minSize,
    vsAvg,
    playerMatches,
    colorMap
  };
};
