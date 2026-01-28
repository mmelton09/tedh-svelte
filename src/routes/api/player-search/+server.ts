import { json } from '@sveltejs/kit';
import { supabase } from '$lib/supabase';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
  const query = url.searchParams.get('q') || '';

  if (query.length < 2) {
    return json([]);
  }

  const { data, error } = await supabase
    .from('players')
    .select('player_name, player_id')
    .ilike('player_name', `%${query}%`)
    .order('player_name')
    .limit(10);

  if (error) {
    console.error('Player search error:', error);
    return json([]);
  }

  return json(data || []);
};
