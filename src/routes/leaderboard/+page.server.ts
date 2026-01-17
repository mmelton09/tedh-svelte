import { supabase } from '$lib/supabase';
import type { PageServerLoad } from './$types';

// Calculate date range from period string
function getDateRange(period: string, customStart?: string, customEnd?: string): { start: string; end: string; label: string } {
  const now = new Date();
  const end = now.toISOString().split('T')[0];

  if (period === 'custom' && customStart && customEnd) {
    return { start: customStart, end: customEnd, label: 'Custom Range' };
  }

  switch (period) {
    case 'all':
      return { start: '2020-01-01', end, label: 'All Time' };
    case 'post_ban':
      return { start: '2024-09-23', end, label: 'Post-RC Era' };
    case 'last_week': {
      const dayOfWeek = now.getDay();
      const daysToLastMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const thisMonday = new Date(now);
      thisMonday.setDate(now.getDate() - daysToLastMonday);
      const lastMonday = new Date(thisMonday);
      lastMonday.setDate(thisMonday.getDate() - 7);
      const lastSunday = new Date(thisMonday);
      lastSunday.setDate(thisMonday.getDate() - 1);
      return {
        start: lastMonday.toISOString().split('T')[0],
        end: lastSunday.toISOString().split('T')[0],
        label: 'Last Week'
      };
    }
    case 'current_month': {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      return {
        start: monthStart.toISOString().split('T')[0],
        end,
        label: monthStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
      };
    }
    case 'prev_month': {
      const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
      return {
        start: prevMonthStart.toISOString().split('T')[0],
        end: prevMonthEnd.toISOString().split('T')[0],
        label: prevMonthStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
      };
    }
    case '1m': {
      const thirtyDays = new Date(now);
      thirtyDays.setDate(thirtyDays.getDate() - 30);
      return { start: thirtyDays.toISOString().split('T')[0], end, label: 'Last 30 Days' };
    }
    case '3m': {
      const threeMonths = new Date(now);
      threeMonths.setMonth(threeMonths.getMonth() - 3);
      return { start: threeMonths.toISOString().split('T')[0], end, label: 'Last 3 Months' };
    }
    case '6m': {
      const sixMonths = new Date(now);
      sixMonths.setMonth(sixMonths.getMonth() - 6);
      return { start: sixMonths.toISOString().split('T')[0], end, label: 'Last 6 Months' };
    }
    case '1y':
    default: {
      const oneYear = new Date(now);
      oneYear.setFullYear(oneYear.getFullYear() - 1);
      return { start: oneYear.toISOString().split('T')[0], end, label: 'Last Year' };
    }
  }
}

interface PlayerStats {
  player_id: string;
  player_name: string;
  openskill_elo: number | null;
  entries: number;
  wins: number;
  losses: number;
  draws: number;
  conversions: number;
  top4s: number;
  championships: number;
  main_commander: string | null;
  commander_pct: number | null;
  avg_placement_pct: number | null;
  elo_rank: number | null;
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
  const customStart = url.searchParams.get('start') || undefined;
  const customEnd = url.searchParams.get('end') || undefined;
  const rankedOnly = url.searchParams.get('ranked') !== 'false';

  const offset = (page - 1) * perPage;
  const dateRange = getDateRange(period, customStart, customEnd);

  // First get tournaments in the date range
  let tournamentsQuery = supabase
    .from('tournaments')
    .select('tid, total_players, top_cut, start_date')
    .gte('total_players', minSize)
    .eq('is_league', false);

  if (dateRange.start) {
    tournamentsQuery = tournamentsQuery.gte('start_date', dateRange.start);
  }
  if (dateRange.end) {
    tournamentsQuery = tournamentsQuery.lte('start_date', dateRange.end);
  }

  const { data: tournaments } = await tournamentsQuery.limit(10000);
  console.log('Period:', period, 'Date range:', dateRange.start, '-', dateRange.end, 'Min size:', minSize, 'Tournaments found:', tournaments?.length || 0);

  if (!tournaments || tournaments.length === 0) {
    return {
      players: [],
      page,
      perPage,
      period,
      minSize,
      sortBy,
      sortOrder,
      search,
      totalCount: 0,
      totalPages: 0,
      avgElo: null,
      maxElo: null
    };
  }

  const tournamentIds = tournaments.map(t => t.tid);
  const tournamentMap: Record<string, any> = {};
  for (const t of tournaments) {
    tournamentMap[t.tid] = t;
  }

