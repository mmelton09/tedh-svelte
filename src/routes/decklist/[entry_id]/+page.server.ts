import { supabase } from '$lib/supabase';
import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ params }) => {
  const entryId = params.entry_id;

  const { data: entry, error: entryError } = await supabase
    .from('tournament_entries')
    .select(`
      entry_id,
      standing,
      wins,
      losses,
      draws,
      decklist,
      tid,
      players (
        player_id,
        player_name
      ),
      tournaments (
        tid,
        tournament_name,
        start_date
      )
    `)
    .eq('entry_id', entryId)
    .single();

  if (entryError || !entry) {
    throw error(404, 'Decklist not found');
  }

  // Parse the decklist into sections
  const decklist = entry.decklist || '';
  const sections: { name: string; cards: string[] }[] = [];

  let currentSection = '';
  let currentCards: string[] = [];

  for (const line of decklist.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith('~~') && trimmed.endsWith('~~')) {
      // New section
      if (currentSection && currentCards.length > 0) {
        sections.push({ name: currentSection, cards: currentCards });
      }
      currentSection = trimmed.replace(/~~/g, '');
      currentCards = [];
    } else if (currentSection) {
      currentCards.push(trimmed);
    }
  }

  // Push last section
  if (currentSection && currentCards.length > 0) {
    sections.push({ name: currentSection, cards: currentCards });
  }

  const player = entry.players as any;
  const tournament = entry.tournaments as any;

  return {
    entry: {
      entry_id: entry.entry_id,
      standing: entry.standing,
      wins: entry.wins,
      losses: entry.losses,
      draws: entry.draws,
      tid: entry.tid,
    },
    player: {
      player_id: player?.player_id,
      player_name: player?.player_name,
    },
    tournament: {
      tid: tournament?.tid,
      tournament_name: tournament?.tournament_name,
      start_date: tournament?.start_date,
    },
    sections,
    rawDecklist: decklist,
  };
};
