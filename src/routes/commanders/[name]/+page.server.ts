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

// Map URL periods to precalc periods
const PRECALC_PERIODS: Record<string, string> = {
  'all': 'all',
  '1y': '1y',
  '6m': '6m',
  '6mo': '6m',
  '3m': '3m',
  '90d': '3m',
  '1m': '1m',
  '30d': '1m',
  'post_ban': 'post_ban',
};

// Valid min sizes in precalc table
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

// Calculate date range for displaying in UI and for live queries
function getDateRange(period: string): { start: string; end: string; label: string } {
  const now = new Date();
  const end = now.toISOString().split('T')[0];

  switch (period) {
    case 'all':
      return { start: '2020-01-01', end, label: 'All Time' };

    case 'post_ban':
      return { start: '2024-09-23', end, label: 'Post-RC Era' };

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

  // Map to precalc period
  const precalcPeriod = PRECALC_PERIODS[period];
  const precalcMinSize = getClosestMinSize(minSize);

  let pilots: any[] = [];
  let totalPilots = 0;
  let totalPages = 1;

  // Map sortBy to column names in precalc table
  const sortColumnMap: Record<string, string> = {
    'placement_pct': 'avg_placement_pct',
    'name': 'player_name',
    'elo': 'openskill_elo',
    'entries': 'entries',
    'win_rate': 'win_rate',
    'five_swiss': 'five_swiss',
    'conversions': 'conversions',
    'conv_rate': 'conversion_rate',
    'top4_rate': 'top4_rate',
    'champ_rate': 'champ_rate',
  };
  const sortColumn = sortColumnMap[sortBy] || 'avg_placement_pct';

  if (precalcPeriod) {
    // Use precalculated table for fast queries
    let query = supabase
      .from('commander_pilots')
      .select('*', { count: 'exact' })
      .eq('commander_pair', commanderName)
      .eq('period', precalcPeriod)
      .eq('min_size', precalcMinSize);

    // Apply sorting
    const ascending = sortOrder === 'asc';
    query = query.order(sortColumn, { ascending, nullsFirst: false });

    // Secondary sort by entries for ties
    if (sortColumn !== 'entries') {
      query = query.order('entries', { ascending: false });
    }

    // Apply pagination
    const offset = (page - 1) * perPage;
    query = query.range(offset, offset + perPage - 1);

    const { data: precalcPilots, error: precalcError, count } = await query;

    if (!precalcError && precalcPilots) {
      totalPilots = count || 0;
      totalPages = Math.ceil(totalPilots / perPage);

      pilots = precalcPilots.map((p: any) => ({
        player_id: p.player_id,
        player_name: p.player_name,
        openskill_elo: p.openskill_elo,
        entries: p.entries,
        total_wins: p.total_wins,
        total_losses: p.total_losses,
        total_draws: p.total_draws,
        conversions: p.conversions,
        top4s: p.top4s,
        championships: p.championships,
        win_rate: Number(p.win_rate) || 0,
        five_swiss: p.five_swiss ? Number(p.five_swiss) : null,
        conversion_rate: Number(p.conversion_rate) || 0,
        top4_rate: Number(p.top4_rate) || 0,
        champ_rate: Number(p.champ_rate) || 0,
        conv_vs_expected: Number(p.conv_vs_expected) || 0,
        top4_vs_expected: Number(p.top4_vs_expected) || 0,
        champ_vs_expected: Number(p.champ_vs_expected) || 0,
        avg_placement_pct: Number(p.avg_placement_pct) || 0,
        tournaments: [] // Tournament details fetched on-demand via API
      }));
    } else {
      console.error('Error fetching from precalc table:', precalcError?.message);
    }
  }

  // Get commander summary stats from the precalc pilots table
  // Aggregate all pilots for this commander to get accurate totals
  let summary: any = null;
  if (precalcPeriod && totalPilots > 0) {
    // Get all pilots to calculate summary (but don't return all in response)
    const { data: allPilotsForSummary } = await supabase
      .from('commander_pilots')
      .select('entries, total_wins, total_losses, total_draws, conversions, top4s, championships')
      .eq('commander_pair', commanderName)
      .eq('period', precalcPeriod)
      .eq('min_size', precalcMinSize)
      .limit(10000);

    if (allPilotsForSummary && allPilotsForSummary.length > 0) {
      const totalEntries = allPilotsForSummary.reduce((sum, p) => sum + (p.entries || 0), 0);
      const totalWins = allPilotsForSummary.reduce((sum, p) => sum + (p.total_wins || 0), 0);
      const totalLosses = allPilotsForSummary.reduce((sum, p) => sum + (p.total_losses || 0), 0);
      const totalDraws = allPilotsForSummary.reduce((sum, p) => sum + (p.total_draws || 0), 0);
      const totalGames = totalWins + totalLosses + totalDraws;
      const conversions = allPilotsForSummary.reduce((sum, p) => sum + (p.conversions || 0), 0);
      const top4s = allPilotsForSummary.reduce((sum, p) => sum + (p.top4s || 0), 0);
      const championships = allPilotsForSummary.reduce((sum, p) => sum + (p.championships || 0), 0);

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
