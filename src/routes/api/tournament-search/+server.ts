import { json } from '@sveltejs/kit';
import { supabase } from '$lib/supabase';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
  const query = url.searchParams.get('q') || '';

  if (query.length < 2) {
    return json([]);
  }

  const { data, error } = await supabase
    .from('tournaments')
    .select('tid, tournament_name, total_players, start_date')
    .ilike('tournament_name', `%${query}%`)
    .order('start_date', { ascending: false })
    .limit(10);

  if (error) {
    console.error('Tournament search error:', error);
    return json([]);
  }

  return json(data || []);
};
