import { supabase } from '$lib/supabase';
import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';

// Fetch card images from Scryfall API
async function getCardImages(cardName: string): Promise<{ art: string | null; full: string | null }> {
  try {
    const response = await fetch(
      `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(cardName)}`
    );
    if (!response.ok) return { art: null, full: null };
    const data = await response.json();

    // Handle double-faced cards
    if (data.card_faces && data.card_faces[0]?.image_uris) {
      return {
        art: data.card_faces[0].image_uris?.art_crop || data.card_faces[0].image_uris?.normal || null,
        full: data.card_faces[0].image_uris?.large || data.card_faces[0].image_uris?.normal || null
      };
    }

    return {
      art: data.image_uris?.art_crop || data.image_uris?.normal || null,
      full: data.image_uris?.large || data.image_uris?.normal || null
    };
  } catch {
    return { art: null, full: null };
  }
}

// Calculate date range from period string (matching Flask get_time_range)
function getDateRange(period: string): { start: string; end: string; label: string } {
  const now = new Date();
  const end = now.toISOString().split('T')[0];

  switch (period) {
    case 'all':
      return { start: '2020-01-01', end, label: 'All Time' };

    case 'post_ban':
      return { start: '2024-09-23', end, label: 'Post-RC Era' };

    case 'last_week': {
      // Get last complete week (Mon-Sun)
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

    case '30d':
    case '1m': {
      const thirtyDays = new Date(now);
      thirtyDays.setDate(thirtyDays.getDate() - 30);
      return { start: thirtyDays.toISOString().split('T')[0], end, label: 'Last 30 Days' };
    }

    case '90d':
    case '3m': {
      const threeMonths = new Date(now);
      threeMonths.setMonth(threeMonths.getMonth() - 3);
      return { start: threeMonths.toISOString().split('T')[0], end, label: 'Last 3 Months' };
    }

    case '6mo':
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

export const load: PageServerLoad = async ({ params, url }) => {
  const commanderName = decodeURIComponent(params.name);
  const minSize = parseInt(url.searchParams.get('min_size') || '16') || 16;
  const period = url.searchParams.get('period') || '1y';
  const page = parseInt(url.searchParams.get('page') || '1') || 1;
  const perPage = 50;
  const sortBy = url.searchParams.get('sort') || 'placement_pct';
  const sortOrder = url.searchParams.get('order') || 'desc';

  const dateRange = getDateRange(period);
  const names = commanderName.split(' / ').map(n => n.trim());

  // Fetch card images from Scryfall (in parallel)
  const cardImagesPromise = Promise.all(
    names.map(async (name) => {
      const images = await getCardImages(name);
      return { name, art: images.art, full: images.full };
    })
  );

  // Get color identity from commanders table
  const colorIdentityPromise = (async () => {
    let colorIdentity = '';
    for (const name of names) {
      const { data: cmdData } = await supabase
        .from('commanders')
        .select('color_identity')
        .eq('commander_name', name)
        .single();
      if (cmdData?.color_identity) {
        [...cmdData.color_identity].forEach(c => {
          if (!colorIdentity.includes(c)) colorIdentity += c;
        });
      }
    }
    // Sort colors in WUBRG order
    const colorOrder = 'WUBRGC';
    return [...colorIdentity].sort((a, b) =>
      colorOrder.indexOf(a) - colorOrder.indexOf(b)
    ).join('');
  })();

  // Try to use RPC for aggregated pilot data (much more efficient)
  const { data: rpcPilots, error: rpcError } = await supabase.rpc('get_commander_pilots', {
    p_commander_name: commanderName,
    p_start_date: dateRange.start,
    p_end_date: dateRange.end,
    p_min_size: minSize,
    p_sort_by: sortBy,
    p_sort_order: sortOrder,
    p_page: page,
    p_per_page: perPage
  });

  let pilots: any[] = [];
  let totalPilots = 0;
  let totalPages = 1;
  let usedRpc = false;

  console.log('RPC result:', { rpcError: rpcError?.message, rpcPilotsCount: rpcPilots?.length });
  if (!rpcError && rpcPilots && rpcPilots.length > 0) {
    // RPC worked - use its data
    usedRpc = true;
    totalPilots = rpcPilots[0]?.total_count || rpcPilots.length;
    totalPages = Math.ceil(totalPilots / perPage);

    // Get tournament details for pilots on current page
    const playerIds = rpcPilots.map((p: any) => p.player_id);

    const { data: tournamentData } = await supabase.rpc('get_commander_pilot_tournaments', {
      p_commander_name: commanderName,
      p_start_date: dateRange.start,
      p_end_date: dateRange.end,
      p_min_size: minSize,
      p_player_ids: playerIds
    });

    // Group tournaments by player_id
    const playerTournaments: Record<string, any[]> = {};
    for (const t of tournamentData || []) {
      if (!playerTournaments[t.player_id]) {
        playerTournaments[t.player_id] = [];
      }
      playerTournaments[t.player_id].push({
        tid: t.tid,
        tournament_name: t.tournament_name,
        start_date: t.start_date,
        standing: t.standing,
        total_players: t.total_players,
        wins: t.wins,
        losses: t.losses,
        draws: t.draws,
        decklist: t.decklist
      });
    }

    pilots = rpcPilots.map((p: any) => ({
      player_id: p.player_id,
      player_name: p.player_name,
      openskill_elo: p.openskill_elo,
      entries: Number(p.entries),
      total_wins: Number(p.total_wins),
      total_losses: Number(p.total_losses),
      total_draws: Number(p.total_draws),
      conversions: Number(p.conversions),
      top4s: Number(p.top4s),
      championships: Number(p.championships),
      win_rate: Number(p.win_rate) || 0,
      five_swiss: Number(p.five_swiss) || null,
      conversion_rate: Number(p.conversion_rate) || 0,
      top4_rate: Number(p.top4_rate) || 0,
      champ_rate: Number(p.champ_rate) || 0,
      conv_vs_expected: Number(p.conv_vs_expected) || 0,
      top4_vs_expected: Number(p.top4_vs_expected) || 0,
      champ_vs_expected: Number(p.champ_vs_expected) || 0,
      avg_placement_pct: Number(p.placement_pct) || 0,
      tournaments: playerTournaments[p.player_id] || []
    }));
  } else {
    // Fallback: fetch entries and aggregate in JavaScript
    // This is less efficient but works without the RPC
    console.log('RPC not available, falling back to JS aggregation:', rpcError?.message);

    let entriesQuery = supabase
      .from('tournament_entries')
      .select(`
        entry_id,
        player_id,
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
        ),
        players!inner (
          player_id,
          player_name,
          openskill_elo
        )
      `)
      .gte('tournaments.total_players', minSize)
      .eq('tournaments.is_league', false)
      .gte('tournaments.start_date', dateRange.start)
      .lte('tournaments.start_date', dateRange.end)
      .limit(10000); // Increase limit to get more data

    const { data: entries, error: entriesError } = await entriesQuery;

    if (entriesError) {
      console.error('Error fetching entries:', entriesError);
    }

    // Filter to only entries matching this commander pair
    console.log('Fallback: entries fetched:', entries?.length, 'commanderName:', commanderName);
    const matchingEntries = (entries || []).filter(entry => {
      const commanders = (entry.deck_commanders as any[]) || [];
      const commanderPair = commanders
        .map((c: any) => c.commander_name)
        .sort()
        .join(' / ');
      return commanderPair === commanderName;
    });
    console.log('Fallback: matching entries:', matchingEntries.length);

    // Aggregate pilots
    const pilotMap: Record<string, any> = {};

    for (const entry of matchingEntries) {
      const player = entry.players as any;
      const tournament = entry.tournaments as any;
      const playerId = player?.player_id;
      if (!playerId) continue;

      if (!pilotMap[playerId]) {
        pilotMap[playerId] = {
          player_id: playerId,
          player_name: player.player_name,
          openskill_elo: player.openskill_elo,
          entries: 0,
          total_wins: 0,
          total_losses: 0,
          total_draws: 0,
          conversions: 0,
          top4s: 0,
          championships: 0,
          placement_sum: 0,
          expected_conv: 0,
          expected_top4: 0,
          expected_champ: 0,
          tournaments: []
        };
      }

      const stats = pilotMap[playerId];
      stats.entries++;
      stats.total_wins += entry.wins || 0;
      stats.total_losses += entry.losses || 0;
      stats.total_draws += entry.draws || 0;

      const totalPlayers = tournament?.total_players || 1;

      // Accumulate expected values based on tournament size
      if (tournament?.top_cut && tournament.top_cut > 0) {
        stats.expected_conv += tournament.top_cut / totalPlayers;
        if (tournament.top_cut >= 4) {
          stats.expected_top4 += 4.0 / totalPlayers;
        }
      }
      stats.expected_champ += 1.0 / totalPlayers;

      if (tournament?.top_cut && entry.standing <= tournament.top_cut) {
        stats.conversions++;
      }
      if (entry.standing <= 4 && tournament?.top_cut && tournament.top_cut >= 4) {
        stats.top4s++;
      }
      if (entry.standing === 1) {
        stats.championships++;
      }

      // Calculate placement percentile for AvgX%
      if (tournament?.total_players && entry.standing) {
        const placementPct = 100 * (1 - entry.standing / tournament.total_players);
        stats.placement_sum += placementPct;
      }

      // Add tournament to player's tournament list
      stats.tournaments.push({
        tid: tournament?.tid,
        tournament_name: tournament?.tournament_name,
        start_date: tournament?.start_date,
        standing: entry.standing,
        total_players: tournament?.total_players,
        wins: entry.wins || 0,
        losses: entry.losses || 0,
        draws: entry.draws || 0,
        decklist: entry.decklist
      });
    }

    // Calculate rates and vs_expected values
    const allPilots = Object.values(pilotMap).map((stats: any) => {
      const totalGames = stats.total_wins + stats.total_losses + stats.total_draws;
      const winRate = totalGames > 0 ? stats.total_wins / totalGames : 0;
      const drawRate = totalGames > 0 ? stats.total_draws / totalGames : 0;
      const convRate = stats.entries > 0 ? stats.conversions / stats.entries : 0;
      const top4Rate = stats.entries > 0 ? stats.top4s / stats.entries : 0;
      const champRate = stats.entries > 0 ? stats.championships / stats.entries : 0;

      // Calculate vs expected: ((actual - expected) / entries) * 100
      const convVsExpected = stats.entries > 0
        ? ((stats.conversions - stats.expected_conv) / stats.entries) * 100
        : 0;
      const top4VsExpected = stats.entries > 0
        ? ((stats.top4s - stats.expected_top4) / stats.entries) * 100
        : 0;
      const champVsExpected = stats.entries > 0
        ? ((stats.championships - stats.expected_champ) / stats.entries) * 100
        : 0;

      // Sort tournaments by date descending
      stats.tournaments.sort((a: any, b: any) =>
        new Date(b.start_date || 0).getTime() - new Date(a.start_date || 0).getTime()
      );

      return {
        ...stats,
        win_rate: winRate,
        five_swiss: totalGames >= 7 ? (winRate * 5) + (drawRate * 1) : null,
        avg_placement_pct: stats.entries > 0 ? stats.placement_sum / stats.entries : null,
        conversion_rate: convRate,
        top4_rate: top4Rate,
        champ_rate: champRate,
        conv_vs_expected: convVsExpected,
        top4_vs_expected: top4VsExpected,
        champ_vs_expected: champVsExpected
      };
    });

    // Sort pilots based on sortBy and sortOrder
    const sortMultiplier = sortOrder === 'desc' ? -1 : 1;
    allPilots.sort((a, b) => {
      let aVal: number | string | null;
      let bVal: number | string | null;

      switch (sortBy) {
        case 'name':
          return sortMultiplier * a.player_name.localeCompare(b.player_name);
        case 'elo':
          aVal = a.openskill_elo || 0;
          bVal = b.openskill_elo || 0;
          break;
        case 'entries':
          aVal = a.entries;
          bVal = b.entries;
          break;
        case 'win_rate':
          aVal = a.win_rate;
          bVal = b.win_rate;
          break;
        case 'five_swiss':
          aVal = a.five_swiss || 0;
          bVal = b.five_swiss || 0;
          break;
        case 'conversions':
          aVal = a.conversions;
          bVal = b.conversions;
          break;
        case 'conv_rate':
          aVal = a.conversion_rate;
          bVal = b.conversion_rate;
          break;
        case 'top4_rate':
          aVal = a.top4_rate;
          bVal = b.top4_rate;
          break;
        case 'champ_rate':
          aVal = a.champ_rate;
          bVal = b.champ_rate;
          break;
        case 'placement_pct':
        default:
          aVal = a.avg_placement_pct || 0;
          bVal = b.avg_placement_pct || 0;
      }
      return sortMultiplier * ((bVal as number) - (aVal as number));
    });

    // Pagination
    totalPilots = allPilots.length;
    totalPages = Math.ceil(totalPilots / perPage);
    pilots = allPilots.slice((page - 1) * perPage, page * perPage);
  }

  // Get commander summary stats (for the summary section)
  // Try precomputed table first
  const precomputedPeriodMap: Record<string, string> = {
    '30d': '30d', '1m': '30d',
    '90d': '90d', '3m': '90d',
    '6mo': '6mo', '6m': '6mo',
    '1y': '1y',
    'all': 'all'
  };
  const precomputedPeriod = precomputedPeriodMap[period];

  let summary: any = null;
  if (precomputedPeriod) {
    const { data: summaryStats } = await supabase
      .from('commander_summary')
      .select('*')
      .eq('commander_pair', commanderName)
      .eq('period', precomputedPeriod)
      .eq('min_size', minSize)
      .single();
    summary = summaryStats;
  }

  // If no precomputed summary, calculate from pilots data
  if (!summary && pilots.length > 0) {
    const totalEntries = pilots.reduce((sum, p) => sum + p.entries, 0);
    const totalWins = pilots.reduce((sum, p) => sum + p.total_wins, 0);
    const totalLosses = pilots.reduce((sum, p) => sum + p.total_losses, 0);
    const totalDraws = pilots.reduce((sum, p) => sum + p.total_draws, 0);
    const totalGames = totalWins + totalLosses + totalDraws;
    const conversions = pilots.reduce((sum, p) => sum + p.conversions, 0);
    const top4s = pilots.reduce((sum, p) => sum + p.top4s, 0);
    const championships = pilots.reduce((sum, p) => sum + p.championships, 0);

    summary = {
      commander_pair: commanderName,
      entries: totalEntries,
      unique_pilots: totalPilots,
      total_wins: totalWins,
      total_losses: totalLosses,
      total_draws: totalDraws,
      win_rate: totalGames > 0 ? totalWins / totalGames : 0,
      conversions,
      conversion_rate: totalEntries > 0 ? conversions / totalEntries : 0,
      top4s,
      top4_rate: totalEntries > 0 ? top4s / totalEntries : 0,
      championships,
      champ_rate: totalEntries > 0 ? championships / totalEntries : 0
    };
  }

  if (!summary && pilots.length === 0) {
    throw error(404, 'Commander not found');
  }

  // Wait for parallel operations
  const [cardImages, colorIdentity] = await Promise.all([cardImagesPromise, colorIdentityPromise]);

  // Calculate weekly trends for chart (last 6 months)
  const monthlyTrends = await calculateWeeklyTrends(commanderName, minSize);

  return {
    commanderName,
    colorIdentity,
    cardImages,
    minSize,
    period,
    page,
    perPage,
    totalPilots,
    totalPages,
    sortBy,
    sortOrder,
    summary: summary || {
      commander_pair: commanderName,
      entries: 0,
      win_rate: 0,
      conversion_rate: 0,
      top4_rate: 0,
      champ_rate: 0
    },
    pilots,
    monthlyTrends,
    periodStart: dateRange.start,
    periodEnd: dateRange.end,
    periodLabel: dateRange.label
  };
};

// Calculate weekly trends for the chart (always last 6 months)
async function calculateWeeklyTrends(commanderName: string, minSize: number) {
  const now = new Date();
  const sixMonthsAgo = new Date(now);
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  // Helper to get Monday of the week
  function getWeekMonday(date: Date): Date {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function weekKey(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  // Generate all weeks for last 6 months
  const allWeeks: Date[] = [];
  let currentWeek = getWeekMonday(sixMonthsAgo);
  const endWeek = getWeekMonday(now);

  while (currentWeek <= endWeek) {
    allWeeks.push(new Date(currentWeek));
    currentWeek.setDate(currentWeek.getDate() + 7);
  }

  // Initialize all weeks with zero data
  const weeklyData: Record<string, any> = {};
  for (const week of allWeeks) {
    weeklyData[weekKey(week)] = {
      weekStart: week,
      entries: 0,
      conversions: 0,
      top4s: 0,
      championships: 0,
      wins: 0,
      losses: 0,
      draws: 0
    };
  }

  // Fetch chart data
  const { data: chartEntries } = await supabase
    .from('tournament_entries')
    .select(`
      entry_id,
      standing,
      wins,
      losses,
      draws,
      tournaments!inner (
        tid,
        start_date,
        total_players,
        top_cut
      ),
      deck_commanders (
        commander_name
      )
    `)
    .gte('tournaments.total_players', minSize)
    .eq('tournaments.is_league', false)
    .gte('tournaments.start_date', sixMonthsAgo.toISOString().split('T')[0])
    .limit(10000);

  // Filter to this commander and populate weekly data
  for (const entry of chartEntries || []) {
    const commanders = (entry.deck_commanders as any[]) || [];
    const commanderPair = commanders
      .map((c: any) => c.commander_name)
      .sort()
      .join(' / ');

    if (commanderPair !== commanderName) continue;

    const tournament = entry.tournaments as any;
    if (!tournament?.start_date) continue;

    const date = new Date(tournament.start_date);
    const monday = getWeekMonday(date);
    const key = weekKey(monday);

    if (weeklyData[key]) {
      weeklyData[key].entries++;
      weeklyData[key].wins += entry.wins || 0;
      weeklyData[key].losses += entry.losses || 0;
      weeklyData[key].draws += entry.draws || 0;

      if (tournament.top_cut && entry.standing <= tournament.top_cut) {
        weeklyData[key].conversions++;
      }
      if (entry.standing <= 4 && tournament.top_cut >= 4) {
        weeklyData[key].top4s++;
      }
      if (entry.standing === 1) {
        weeklyData[key].championships++;
      }
    }
  }

  // Convert to sorted array
  const sortedWeeks = Object.values(weeklyData).sort((a: any, b: any) =>
    a.weekStart.getTime() - b.weekStart.getTime()
  );

  let lastMonth = '';
  const weeklyStats = sortedWeeks.map((d: any) => {
    const totalGames = d.wins + d.losses + d.draws;
    const winRate = totalGames > 0 ? d.wins / totalGames : 0;
    const convRate = d.entries > 0 ? d.conversions / d.entries : 0;
    const top4Rate = d.entries > 0 ? d.top4s / d.entries : 0;
    const champRate = d.entries > 0 ? d.championships / d.entries : 0;
    const monthName = d.weekStart.toLocaleDateString('en-US', { month: 'short' });

    let label: string;
    if (monthName !== lastMonth) {
      label = monthName;
      lastMonth = monthName;
    } else {
      label = d.weekStart.getDate().toString();
    }

    return {
      label,
      fullLabel: d.weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      entries: d.entries,
      conversions: d.conversions,
      top4s: d.top4s,
      championships: d.championships,
      wins: d.wins,
      losses: d.losses,
      draws: d.draws,
      winRate,
      convRate,
      top4Rate,
      champRate
    };
  });

  // Calculate 4-week rolling averages
  return weeklyStats.map((week, i) => {
    const windowStart = Math.max(0, i - 3);
    const window = weeklyStats.slice(windowStart, i + 1);

    const totalEntries = window.reduce((sum, w) => sum + w.entries, 0);
    const totalConv = window.reduce((sum, w) => sum + w.conversions, 0);
    const totalTop4 = window.reduce((sum, w) => sum + w.top4s, 0);
    const totalChamp = window.reduce((sum, w) => sum + w.championships, 0);
    const totalWins = window.reduce((sum, w) => sum + w.wins, 0);
    const totalLosses = window.reduce((sum, w) => sum + w.losses, 0);
    const totalDraws = window.reduce((sum, w) => sum + w.draws, 0);
    const totalGames = totalWins + totalLosses + totalDraws;

    const avgEntries = window.reduce((sum, w) => sum + w.entries, 0) / window.length;
    const avgWinRate = totalGames > 0 ? totalWins / totalGames : 0;
    const avgConvRate = totalEntries > 0 ? totalConv / totalEntries : 0;
    const avgTop4Rate = totalEntries > 0 ? totalTop4 / totalEntries : 0;
    const avgChampRate = totalEntries > 0 ? totalChamp / totalEntries : 0;

    return {
      label: week.label,
      fullLabel: week.fullLabel,
      entries: avgEntries,
      winRate: avgWinRate,
      winVsExpected: (avgWinRate - 0.25) * 100,
      convRate: avgConvRate,
      convVsExpected: (avgConvRate - 0.25) * 100,
      top4Rate: avgTop4Rate,
      top4VsExpected: (avgTop4Rate - 0.25) * 100,
      champRate: avgChampRate,
      champVsExpected: (avgChampRate - 0.25) * 100
    };
  });
}
