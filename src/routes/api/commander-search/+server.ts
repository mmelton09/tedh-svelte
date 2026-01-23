import { json } from '@sveltejs/kit';
import { supabase } from '$lib/supabase';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
  const query = url.searchParams.get('q') || '';

  if (query.length < 2) {
    return json([]);
  }

  // Search for commander pairs in the commander_stats table
  const { data, error } = await supabase
    .from('commander_stats')
    .select('commander_pair')
    .ilike('commander_pair', `%${query}%`)
    .eq('period', 'all')
    .eq('min_size', 50)
    .order('entries', { ascending: false })
    .limit(20);

  if (error) {
    console.error('Commander search error:', error);
    return json([]);
  }

  // Deduplicate and return
  const uniqueCommanders = [...new Set(data?.map(d => d.commander_pair) || [])];
  return json(uniqueCommanders.slice(0, 10));
};
