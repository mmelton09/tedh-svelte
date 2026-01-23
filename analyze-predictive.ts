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

const supabase = createClient(env.PUBLIC_SUPABASE_URL, env.PUBLIC_SUPABASE_ANON_KEY);

interface PlayerData {
  playerId: string;
  wins: number;
  losses: number;
  draws: number;
  games: number;
  entries: number;
  rawWinRate: number;
}

interface PredictionResult {
  method: string;
  correlation: number;
  rmse: number;
  description: string;
}

// Pearson correlation
function pearson(x: number[], y: number[]): number {
  const n = x.length;
  if (n === 0) return 0;
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((acc, xi, i) => acc + xi * y[i], 0);
  const sumX2 = x.reduce((acc, xi) => acc + xi * xi, 0);
  const sumY2 = y.reduce((acc, yi) => acc + yi * yi, 0);
  const num = n * sumXY - sumX * sumY;
  const den = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
  return den === 0 ? 0 : num / den;
}

// RMSE
function rmse(predicted: number[], actual: number[]): number {
  const n = predicted.length;
  if (n === 0) return 0;
  const sumSqErr = predicted.reduce((acc, p, i) => acc + Math.pow(p - actual[i], 2), 0);
  return Math.sqrt(sumSqErr / n);
}

// Wilson Score Lower Bound (95% CI)
function wilsonLower(wins: number, games: number, z = 1.96): number {
  if (games === 0) return 0;
  const p = wins / games;
  const denominator = 1 + z * z / games;
  const centre = p + z * z / (2 * games);
  const adjustment = z * Math.sqrt((p * (1 - p) + z * z / (4 * games)) / games);
  return Math.max(0, (centre - adjustment) / denominator);
}

// Bayesian Regression to Mean
function bayesianWinRate(wins: number, games: number, priorWins: number, priorGames: number): number {
  return (wins + priorWins) / (games + priorGames);
}

// Games-weighted Bayesian (more regression for fewer games)
function gamesWeightedBayesian(wins: number, games: number, targetGames: number = 30): number {
  // Prior is 25% win rate (expected)
  const priorWinRate = 0.25;
  // Weight based on how close to targetGames
  const weight = Math.min(1, games / targetGames);
  const rawRate = games > 0 ? wins / games : priorWinRate;
  return weight * rawRate + (1 - weight) * priorWinRate;
}

