CREATE TABLE club_dataset (schema_version VARCHAR, competition VARCHAR, season VARCHAR);
INSERT INTO club_dataset VALUES ('clubs-v1', 'La Liga', '2015/2016');
CREATE TABLE clubs (team_id BIGINT PRIMARY KEY, name VARCHAR NOT NULL UNIQUE);
CREATE TABLE players (player_id BIGINT PRIMARY KEY, name VARCHAR NOT NULL, display_name VARCHAR);
CREATE TABLE matches (
    match_id BIGINT PRIMARY KEY, match_date DATE NOT NULL, competition VARCHAR, season VARCHAR,
    home_team VARCHAR, away_team VARCHAR, duration_seconds DOUBLE CHECK (duration_seconds > 0),
    raw_event_count INTEGER, source_url VARCHAR, source_revision VARCHAR
);
CREATE TABLE rosters (
    match_id BIGINT REFERENCES matches(match_id), player_id BIGINT REFERENCES players(player_id),
    team_id BIGINT REFERENCES clubs(team_id), shirt_number INTEGER,
    PRIMARY KEY (match_id, player_id), UNIQUE (match_id, player_id, team_id)
);
CREATE TABLE stints (
    match_id BIGINT, player_id BIGINT, team_id BIGINT, position VARCHAR,
    start_seconds DOUBLE, end_seconds DOUBLE,
    CHECK (start_seconds >= 0 AND end_seconds > start_seconds),
    PRIMARY KEY (match_id, player_id, start_seconds),
    FOREIGN KEY (match_id, player_id, team_id) REFERENCES rosters(match_id, player_id, team_id)
);
CREATE TABLE events (
    event_id VARCHAR PRIMARY KEY, match_id BIGINT, player_id BIGINT, team_id BIGINT,
    shots INTEGER, npxg DOUBLE, key_passes INTEGER, completed_passes INTEGER,
    successful_dribbles INTEGER, tackles_won INTEGER, source_event JSON,
    FOREIGN KEY (match_id, player_id, team_id) REFERENCES rosters(match_id, player_id, team_id)
);
CREATE TABLE sources (url VARCHAR PRIMARY KEY, sha256 VARCHAR, retrieved_at TIMESTAMPTZ, cache_path VARCHAR, bytes BIGINT);

CREATE VIEW club_players AS
WITH membership AS (
    SELECT team_id, player_id, count(*) AS roster_appearances FROM rosters GROUP BY team_id, player_id
), playing_time AS (
    SELECT team_id, player_id, sum(end_seconds - start_seconds) / 60 AS minutes,
           count(DISTINCT match_id) AS appearances FROM stints GROUP BY team_id, player_id
), positions AS (
    SELECT team_id, player_id, position, sum(end_seconds - start_seconds) AS seconds,
           row_number() OVER (PARTITION BY team_id, player_id ORDER BY sum(end_seconds - start_seconds) DESC, position) AS choice
    FROM stints GROUP BY team_id, player_id, position
)
SELECT membership.*, players.name, coalesce(players.display_name, players.name) AS display_name,
       clubs.name AS team, positions.position,
       coalesce(playing_time.minutes, 0) AS minutes, coalesce(playing_time.appearances, 0) AS appearances,
       NULL::INTEGER AS age, NULL::DATE AS birth_date,
       (SELECT min(match_date) FROM matches) AS reference_date
FROM membership JOIN players USING (player_id) JOIN clubs USING (team_id)
LEFT JOIN playing_time USING (team_id, player_id)
LEFT JOIN positions ON positions.team_id = membership.team_id AND positions.player_id = membership.player_id AND choice = 1;

CREATE VIEW club_metrics AS
WITH totals AS (
    SELECT club_players.team_id, club_players.player_id,
           coalesce(sum(shots), 0)::DOUBLE AS shots, coalesce(sum(npxg), 0) AS npxg,
           coalesce(sum(key_passes), 0)::DOUBLE AS key_passes,
           coalesce(sum(completed_passes), 0)::DOUBLE AS completed_passes,
           coalesce(sum(successful_dribbles), 0)::DOUBLE AS successful_dribbles,
           coalesce(sum(tackles_won), 0)::DOUBLE AS tackles_won
    FROM club_players LEFT JOIN events USING (team_id, player_id)
    GROUP BY club_players.team_id, club_players.player_id
), metric_totals AS (
    UNPIVOT totals ON shots, npxg, key_passes, completed_passes, successful_dribbles, tackles_won
    INTO NAME metric VALUE total
)
SELECT metric_totals.*, 90 * total / nullif(minutes, 0) AS per90,
       NULL::DOUBLE AS percentile, NULL::INTEGER AS peer_count,
       'historical_cohort_unavailable' AS evidence_status
FROM metric_totals JOIN club_players USING (team_id, player_id);