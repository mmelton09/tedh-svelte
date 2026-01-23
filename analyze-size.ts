import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

// Parse .env.local manually
const envContent = readFileSync('.env.local', 'utf-8');
const env: Record<string, string> = {};
for (const line of envContent.split('\n')) {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, '');
  }
}

const supabase = createClient(
  env.PUBLIC_SUPABASE_URL,
  env.PUBLIC_SUPABASE_ANON_KEY
);

async function analyze() {
  // Fetch in batches to avoid timeout
  console.log('Fetching tournament data...');

  // First get all tournaments
  const { data: tournaments, error: tError } = await supabase
    .from('tournaments')
    .select('tid, total_players, top_cut')
    .eq('is_league', false)
    .gte('total_players', 16)
    .limit(10000);

  if (tError || !tournaments) {
    console.error('Error fetching tournaments:', tError);
    return;
  }

  console.log('Tournaments: ' + tournaments.length);

  const tournamentMap: Record<string, { total_players: number; top_cut: number }> = {};
  for (const t of tournaments) {
    tournamentMap[t.tid] = { total_players: t.total_players, top_cut: t.top_cut };
  }

  // Fetch entries in batches
  const tids = tournaments.map(t => t.tid);
  const BATCH_SIZE = 50;
  let entries: any[] = [];

  for (let i = 0; i < tids.length; i += BATCH_SIZE) {
    const batch = tids.slice(i, i + BATCH_SIZE);
    const { data: batchEntries, error: eError } = await supabase
      .from('tournament_entries')
      .select('player_id, wins, losses, draws, standing, tid')
      .in('tid', batch)
      .or('wins.gt.0,losses.gt.0,draws.gt.0')
      .limit(50000);

    if (eError) {
      console.error('Error fetching entries batch:', eError);
      continue;
    }
    if (batchEntries) {
      entries = entries.concat(batchEntries);
    }
    if (i % 500 === 0) {
      console.log('  Fetched ' + entries.length + ' entries...');
    }
  }

  // Add tournament data to entries
  const enrichedEntries = entries.map(e => ({
    ...e,
    tournaments: tournamentMap[e.tid]
  })).filter(e => e.tournaments);

  console.log('Total entries: ' + enrichedEntries.length);

  // Use enrichedEntries instead of entries
  const processEntries = enrichedEntries;

  // Group by player and tournament size bucket
  const playerStats: Record<string, {
    small: { wins: number; losses: number; draws: number; entries: number; convs: number; top4s: number; champs: number };
    large: { wins: number; losses: number; draws: number; entries: number; convs: number; top4s: number; champs: number };
  }> = {};

  for (const entry of processEntries) {
    const t = entry.tournaments as any;
    const playerId = entry.player_id;
    const isLarge = t.total_players >= 100;

    if (!playerStats[playerId]) {
      playerStats[playerId] = {
        small: { wins: 0, losses: 0, draws: 0, entries: 0, convs: 0, top4s: 0, champs: 0 },
        large: { wins: 0, losses: 0, draws: 0, entries: 0, convs: 0, top4s: 0, champs: 0 }
      };
    }

    const bucket = isLarge ? 'large' : 'small';
    playerStats[playerId][bucket].wins += entry.wins || 0;
    playerStats[playerId][bucket].losses += entry.losses || 0;
    playerStats[playerId][bucket].draws += entry.draws || 0;
    playerStats[playerId][bucket].entries += 1;

    if (t.top_cut && entry.standing <= t.top_cut) {
      playerStats[playerId][bucket].convs += 1;
    }
    if (entry.standing <= 4 && t.top_cut >= 4) {
      playerStats[playerId][bucket].top4s += 1;
    }
    if (entry.standing === 1) {
      playerStats[playerId][bucket].champs += 1;
    }
  }

  // Find players with data in BOTH small and large events
  const playersWithBoth = Object.entries(playerStats).filter(([_, stats]) =>
    stats.small.entries >= 3 && stats.large.entries >= 3
  );

  console.log('\nPlayers with 3+ entries in both small (<100) and large (100+) events: ' + playersWithBoth.length);

  // Calculate correlation between small and large event performance
  const dataPoints = playersWithBoth.map(([playerId, stats]) => {
    const smallGames = stats.small.wins + stats.small.losses + stats.small.draws;
    const largeGames = stats.large.wins + stats.large.losses + stats.large.draws;
    const smallWinRate = smallGames > 0 ? stats.small.wins / smallGames : 0;
    const largeWinRate = largeGames > 0 ? stats.large.wins / largeGames : 0;
    const smallConvRate = stats.small.entries > 0 ? stats.small.convs / stats.small.entries : 0;
    const largeConvRate = stats.large.entries > 0 ? stats.large.convs / stats.large.entries : 0;

    return {
      playerId,
      smallWinRate,
      largeWinRate,
      smallConvRate,
      largeConvRate,
      smallEntries: stats.small.entries,
      largeEntries: stats.large.entries,
      smallGames,
      largeGames
    };
  });

  // Pearson correlation coefficient
  function pearson(x: number[], y: number[]): number {
    const n = x.length;
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((acc, xi, i) => acc + xi * y[i], 0);
    const sumX2 = x.reduce((acc, xi) => acc + xi * xi, 0);
    const sumY2 = y.reduce((acc, yi) => acc + yi * yi, 0);

    const num = n * sumXY - sumX * sumY;
    const den = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
    return den === 0 ? 0 : num / den;
  }

  const winRateCorr = pearson(
    dataPoints.map(d => d.smallWinRate),
    dataPoints.map(d => d.largeWinRate)
  );

  const convRateCorr = pearson(
    dataPoints.map(d => d.smallConvRate),
    dataPoints.map(d => d.largeConvRate)
  );

  console.log('\n=== CORRELATION: Small Event Performance → Large Event Performance ===');
  console.log('Win Rate correlation: ' + winRateCorr.toFixed(3));
  console.log('Conversion Rate correlation: ' + convRateCorr.toFixed(3));

  // Now look at "high-perf lowXP" players specifically
  const allPlayers = Object.entries(playerStats).map(([playerId, stats]) => {
    const totalGames = stats.small.wins + stats.small.losses + stats.small.draws +
                       stats.large.wins + stats.large.losses + stats.large.draws;
    const totalWins = stats.small.wins + stats.large.wins;
    const totalEntries = stats.small.entries + stats.large.entries;
    return {
      playerId,
      totalGames,
      totalEntries,
      totalWinRate: totalGames > 0 ? totalWins / totalGames : 0,
      smallStats: stats.small,
      largeStats: stats.large
    };
  });

  // High-perf lowXP: win rate > 30% but < 30 total games
  const highPerfLowXP = allPlayers.filter(p =>
    p.totalWinRate > 0.30 && p.totalGames >= 10 && p.totalGames < 30
  );

  console.log('\n=== HIGH-PERF LOW-XP PLAYERS (>30% WR, 10-30 games) ===');
  console.log('Count: ' + highPerfLowXP.length);

  // Of these, how many have large event experience?
  const highPerfWithLarge = highPerfLowXP.filter(p => p.largeStats.entries > 0);
  console.log('With 100+ event experience: ' + highPerfWithLarge.length);

  if (highPerfWithLarge.length > 0) {
    // Compare their small vs large performance
    let smallWRSum = 0, largeWRSum = 0, count = 0;
    for (const p of highPerfWithLarge) {
      const smallGames = p.smallStats.wins + p.smallStats.losses + p.smallStats.draws;
      const largeGames = p.largeStats.wins + p.largeStats.losses + p.largeStats.draws;
      if (smallGames > 0 && largeGames > 0) {
        smallWRSum += p.smallStats.wins / smallGames;
        largeWRSum += p.largeStats.wins / largeGames;
        count++;
      }
    }
    if (count > 0) {
      console.log('\nHigh-Perf LowXP players with BOTH small and large event data:');
      console.log('  Count: ' + count);
      console.log('  Avg win rate at small events: ' + (smallWRSum / count * 100).toFixed(1) + '%');
      console.log('  Avg win rate at large events: ' + (largeWRSum / count * 100).toFixed(1) + '%');
      console.log('  Difference: ' + ((largeWRSum - smallWRSum) / count * 100).toFixed(1) + ' pp');
    }
  }

  // High-XP players comparison
  const highXP = allPlayers.filter(p => p.totalGames >= 50);
  const highXPWithBoth = highXP.filter(p =>
    p.smallStats.entries >= 3 && p.largeStats.entries >= 3
  );

  console.log('\n=== HIGH-XP PLAYERS (50+ games) with both small and large event data ===');
  console.log('Count: ' + highXPWithBoth.length);

  if (highXPWithBoth.length > 5) {
    const highXPData = highXPWithBoth.map(p => {
      const smallGames = p.smallStats.wins + p.smallStats.losses + p.smallStats.draws;
      const largeGames = p.largeStats.wins + p.largeStats.losses + p.largeStats.draws;
      return {
        smallWR: smallGames > 0 ? p.smallStats.wins / smallGames : 0,
        largeWR: largeGames > 0 ? p.largeStats.wins / largeGames : 0
      };
    });

    const highXPCorr = pearson(
      highXPData.map(d => d.smallWR),
      highXPData.map(d => d.largeWR)
    );
    console.log('Win rate correlation (small→large): ' + highXPCorr.toFixed(3));

    const avgSmall = highXPData.reduce((s, d) => s + d.smallWR, 0) / highXPData.length;
    const avgLarge = highXPData.reduce((s, d) => s + d.largeWR, 0) / highXPData.length;
    console.log('Avg small event WR: ' + (avgSmall * 100).toFixed(1) + '%');
    console.log('Avg large event WR: ' + (avgLarge * 100).toFixed(1) + '%');
  }

  // NEW: Look at tournament size brackets more granularly
  console.log('\n=== WIN RATE BY TOURNAMENT SIZE BRACKET ===');

  const brackets = [
    { name: '16-29', min: 16, max: 29 },
    { name: '30-49', min: 30, max: 49 },
    { name: '50-99', min: 50, max: 99 },
    { name: '100-199', min: 100, max: 199 },
    { name: '200+', min: 200, max: 9999 }
  ];

  for (const bracket of brackets) {
    let totalWins = 0, totalGames = 0, totalEntries = 0;
    for (const entry of processEntries) {
      const t = entry.tournaments as any;
      if (t.total_players >= bracket.min && t.total_players <= bracket.max) {
        totalWins += entry.wins || 0;
        totalGames += (entry.wins || 0) + (entry.losses || 0) + (entry.draws || 0);
        totalEntries++;
      }
    }
    const avgWR = totalGames > 0 ? (totalWins / totalGames * 100).toFixed(1) : 'N/A';
    console.log(bracket.name + ': ' + avgWR + '% WR (' + totalEntries + ' entries, ' + totalGames + ' games)');
  }
}

analyze();
