import { supabase } from '$lib/supabase';
import type { LayoutServerLoad } from './$types';

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))
  ]);
}

export const load: LayoutServerLoad = async () => {
  const result = await withTimeout(
    supabase
      .from('tournaments')
      .select('start_date')
      .order('start_date', { ascending: false })
      .limit(1)
      .single(),
    5000
  );

  return {
    dataUpdated: result?.data?.start_date || null
  };
};