async function analyze() {
  console.log('=== PREDICTIVE POWER ANALYSIS ===\n');
  console.log('Fetching data...');

  // Get tournaments sorted by date
  const { data: tournaments, error: tError } = await supabase
    .from('tournaments')
    .select('tid, total_players, top_cut, start_date')
    .eq('is_league', false)
    .gte('total_players', 16)
    .order('start_date', { ascending: true })
    .limit(10000);

  if (tError || !tournaments) {
    console.error('Error:', tError);
    return;
  }

  console.log('Tournaments: ' + tournaments.length);

  // Split into training (first 80%) and test (last 20%)
  const splitIdx = Math.floor(tournaments.length * 0.8);
  const trainTournaments = tournaments.slice(0, splitIdx);
  const testTournaments = tournaments.slice(splitIdx);

  console.log('Training tournaments: ' + trainTournaments.length);
  console.log('Test tournaments: ' + testTournaments.length);

  const trainTids = trainTournaments.map(t => t.tid);
  const testTids = testTournaments.map(t => t.tid);

  // Fetch entries for both sets
  async function fetchEntries(tids: string[]): Promise<any[]> {
    const BATCH_SIZE = 50;
    let entries: any[] = [];
    for (let i = 0; i < tids.length; i += BATCH_SIZE) {
      const batch = tids.slice(i, i + BATCH_SIZE);
      const { data } = await supabase
        .from('tournament_entries')
        .select('player_id, wins, losses, draws, tid')
        .in('tid', batch)
        .or('wins.gt.0,losses.gt.0,draws.gt.0')
        .limit(50000);
      if (data) entries = entries.concat(data);
    }
    return entries;
  }

  console.log('Fetching training entries...');
  const trainEntries = await fetchEntries(trainTids);
  console.log('Training entries: ' + trainEntries.length);

  console.log('Fetching test entries...');
  const testEntries = await fetchEntries(testTids);
  console.log('Test entries: ' + testEntries.length);

  // Aggregate training data by player
  const trainStats: Record<string, PlayerData> = {};
  for (const e of trainEntries) {
    if (!trainStats[e.player_id]) {
      trainStats[e.player_id] = {
        playerId: e.player_id,
        wins: 0, losses: 0, draws: 0, games: 0, entries: 0, rawWinRate: 0
      };
    }
    const p = trainStats[e.player_id];
    p.wins += e.wins || 0;
    p.losses += e.losses || 0;
    p.draws += e.draws || 0;
    p.entries += 1;
  }

  // Calculate derived stats
  for (const p of Object.values(trainStats)) {
    p.games = p.wins + p.losses + p.draws;
    p.rawWinRate = p.games > 0 ? p.wins / p.games : 0;
  }

  // Aggregate test data by player
  const testStats: Record<string, PlayerData> = {};
  for (const e of testEntries) {
    if (!testStats[e.player_id]) {
      testStats[e.player_id] = {
        playerId: e.player_id,
        wins: 0, losses: 0, draws: 0, games: 0, entries: 0, rawWinRate: 0
      };
    }
    const p = testStats[e.player_id];
    p.wins += e.wins || 0;
    p.losses += e.losses || 0;
    p.draws += e.draws || 0;
    p.entries += 1;
  }

  for (const p of Object.values(testStats)) {
    p.games = p.wins + p.losses + p.draws;
    p.rawWinRate = p.games > 0 ? p.wins / p.games : 0;
  }

  // Find players in BOTH training and test with minimum games in each
  const minTrainGames = 10;
  const minTestGames = 5;

  const commonPlayers = Object.keys(trainStats).filter(pid =>
    testStats[pid] &&
    trainStats[pid].games >= minTrainGames &&
    testStats[pid].games >= minTestGames
  );

  console.log('\nPlayers with ' + minTrainGames + '+ train games AND ' + minTestGames + '+ test games: ' + commonPlayers.length);

  // Calculate predictions using different methods and compare to actual test performance
  const results: PredictionResult[] = [];

  // Method 0: Raw Win Rate (baseline)
  {
    const predicted = commonPlayers.map(pid => trainStats[pid].rawWinRate);
    const actual = commonPlayers.map(pid => testStats[pid].rawWinRate);
    results.push({
      method: 'Raw Win Rate',
      correlation: pearson(predicted, actual),
      rmse: rmse(predicted, actual),
      description: 'Simple wins/games from training period'
    });
  }

  // Method 1: Higher game thresholds
  for (const threshold of [10, 15, 20, 30, 40, 50]) {
    const filtered = commonPlayers.filter(pid => trainStats[pid].games >= threshold);
    if (filtered.length < 50) continue;

    const predicted = filtered.map(pid => trainStats[pid].rawWinRate);
    const actual = filtered.map(pid => testStats[pid].rawWinRate);
    results.push({
      method: 'Threshold ' + threshold + '+ games',
      correlation: pearson(predicted, actual),
      rmse: rmse(predicted, actual),
      description: 'Only players with ' + threshold + '+ games (n=' + filtered.length + ')'
    });
  }

  // Method 2: Wilson Score Lower Bound
  {
    const predicted = commonPlayers.map(pid => {
      const p = trainStats[pid];
      return wilsonLower(p.wins, p.games);
    });
    const actual = commonPlayers.map(pid => testStats[pid].rawWinRate);
    results.push({
      method: 'Wilson Lower Bound',
      correlation: pearson(predicted, actual),
      rmse: rmse(predicted, actual),
      description: '95% CI lower bound - penalizes low sample sizes'
    });
  }

  // Method 3: Bayesian Regression (fixed prior)
  for (const priorGames of [5, 10, 20, 30, 50]) {
    const priorWins = priorGames * 0.25; // 25% prior win rate
    const predicted = commonPlayers.map(pid => {
      const p = trainStats[pid];
      return bayesianWinRate(p.wins, p.games, priorWins, priorGames);
    });
    const actual = commonPlayers.map(pid => testStats[pid].rawWinRate);
    results.push({
      method: 'Bayesian (prior=' + priorGames + ' games)',
      correlation: pearson(predicted, actual),
      rmse: rmse(predicted, actual),
      description: 'Add ' + priorGames + ' pseudo-games at 25% WR'
    });
  }

  // Method 4: Games-weighted Bayesian
  for (const targetGames of [20, 30, 40, 50]) {
    const predicted = commonPlayers.map(pid => {
      const p = trainStats[pid];
      return gamesWeightedBayesian(p.wins, p.games, targetGames);
    });
    const actual = commonPlayers.map(pid => testStats[pid].rawWinRate);
    results.push({
      method: 'Weighted Bayesian (target=' + targetGames + ')',
      correlation: pearson(predicted, actual),
      rmse: rmse(predicted, actual),
      description: 'Blend to 25% based on games/' + targetGames
    });
  }

  // Sort by correlation descending
  results.sort((a, b) => b.correlation - a.correlation);

  console.log('\n=== PREDICTION RESULTS (sorted by correlation) ===\n');
  console.log('Method'.padEnd(35) + 'Corr'.padStart(8) + 'RMSE'.padStart(8) + '  Description');
  console.log('-'.repeat(90));
  for (const r of results) {
    console.log(
      r.method.padEnd(35) +
      r.correlation.toFixed(3).padStart(8) +
      r.rmse.toFixed(4).padStart(8) +
      '  ' + r.description
    );
  }

  // Additional analysis: breakdown by experience level
  console.log('\n=== BREAKDOWN BY TRAINING EXPERIENCE LEVEL ===\n');

  const expBrackets = [
    { name: '10-19 games', min: 10, max: 19 },
    { name: '20-29 games', min: 20, max: 29 },
    { name: '30-49 games', min: 30, max: 49 },
    { name: '50-99 games', min: 50, max: 99 },
    { name: '100+ games', min: 100, max: 9999 }
  ];

  for (const bracket of expBrackets) {
    const filtered = commonPlayers.filter(pid => {
      const games = trainStats[pid].games;
      return games >= bracket.min && games <= bracket.max;
    });

    if (filtered.length < 20) {
      console.log(bracket.name + ': insufficient data (n=' + filtered.length + ')');
      continue;
    }

    const rawPred = filtered.map(pid => trainStats[pid].rawWinRate);
    const bayesPred = filtered.map(pid => gamesWeightedBayesian(
      trainStats[pid].wins, trainStats[pid].games, 30
    ));
    const actual = filtered.map(pid => testStats[pid].rawWinRate);

    const rawCorr = pearson(rawPred, actual);
    const bayesCorr = pearson(bayesPred, actual);

    console.log(bracket.name.padEnd(15) +
      'n=' + String(filtered.length).padEnd(5) +
      'Raw corr: ' + rawCorr.toFixed(3).padStart(6) +
      '  Bayesian corr: ' + bayesCorr.toFixed(3).padStart(6) +
      '  Improvement: ' + ((bayesCorr - rawCorr) * 100).toFixed(1) + '%'
    );
  }

  // Show how Bayesian affects rankings
  console.log('\n=== HOW BAYESIAN CHANGES TOP PLAYERS ===\n');

  // Get top 20 by raw win rate vs top 20 by Bayesian
  const allWithBayesian = commonPlayers.map(pid => ({
    playerId: pid,
    games: trainStats[pid].games,
    rawWR: trainStats[pid].rawWinRate,
    bayesWR: gamesWeightedBayesian(trainStats[pid].wins, trainStats[pid].games, 30),
    actualWR: testStats[pid].rawWinRate
  }));

  const top20Raw = [...allWithBayesian]
    .sort((a, b) => b.rawWR - a.rawWR)
    .slice(0, 20);

  const top20Bayes = [...allWithBayesian]
    .sort((a, b) => b.bayesWR - a.bayesWR)
    .slice(0, 20);

  console.log('Top 20 by RAW Win Rate:');
  console.log('Rank  Games   RawWR   BayesWR  ActualWR');
  for (let i = 0; i < top20Raw.length; i++) {
    const p = top20Raw[i];
    console.log(
      String(i + 1).padStart(3) + '   ' +
      String(p.games).padStart(5) + '   ' +
      (p.rawWR * 100).toFixed(1).padStart(5) + '%  ' +
      (p.bayesWR * 100).toFixed(1).padStart(5) + '%  ' +
      (p.actualWR * 100).toFixed(1).padStart(5) + '%'
    );
  }

  console.log('\nTop 20 by BAYESIAN Win Rate:');
  console.log('Rank  Games   RawWR   BayesWR  ActualWR');
  for (let i = 0; i < top20Bayes.length; i++) {
    const p = top20Bayes[i];
    console.log(
      String(i + 1).padStart(3) + '   ' +
      String(p.games).padStart(5) + '   ' +
      (p.rawWR * 100).toFixed(1).padStart(5) + '%  ' +
      (p.bayesWR * 100).toFixed(1).padStart(5) + '%  ' +
      (p.actualWR * 100).toFixed(1).padStart(5) + '%'
    );
  }

  // Compare prediction accuracy of top 20 lists
  const top20RawPredError = top20Raw.reduce((sum, p) => sum + Math.abs(p.rawWR - p.actualWR), 0) / 20;
  const top20BayesPredError = top20Bayes.reduce((sum, p) => sum + Math.abs(p.bayesWR - p.actualWR), 0) / 20;

  console.log('\nTop 20 Prediction Error (MAE):');
  console.log('  Raw WR rankings: ' + (top20RawPredError * 100).toFixed(2) + ' pp');
  console.log('  Bayesian rankings: ' + (top20BayesPredError * 100).toFixed(2) + ' pp');
}

analyze();
