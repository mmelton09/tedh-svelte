-- RPC function to get aggregated pilot stats for a commander
-- This mirrors the Flask implementation's CTE-based aggregation

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
  player_id uuid,
  player_name text,
  openskill_elo numeric,
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
        COUNT(*) as entries,
        SUM(ce.wins) as total_wins,
        SUM(ce.losses) as total_losses,
        SUM(ce.draws) as total_draws,
        COUNT(*) FILTER (WHERE ce.standing <= ce.top_cut AND ce.top_cut > 0) as conversions,
        COUNT(*) FILTER (WHERE ce.standing <= 4 AND ce.top_cut >= 4) as top4s,
        COUNT(*) FILTER (WHERE ce.standing = 1) as championships,
        ROUND(CAST(SUM(ce.wins) AS DECIMAL) / NULLIF(SUM(ce.wins + ce.losses + ce.draws), 0), 4) as win_rate,
        ROUND(
          (CAST(SUM(ce.wins) AS DECIMAL) / NULLIF(SUM(ce.wins + ce.losses + ce.draws), 0) * 5) +
          (CAST(SUM(ce.draws) AS DECIMAL) / NULLIF(SUM(ce.wins + ce.losses + ce.draws), 0) * 1),
        2) as five_swiss,
        ROUND(CAST(COUNT(*) FILTER (WHERE ce.standing <= ce.top_cut AND ce.top_cut > 0) AS DECIMAL) / NULLIF(COUNT(*), 0), 4) as conversion_rate,
        ROUND(CAST(COUNT(*) FILTER (WHERE ce.standing <= 4 AND ce.top_cut >= 4) AS DECIMAL) / NULLIF(COUNT(*), 0), 4) as top4_rate,
        ROUND(CAST(COUNT(*) FILTER (WHERE ce.standing = 1) AS DECIMAL) / NULLIF(COUNT(*), 0), 4) as champ_rate,
        SUM(CASE WHEN ce.top_cut > 0 THEN CAST(ce.top_cut AS DECIMAL) / ce.total_players ELSE 0 END) as expected_conv,
        SUM(CASE WHEN ce.top_cut >= 4 THEN 4.0 / ce.total_players ELSE 0 END) as expected_top4,
        SUM(1.0 / ce.total_players) as expected_champ,
        ROUND((100.0 * (1.0 - SUM(ce.standing)::float / NULLIF(SUM(ce.total_players), 0)))::numeric, 1) as placement_pct,
        COUNT(*) OVER() as total_count
      FROM filtered_entries ce
      JOIN players p ON ce.player_id = p.player_id
      GROUP BY ce.player_id, p.player_name, p.openskill_elo
    )
    SELECT
      ps.player_id,
      ps.player_name,
      ps.openskill_elo,
      ps.entries,
      ps.total_wins,
      ps.total_losses,
      ps.total_draws,
      ps.conversions,
      ps.top4s,
      ps.championships,
      ps.win_rate,
      ps.five_swiss,
      ps.conversion_rate,
      ps.top4_rate,
      ps.champ_rate,
      ps.expected_conv,
      ps.expected_top4,
      ps.expected_champ,
      ROUND((ps.conversions - ps.expected_conv) / NULLIF(ps.entries, 0) * 100, 1) as conv_vs_expected,
      ROUND((ps.top4s - ps.expected_top4) / NULLIF(ps.entries, 0) * 100, 1) as top4_vs_expected,
      ROUND((ps.championships - ps.expected_champ) / NULLIF(ps.entries, 0) * 100, 1) as champ_vs_expected,
      ps.placement_pct,
      ps.total_count
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
  p_player_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (
  player_id uuid,
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
    ce.player_id,
    ce.tid,
    ce.tournament_name,
    ce.start_date,
    ce.standing,
    ce.total_players,
    ce.wins,
    ce.losses,
    ce.draws,
    ce.decklist
  FROM commander_entries ce
  WHERE ce.commander_pair = p_commander_name
  ORDER BY ce.start_date DESC;
END;
$$ LANGUAGE plpgsql STABLE;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_commander_pilots TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_commander_pilot_tournaments TO anon, authenticated;
