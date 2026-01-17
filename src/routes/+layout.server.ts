import { supabase } from '$lib/supabase';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async () => {
  // Get the most recent tournament date as a proxy for data freshness
  const { data: latestTournament } = await supabase
    .from('tournaments')
    .select('start_date')
    .order('start_date', { ascending: false })
    .limit(1)
    .single();

  return {
    dataUpdated: latestTournament?.start_date || null
  };
};
