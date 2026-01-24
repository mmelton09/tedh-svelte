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
  const rankedOnly = url.searchParams.get('ranked') === 'true';
  const dataType = rankedOnly ? 'ranked' : 'all';

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
      .eq('min_size', precalcMinSize)
      .eq('data_type', dataType);

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

  // Get commander summary stats directly from commander_stats table
  let summary: any = null;
  if (precalcPeriod) {
    const { data: statsData } = await supabase
      .from('commander_stats')
      .select('*')
      .eq('commander_pair', commanderName)
      .eq('period', precalcPeriod)
      .eq('min_size', precalcMinSize)
      .eq('data_type', dataType)
      .single();

    if (statsData) {
      summary = {
        commander_pair: commanderName,
        entries: statsData.entries,
        unique_pilots: statsData.unique_pilots,
        total_wins: statsData.total_wins,
        total_losses: statsData.total_losses,
        total_draws: statsData.total_draws,
        win_rate: Number(statsData.win_rate) || 0,
        conversions: statsData.conversions,
        conversion_rate: Number(statsData.conversion_rate) || 0,
        top4s: statsData.top4s,
        top4_rate: Number(statsData.top4_rate) || 0,
        championships: statsData.championships,
        champ_rate: Number(statsData.champ_rate) || 0,
        conv_vs_expected: Number(statsData.conv_vs_expected) || 0,
        top4_vs_expected: Number(statsData.top4_vs_expected) || 0,
        champ_vs_expected: Number(statsData.champ_vs_expected) || 0
      };
    }
  }

  if (!summary && pilots.length === 0) {
    throw error(404, 'Commander not found');
  }

  // Wait for parallel operations
  const [cardImages, colorIdentity] = await Promise.all([cardImagesPromise, colorIdentityPromise]);

  // Get weekly trends from precalc table
  const monthlyTrends = await getWeeklyTrends(commanderName, precalcMinSize, dataType);

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

// Get weekly trends from precalculated table
async function getWeeklyTrends(commanderName: string, minSize: number, dataType: string) {
  // Fetch precalculated weekly data
  const { data: weeklyData } = await supabase
    .from('commander_trends')
    .select('*')
    .eq('commander_pair', commanderName)
    .eq('min_size', minSize)
    .eq('data_type', dataType)
    .order('week_start', { ascending: true })
    .limit(100);

  // Generate all weeks for last 6 months (to fill gaps)
  const now = new Date();
  const sixMonthsAgo = new Date(now);
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  function getWeekMonday(date: Date): Date {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  const allWeeks: Date[] = [];
  let currentWeek = getWeekMonday(sixMonthsAgo);
  const endWeek = getWeekMonday(now);

  while (currentWeek <= endWeek) {
    allWeeks.push(new Date(currentWeek));
    currentWeek.setDate(currentWeek.getDate() + 7);
  }

  // Create a map of existing data
  const dataMap: Record<string, any> = {};
  for (const row of weeklyData || []) {
    dataMap[row.week_start] = row;
  }

  // Build weekly stats with zeros for missing weeks
  let lastMonth = '';
  const weeklyStats = allWeeks.map((weekStart) => {
    const key = weekStart.toISOString().split('T')[0];
    const row = dataMap[key];
    const monthName = weekStart.toLocaleDateString('en-US', { month: 'short' });

    let label: string;
    if (monthName !== lastMonth) {
      label = monthName;
      lastMonth = monthName;
    } else {
      label = weekStart.getDate().toString();
    }

    if (row) {
      const totalGames = row.wins + row.losses + row.draws;
      return {
        label,
        fullLabel: weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        entries: row.entries,
        conversions: row.conversions,
        top4s: row.top4s,
        championships: row.championships,
        wins: row.wins,
        losses: row.losses,
        draws: row.draws,
        winRate: totalGames > 0 ? row.wins / totalGames : 0,
        convRate: row.entries > 0 ? row.conversions / row.entries : 0,
        top4Rate: row.entries > 0 ? row.top4s / row.entries : 0,
        champRate: row.entries > 0 ? row.championships / row.entries : 0
      };
    }

    return {
      label,
      fullLabel: weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      entries: 0,
      conversions: 0,
      top4s: 0,
      championships: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      winRate: 0,
      convRate: 0,
      top4Rate: 0,
      champRate: 0
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