  // Batch fetch entries to avoid .in() limits
  const BATCH_SIZE = 100;
  let entries: any[] = [];
  for (let i = 0; i < tournamentIds.length; i += BATCH_SIZE) {
    const batch = tournamentIds.slice(i, i + BATCH_SIZE);
    const { data: batchEntries, error: batchError } = await supabase
      .from('tournament_entries')
      .select(`
        entry_id,
        player_id,
        tid,
        standing,
        wins,
        losses,
        draws,
        deck_commanders (
          commander_name
        ),
        players (
          player_id,
          player_name,
          openskill_elo,
          openskill_games
        )
      `)
      .in('tid', batch)
      .limit(100000);

    if (batchError) {
      console.error('Error fetching batch:', batchError);
    }
    if (batchEntries) {
      entries = entries.concat(batchEntries);
    }
  }

  // Filter out entries without player data and apply rankedOnly filter
  entries = entries.filter(e => e.players);
  console.log('Entries with player data:', entries.length);
  if (rankedOnly) {
    entries = entries.filter(e => (e.players as any)?.openskill_games >= 10);
    console.log('Entries after rankedOnly filter:', entries.length);
  }

  // Add tournament data to entries
  entries = entries.map(e => ({
    ...e,
    tournaments: tournamentMap[e.tid]
  }));

  const entriesError = null;

  if (entriesError) {
    console.error('Error fetching entries:', entriesError);
    return {
      players: [],
      page,
      perPage,
      period,
      minSize,
      sortBy,
      sortOrder,
      search,
      totalCount: 0,
      totalPages: 0,
      avgElo: null,
      maxElo: null
    };
  }

  // Aggregate stats per player
  const playerMap = new Map<string, {
    player_id: string;
    player_name: string;
    openskill_elo: number | null;
    entries: number;
    wins: number;
    losses: number;
    draws: number;
    conversions: number;
    top4s: number;
    championships: number;
    placement_sum: number;
    commander_counts: Map<string, number>;
  }>();

  for (const entry of entries || []) {
    const player = entry.players as any;
    const tournament = entry.tournaments as any;
    const playerId = player?.player_id;

    if (!playerId) continue;

    if (!playerMap.has(playerId)) {
      playerMap.set(playerId, {
        player_id: playerId,
        player_name: player.player_name,
        openskill_elo: player.openskill_elo,
        entries: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        conversions: 0,
        top4s: 0,
        championships: 0,
        placement_sum: 0,
        commander_counts: new Map()
      });
    }

    const stats = playerMap.get(playerId)!;
    stats.entries++;
    stats.wins += entry.wins || 0;
    stats.losses += entry.losses || 0;
    stats.draws += entry.draws || 0;

    // Conversion (made top cut)
    if (tournament?.top_cut && entry.standing <= tournament.top_cut) {
      stats.conversions++;
    }

    // Top 4
    if (entry.standing <= 4 && tournament?.top_cut) {
      stats.top4s++;
    }

    // Championship
    if (entry.standing === 1) {
      stats.championships++;
    }

    // Placement percentile (100% = 1st place, 0% = last place)
    if (tournament?.total_players && entry.standing) {
      const placementPct = ((tournament.total_players - entry.standing) / (tournament.total_players - 1)) * 100;
      stats.placement_sum += placementPct;
    }

    // Count commander usage
    const commanders = (entry.deck_commanders as any[]) || [];
    const commanderPair = commanders.map((c: any) => c.commander_name).sort().join(' / ');
    if (commanderPair) {
      stats.commander_counts.set(commanderPair, (stats.commander_counts.get(commanderPair) || 0) + 1);
    }
  }

  // Convert to array and calculate derived stats
  let players: PlayerStats[] = Array.from(playerMap.values()).map(stats => {
    // Find main commander
    let mainCommander: string | null = null;
    let maxCount = 0;
    for (const [cmd, count] of stats.commander_counts) {
      if (count > maxCount) {
        maxCount = count;
        mainCommander = cmd;
      }
    }
    const commanderPct = stats.entries > 0 ? (maxCount / stats.entries) * 100 : null;

    return {
      player_id: stats.player_id,
      player_name: stats.player_name,
      openskill_elo: stats.openskill_elo,
      entries: stats.entries,
      wins: stats.wins,
      losses: stats.losses,
      draws: stats.draws,
      conversions: stats.conversions,
      top4s: stats.top4s,
      championships: stats.championships,
      main_commander: mainCommander,
      commander_pct: commanderPct,
      avg_placement_pct: stats.entries > 0 ? stats.placement_sum / stats.entries : null,
      elo_rank: null // Will be calculated after sorting by ELO
    };
  });

