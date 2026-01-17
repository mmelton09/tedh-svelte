import { supabase } from '$lib/supabase';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
  const minSize = parseInt(url.searchParams.get('min_size') || '16');
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = 50;
  const offset = (page - 1) * limit;

  const { data: tournaments, error, count } = await supabase
    .from('tournaments')
    .select('*', { count: 'exact' })
    .gte('total_players', minSize)
    .order('start_date', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error('Error fetching tournaments:', error);
    return { tournaments: [], minSize, page, totalPages: 1 };
  }

  const totalPages = Math.ceil((count || 0) / limit);

  return {
    tournaments: tournaments || [],
    minSize,
    page,
    totalPages
  };
};
