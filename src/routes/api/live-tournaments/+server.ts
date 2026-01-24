import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const TOPDECK_API = 'https://topdeck.gg/api/v2/tournaments';
const API_KEY = '5a688703-4e1d-41ad-ba2d-441487217c88';
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// In-memory cache
const cache: Record<string, { data: any; timestamp: number }> = {};

// Active live tournaments - edit this list as needed
const LIVE_TOURNAMENTS = [
  'the-royal-rumble-the-second-showdown-cedh-12k',
  'breach-the-bay-cedh-10k'
];

async function fetchTournament(tid: string) {
  // Check cache
  const cached = cache[tid];
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return { ...cached.data, fromCache: true };
  }

  try {
    const response = await fetch(`${TOPDECK_API}/${tid}`, {
      headers: {
        'Authorization': API_KEY,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      console.error(`Failed to fetch ${tid}: ${response.status}`);
      return cached?.data || null;
    }

    const raw = await response.json();

    // Extract data from API response
    const tournamentData = raw.data || {};
    const standings = raw.standings || [];
    const rounds = raw.rounds || [];

    // Find current round
    const currentRound = rounds.length > 0 ? rounds[rounds.length - 1] : null;

    // Get top standings
    const topStandings = standings
      .sort((a: any, b: any) => (a.standing || 999) - (b.standing || 999))
      .slice(0, 16)
      .map((s: any) => ({
        standing: s.standing,
        name: s.name,
        wins: s.wins || 0,
        losses: s.losses || 0,
        draws: s.draws || 0,
        commander: s.decklist?.commander || s.commander || null
      }));

    const result = {
      tid,
      name: tournamentData.name || tid,
      totalPlayers: standings.length,
      currentRound: currentRound?.round || null,
      totalRounds: rounds.length,
      topStandings,
      lastUpdated: new Date().toISOString(),
      fromCache: false
    };

    // Update cache
    cache[tid] = { data: result, timestamp: Date.now() };

    return result;
  } catch (error) {
    console.error(`Error fetching ${tid}:`, error);
    return cached?.data || null;
  }
}

export const GET: RequestHandler = async ({ url }) => {
  const tid = url.searchParams.get('tid');

  if (tid) {
    // Fetch specific tournament
    const data = await fetchTournament(tid);
    return json(data || { error: 'Tournament not found' });
  }

  // Fetch all live tournaments
  const results = await Promise.all(
    LIVE_TOURNAMENTS.map(tid => fetchTournament(tid))
  );

  const tournaments = results.filter(Boolean);

  return json({
    tournaments,
    cacheInfo: {
      ttlSeconds: CACHE_TTL / 1000,
      note: 'Data refreshes every 5 minutes'
    }
  });
};
