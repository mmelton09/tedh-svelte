-- Drop old functions first
DROP FUNCTION IF EXISTS get_commander_pilots(text, date, date, int, text, text, int, int);
DROP FUNCTION IF EXISTS get_commander_pilot_tournaments(text, date, date, int, uuid[]);
DROP FUNCTION IF EXISTS get_commander_pilot_tournaments(text, date, date, int, text[]);

-- RPC function to get aggregated pilot stats for a commander
-- Fixed: player_id is text, not uuid
CREATE OR REPLACE FUNCTION get_commander_pilots(
  p_commander_name text,
  p_start_date date DEFAULT '2020-01-01',
  p_end_date date DEFAULT CURRENT_DATE,
  p_min_size int DEFAULT 16,
  p_sort_by text DEFAULT 'placement_pct',
  p_sort_order text DEFAULT 'desc',
  p_page int DEFAULT 1,
  p_per_page int DEFAULT 50
)
RETURNS TABLE (
  player_id text,
  player_name text,
  openskill_elo double precision,
  entries bigint,
  total_wins bigint,
  total_losses bigint,
  total_draws bigint,
  conversions bigint,
  top4s bigint,
  championships bigint,
  win_rate numeric,
  five_swiss numeric,
  conversion_rate numeric,
  top4_rate numeric,
  champ_rate numeric,
  expected_conv numeric,
  expected_top4 numeric,
  expected_champ numeric,
  conv_vs_expected numeric,
  top4_vs_expected numeric,
  champ_vs_expected numeric,
  placement_pct numeric,
  total_count bigint
) AS $$
DECLARE
  v_offset int;
  v_order_col text;
  v_order_dir text;