  // Filter by minimum entries
  console.log('minEntries param:', minEntries, 'players before filter:', players.length);
  if (minEntries > 1) {
    players = players.filter(p => p.entries >= minEntries);
    console.log('players after minEntries filter:', players.length);
  }

  // Filter by search
  if (search) {
    const searchLower = search.toLowerCase();
    players = players.filter(p => p.player_name.toLowerCase().includes(searchLower));
  }

  // Calculate ELO ranks before other sorting
  const eloSorted = [...players].sort((a, b) => (b.openskill_elo || 0) - (a.openskill_elo || 0));
  eloSorted.forEach((p, idx) => {
    const player = players.find(pl => pl.player_id === p.player_id);
    if (player) player.elo_rank = idx + 1;
  });

  // Sort
  const sortMultiplier = sortOrder === 'desc' ? -1 : 1;
  players.sort((a, b) => {
    let aVal: number | string = 0;
    let bVal: number | string = 0;

    switch (sortBy) {
      case 'player_name':
        return sortMultiplier * a.player_name.localeCompare(b.player_name);
      case 'openskill_elo':
        aVal = a.openskill_elo || 0;
        bVal = b.openskill_elo || 0;
        break;
      case 'entries':
        aVal = a.entries;
        bVal = b.entries;
        break;
      case 'wins':
        aVal = a.wins;
        bVal = b.wins;
        break;
      case 'win_rate': {
        const aTotal = a.wins + a.losses + a.draws;
        const bTotal = b.wins + b.losses + b.draws;
        aVal = aTotal > 0 ? a.wins / aTotal : 0;
        bVal = bTotal > 0 ? b.wins / bTotal : 0;
        break;
      }
      case 'five_swiss': {
        const aTotal = a.wins + a.losses + a.draws;
        const bTotal = b.wins + b.losses + b.draws;
        const aWinRate = aTotal > 0 ? a.wins / aTotal : 0;
        const bWinRate = bTotal > 0 ? b.wins / bTotal : 0;
        const aDrawRate = aTotal > 0 ? a.draws / aTotal : 0;
        const bDrawRate = bTotal > 0 ? b.draws / bTotal : 0;
        aVal = (aWinRate * 5) + (aDrawRate * 1);
        bVal = (bWinRate * 5) + (bDrawRate * 1);
        break;
      }
      case 'conversions':
        aVal = a.conversions;
        bVal = b.conversions;
        break;
      case 'conv_pct':
        aVal = a.entries > 0 ? a.conversions / a.entries : 0;
        bVal = b.entries > 0 ? b.conversions / b.entries : 0;
        break;
      case 'top4s':
        aVal = a.top4s;
        bVal = b.top4s;
        break;
      case 'top4_pct':
        aVal = a.entries > 0 ? a.top4s / a.entries : 0;
        bVal = b.entries > 0 ? b.top4s / b.entries : 0;
        break;
      case 'championships':
        aVal = a.championships;
        bVal = b.championships;
        break;
      case 'champ_pct':
        aVal = a.entries > 0 ? a.championships / a.entries : 0;
        bVal = b.entries > 0 ? b.championships / b.entries : 0;
        break;
      case 'placement_pct':
        aVal = a.avg_placement_pct || 0;
        bVal = b.avg_placement_pct || 0;
        break;
      default:
        aVal = a.openskill_elo || 0;
        bVal = b.openskill_elo || 0;
    }

    return sortMultiplier * ((aVal as number) - (bVal as number));
  });

  const totalCount = players.length;
  const totalPages = Math.ceil(totalCount / perPage);

  // Paginate
  const paginatedPlayers = players.slice(offset, offset + perPage);

  // Calculate ELO stats
  const eloValues = players.map(p => p.openskill_elo).filter(e => e != null) as number[];
  const avgElo = eloValues.length > 0 ? eloValues.reduce((a, b) => a + b, 0) / eloValues.length : null;
  const maxElo = eloValues.length > 0 ? Math.max(...eloValues) : null;

  return {
    players: paginatedPlayers,
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
    periodStart: dateRange.start,
    periodEnd: dateRange.end,
    periodLabel: dateRange.label
  };
};
