import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';

export const supabase = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);

// Type definitions for our database tables
export interface Commander {
  commander_pair: string;
  entries: number;
  unique_pilots: number;
  total_wins: number;
  total_losses: number;
  total_draws: number;
  win_rate: number;
  conversions: number;
  conversion_rate: number;
  top4s: number;
  top4_rate: number;
  championships: number;
  champ_rate: number;
  avg_standing: number;
}

export interface Tournament {
  tid: string;
  tournament_name: string;
  start_date: string;
  total_players: number;
  swiss_rounds: number;
  top_cut: number;
}

export interface Player {
  player_id: string;
  player_name: string;
  openskill_elo: number;
  openskill_games: number;
  tournament_count: number;
  total_wins: number;
  total_losses: number;
  total_draws: number;
}