BEGIN
  v_offset := (p_page - 1) * p_per_page;

  -- Validate sort column
  v_order_col := CASE p_sort_by
    WHEN 'name' THEN 'player_name'
    WHEN 'elo' THEN 'openskill_elo'
    WHEN 'entries' THEN 'entries'
    WHEN 'win_rate' THEN 'win_rate'
    WHEN 'five_swiss' THEN 'five_swiss'
    WHEN 'conversions' THEN 'conversions'
    WHEN 'conv_rate' THEN 'conversion_rate'
    WHEN 'top4_rate' THEN 'top4_rate'
    WHEN 'champ_rate' THEN 'champ_rate'
    WHEN 'placement_pct' THEN 'placement_pct'
    ELSE 'placement_pct'
  END;

  v_order_dir := CASE WHEN LOWER(p_sort_order) = 'asc' THEN 'ASC' ELSE 'DESC' END;

  RETURN QUERY EXECUTE format('
    WITH commander_entries AS (
      SELECT
        te.player_id,
        te.entry_id,
        STRING_AGG(dc.commander_name, '' / '' ORDER BY dc.commander_name) as commander_pair,
        te.wins,
        te.losses,
        te.draws,
        te.standing,
        te.decklist,
        t.tid,
        t.tournament_name,
        t.start_date,
        t.top_cut,
        t.total_players
      FROM tournament_entries te
      JOIN deck_commanders dc ON te.entry_id = dc.entry_id
      JOIN tournaments t ON te.tid = t.tid
      WHERE t.start_date >= $1
        AND t.start_date <= $2
        AND t.total_players >= $3
        AND t.is_league = false
      GROUP BY te.player_id, te.entry_id, te.wins, te.losses, te.draws,
               te.standing, te.decklist, t.tid, t.tournament_name, t.start_date, t.top_cut, t.total_players
    ),
    filtered_entries AS (
      SELECT * FROM commander_entries
      WHERE commander_pair = $4
    ),
    player_stats AS (
      SELECT
        ce.player_id,
        p.player_name,
        p.openskill_elo,
        COUNT(*)::bigint as entries,
        SUM(ce.wins)::bigint as total_wins,
        SUM(ce.losses)::bigint as total_losses,
        SUM(ce.draws)::bigint as total_draws,
        COUNT(*) FILTER (WHERE ce.standing <= ce.top_cut AND ce.top_cut > 0)::bigint as conversions,
        COUNT(*) FILTER (WHERE ce.standing <= 4 AND ce.top_cut >= 4)::bigint as top4s,
        COUNT(*) FILTER (WHERE ce.standing = 1)::bigint as championships,
        ROUND(CAST(SUM(ce.wins) AS DECIMAL) / NULLIF(SUM(ce.wins + ce.losses + ce.draws), 0), 4)::numeric as win_rate,
        ROUND(
          (CAST(SUM(ce.wins) AS DECIMAL) / NULLIF(SUM(ce.wins + ce.losses + ce.draws), 0) * 5) +
          (CAST(SUM(ce.draws) AS DECIMAL) / NULLIF(SUM(ce.wins + ce.losses + ce.draws), 0) * 1),
        2)::numeric as five_swiss,
        ROUND(CAST(COUNT(*) FILTER (WHERE ce.standing <= ce.top_cut AND ce.top_cut > 0) AS DECIMAL) / NULLIF(COUNT(*), 0), 4)::numeric as conversion_rate,
        ROUND(CAST(COUNT(*) FILTER (WHERE ce.standing <= 4 AND ce.top_cut >= 4) AS DECIMAL) / NULLIF(COUNT(*), 0), 4)::numeric as top4_rate,
        ROUND(CAST(COUNT(*) FILTER (WHERE ce.standing = 1) AS DECIMAL) / NULLIF(COUNT(*), 0), 4)::numeric as champ_rate,
        SUM(CASE WHEN ce.top_cut > 0 THEN CAST(ce.top_cut AS DECIMAL) / ce.total_players ELSE 0 END)::numeric as expected_conv,
        SUM(CASE WHEN ce.top_cut >= 4 THEN 4.0 / ce.total_players ELSE 0 END)::numeric as expected_top4,
        SUM(1.0 / ce.total_players)::numeric as expected_champ,
        ROUND((100.0 * (1.0 - SUM(ce.standing)::float / NULLIF(SUM(ce.total_players), 0)))::numeric, 1)::numeric as placement_pct,
        COUNT(*) OVER()::bigint as total_count
      FROM filtered_entries ce
      JOIN players p ON ce.player_id = p.player_id
      GROUP BY ce.player_id, p.player_name, p.openskill_elo
    )
    SELECT
      ps.player_id::text,
      ps.player_name::text,
      ps.openskill_elo::double precision,
      ps.entries::bigint,
      ps.total_wins::bigint,
      ps.total_losses::bigint,
      ps.total_draws::bigint,
      ps.conversions::bigint,
      ps.top4s::bigint,
      ps.championships::bigint,
      ps.win_rate::numeric,
      ps.five_swiss::numeric,
      ps.conversion_rate::numeric,
      ps.top4_rate::numeric,
      ps.champ_rate::numeric,
      ps.expected_conv::numeric,
      ps.expected_top4::numeric,
      ps.expected_champ::numeric,
      ROUND((ps.conversions - ps.expected_conv) / NULLIF(ps.entries, 0) * 100, 1)::numeric as conv_vs_expected,
      ROUND((ps.top4s - ps.expected_top4) / NULLIF(ps.entries, 0) * 100, 1)::numeric as top4_vs_expected,
      ROUND((ps.championships - ps.expected_champ) / NULLIF(ps.entries, 0) * 100, 1)::numeric as champ_vs_expected,
      ps.placement_pct::numeric,
      ps.total_count::bigint
    FROM player_stats ps
    ORDER BY %I %s, entries DESC
    LIMIT $5 OFFSET $6
  ', v_order_col, v_order_dir)
  USING p_start_date, p_end_date, p_min_size, p_commander_name, p_per_page, v_offset;
END;
$$ LANGUAGE plpgsql STABLE;

-- RPC function to get tournament results for pilots of a commander
CREATE OR REPLACE FUNCTION get_commander_pilot_tournaments(
  p_commander_name text,
  p_start_date date DEFAULT '2020-01-01',
  p_end_date date DEFAULT CURRENT_DATE,
  p_min_size int DEFAULT 16,
  p_player_ids text[] DEFAULT NULL
)
RETURNS TABLE (
  player_id text,
  tid text,
  tournament_name text,
  start_date date,
  standing int,
  total_players int,
  wins int,
  losses int,
  draws int,
  decklist text
) AS $$
BEGIN
  RETURN QUERY
  WITH commander_entries AS (
    SELECT
      te.player_id,
      te.entry_id,
      STRING_AGG(dc.commander_name, ' / ' ORDER BY dc.commander_name) as commander_pair,
      te.wins,
      te.losses,
      te.draws,
      te.standing,
      te.decklist,
      t.tid,
      t.tournament_name,
      t.start_date,
      t.total_players
    FROM tournament_entries te
    JOIN deck_commanders dc ON te.entry_id = dc.entry_id
    JOIN tournaments t ON te.tid = t.tid
    WHERE t.start_date >= p_start_date
      AND t.start_date <= p_end_date
      AND t.total_players >= p_min_size
      AND t.is_league = false
      AND (p_player_ids IS NULL OR te.player_id = ANY(p_player_ids))
    GROUP BY te.player_id, te.entry_id, te.wins, te.losses, te.draws,
             te.standing, te.decklist, t.tid, t.tournament_name, t.start_date, t.total_players
  )
  SELECT
    ce.player_id::text,
    ce.tid::text,
    ce.tournament_name::text,
    ce.start_date::date,
    ce.standing::int,
    ce.total_players::int,
    ce.wins::int,
    ce.losses::int,
    ce.draws::int,
    ce.decklist::text
  FROM commander_entries ce
  WHERE ce.commander_pair = p_commander_name
  ORDER BY ce.start_date DESC;
END;
$$ LANGUAGE plpgsql STABLE;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_commander_pilots TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_commander_pilot_tournaments TO anon, authenticated;
