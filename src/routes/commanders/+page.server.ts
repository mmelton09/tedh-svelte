import { supabase } from '$lib/supabase';
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
  const { data: topCommander } = await supabase
    .from('commander_stats')
    .select('commander_pair')
    .eq('period', '1m')
    .eq('min_size', 50)
    .eq('data_type', 'all')
    .gte('entries', 5)
    .order('conversion_rate', { ascending: false })
    .limit(1)
    .single();

  if (topCommander?.commander_pair) {
    throw redirect(307, `/commanders/${encodeURIComponent(topCommander.commander_pair)}`);
  }

  const { data: fallback } = await supabase
    .from('commander_stats')
    .select('commander_pair')
    .eq('period', '1m')
    .eq('min_size', 50)
    .eq('data_type', 'all')
    .order('entries', { ascending: false })
    .limit(1)
    .single();

  if (fallback?.commander_pair) {
    throw redirect(307, `/commanders/${encodeURIComponent(fallback.commander_pair)}`);
  }

  return {};
};
