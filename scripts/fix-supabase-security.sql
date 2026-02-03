-- ===========================================
-- Fix all Supabase security warnings
-- Run in Supabase SQL Editor (Dashboard > SQL Editor)
-- ===========================================

-- =====================
-- 1. Enable RLS on all tables and add read-only anon policy
-- =====================

-- Active tables
ALTER TABLE public.commander_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commander_trends ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commander_pilots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leaderboard_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deck_commanders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commanders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inferred_decks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.elo_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.players_legacy_elo ENABLE ROW LEVEL SECURITY;

-- Old/new swap tables
ALTER TABLE public.commander_stats_old ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commander_stats_new ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commander_pilots_old ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commander_pilots_new ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commander_trends_new ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leaderboard_stats_old ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leaderboard_stats_new ENABLE ROW LEVEL SECURITY;

-- Read-only policies for anon role (so the app still works)
CREATE POLICY "anon_read" ON public.commander_stats FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read" ON public.commander_trends FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read" ON public.commander_pilots FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read" ON public.leaderboard_stats FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read" ON public.tournaments FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read" ON public.players FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read" ON public.tournament_entries FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read" ON public.deck_commanders FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read" ON public.commanders FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read" ON public.matches FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read" ON public.match_players FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read" ON public.inferred_decks FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read" ON public.elo_history FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read" ON public.players_legacy_elo FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read" ON public.commander_stats_old FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read" ON public.commander_stats_new FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read" ON public.commander_pilots_old FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read" ON public.commander_pilots_new FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read" ON public.commander_trends_new FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read" ON public.leaderboard_stats_old FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read" ON public.leaderboard_stats_new FOR SELECT TO anon USING (true);

-- Service role needs full access for data pipeline writes
CREATE POLICY "service_full" ON public.commander_stats FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_full" ON public.commander_trends FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_full" ON public.commander_pilots FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_full" ON public.leaderboard_stats FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_full" ON public.tournaments FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_full" ON public.players FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_full" ON public.tournament_entries FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_full" ON public.deck_commanders FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_full" ON public.commanders FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_full" ON public.matches FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_full" ON public.match_players FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_full" ON public.inferred_decks FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_full" ON public.elo_history FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_full" ON public.players_legacy_elo FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_full" ON public.commander_stats_old FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_full" ON public.commander_stats_new FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_full" ON public.commander_pilots_old FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_full" ON public.commander_pilots_new FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_full" ON public.commander_trends_new FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_full" ON public.leaderboard_stats_old FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_full" ON public.leaderboard_stats_new FOR ALL TO service_role USING (true) WITH CHECK (true);

-- =====================
-- 2. Fix SECURITY DEFINER views -> SECURITY INVOKER
-- =====================

-- We need to recreate the views. First check their definitions, then recreate.
-- Using ALTER VIEW to change security property:
ALTER VIEW public.recent_tournaments SET (security_invoker = on);
ALTER VIEW public.commander_metagame SET (security_invoker = on);
ALTER VIEW public.player_statistics SET (security_invoker = on);

-- =====================
-- 3. Fix mutable search_path on functions
-- =====================

ALTER FUNCTION public.swap_commander_trends SET search_path = public;
ALTER FUNCTION public.get_commander_pilots SET search_path = public;
ALTER FUNCTION public.get_commander_pilot_tournaments SET search_path = public;
ALTER FUNCTION public.swap_leaderboard_stats SET search_path = public;
ALTER FUNCTION public.swap_commander_pilots SET search_path = public;
ALTER FUNCTION public.swap_commander_stats SET search_path = public;
