CREATE TABLE settings (
    reference_date DATE, min_minutes DOUBLE, min_peers INTEGER,
    stronger_minutes DOUBLE, stronger_peers INTEGER, methodology_version VARCHAR
);
INSERT INTO settings VALUES (NULL, 180, 5, 450, 10, 'stage1-v1');

CREATE TABLE matches (
    match_id BIGINT PRIMARY KEY, match_date DATE NOT NULL,
    competition VARCHAR, season VARCHAR, home_team VARCHAR, away_team VARCHAR,
    duration_seconds DOUBLE CHECK (duration_seconds > 0), raw_event_count INTEGER,
    source_url VARCHAR, source_revision VARCHAR
);
CREATE TABLE players (
    player_id BIGINT PRIMARY KEY, name VARCHAR NOT NULL, display_name VARCHAR,
    team_id BIGINT, team VARCHAR, shirt_number INTEGER,
    birth_date DATE, birth_source_name VARCHAR, birth_source_url VARCHAR,
    birth_source_sha256 VARCHAR, birth_match_method VARCHAR
);
CREATE TABLE stints (
    match_id BIGINT REFERENCES matches(match_id), player_id BIGINT REFERENCES players(player_id),
    team_id BIGINT, position VARCHAR, start_seconds DOUBLE, end_seconds DOUBLE,
    CHECK (start_seconds >= 0 AND end_seconds > start_seconds),
    PRIMARY KEY (match_id, player_id, start_seconds)
);
CREATE TABLE events (
    event_id VARCHAR PRIMARY KEY, match_id BIGINT REFERENCES matches(match_id),
    player_id BIGINT REFERENCES players(player_id), team_id BIGINT,
    shots INTEGER, npxg DOUBLE, key_passes INTEGER, completed_passes INTEGER,
    successful_dribbles INTEGER, tackles_won INTEGER, source_event JSON
);
CREATE TABLE sources (
    url VARCHAR PRIMARY KEY, sha256 VARCHAR, retrieved_at TIMESTAMPTZ,
    cache_path VARCHAR, bytes BIGINT
);

CREATE VIEW player_summary AS
WITH position_time AS (
    SELECT player_id, position, sum(end_seconds - start_seconds) AS seconds
    FROM stints GROUP BY player_id, position
), main_position AS (
    SELECT player_id, position, seconds,
           row_number() OVER (PARTITION BY player_id ORDER BY seconds DESC, position) AS choice
    FROM position_time
), playing_time AS (
    SELECT player_id, sum(end_seconds - start_seconds) / 60.0 AS minutes,
           count(DISTINCT match_id) AS appearances FROM stints GROUP BY player_id
), aged AS (
    SELECT players.*, settings.reference_date,
           date_part('year', age(settings.reference_date, birth_date))::INTEGER AS age
    FROM players CROSS JOIN settings
)
SELECT aged.*, main_position.position,
       coalesce(playing_time.minutes, 0.0) AS minutes,
       coalesce(playing_time.appearances, 0) AS appearances,
       CASE WHEN playing_time.minutes > 0 THEN main_position.seconds / (playing_time.minutes * 60)
            ELSE NULL END AS main_position_share,
       CASE WHEN age IS NULL THEN NULL WHEN age < 20 THEN 'U20'
            WHEN age <= 23 THEN '20-23' WHEN age <= 29 THEN '24-29' ELSE '30+' END AS age_band
FROM aged LEFT JOIN main_position ON aged.player_id = main_position.player_id AND main_position.choice = 1
LEFT JOIN playing_time ON aged.player_id = playing_time.player_id;

CREATE VIEW metric_totals AS
WITH totals AS (
    SELECT players.player_id, coalesce(sum(shots), 0)::DOUBLE AS shots,
           coalesce(sum(npxg), 0) AS npxg,
           coalesce(sum(key_passes), 0)::DOUBLE AS key_passes,
           coalesce(sum(completed_passes), 0)::DOUBLE AS completed_passes,
           coalesce(sum(successful_dribbles), 0)::DOUBLE AS successful_dribbles,
           coalesce(sum(tackles_won), 0)::DOUBLE AS tackles_won
    FROM players LEFT JOIN events USING (player_id) GROUP BY players.player_id
)
UNPIVOT totals ON shots, npxg, key_passes, completed_passes, successful_dribbles, tackles_won
INTO NAME metric VALUE total;

CREATE VIEW player_metrics AS
WITH rates AS (
    SELECT player_summary.*, metric_totals.metric, metric_totals.total,
           90.0 * metric_totals.total / nullif(player_summary.minutes, 0) AS per90
    FROM player_summary JOIN metric_totals USING (player_id)
), eligible AS (
    SELECT rates.* FROM rates CROSS JOIN settings
    WHERE rates.minutes >= settings.min_minutes AND rates.age IS NOT NULL AND rates.position IS NOT NULL
), ranks AS (
    SELECT player_id, metric, position, age_band,
           rank() OVER (PARTITION BY position, age_band, metric ORDER BY round(per90, 8)) AS lower_rank,
           count(*) OVER (PARTITION BY position, age_band, metric, round(per90, 8)) AS ties,
           count(*) OVER (PARTITION BY position, age_band, metric) AS peers
    FROM eligible
), cohorts AS (
    SELECT position, age_band, count(*) AS peer_count
    FROM player_summary CROSS JOIN settings
    WHERE minutes >= settings.min_minutes AND age IS NOT NULL AND position IS NOT NULL
    GROUP BY position, age_band
)
SELECT rates.*, coalesce(cohorts.peer_count, 0) AS peer_count,
       CASE WHEN ranks.peers >= settings.min_peers
            THEN 100.0 * (ranks.lower_rank - 1 + (ranks.ties - 1) / 2.0) / (ranks.peers - 1)
            ELSE NULL END AS percentile,
       CASE WHEN rates.minutes = 0 THEN 'no_minutes'
            WHEN rates.age IS NULL THEN 'missing_birth_date'
            WHEN rates.minutes < settings.min_minutes THEN 'insufficient_minutes'
            WHEN coalesce(cohorts.peer_count, 0) < settings.min_peers THEN 'insufficient_peers'
            WHEN rates.minutes < settings.stronger_minutes OR cohorts.peer_count < settings.stronger_peers
            THEN 'limited_sample' ELSE 'moderate_sample' END AS evidence_status
FROM rates LEFT JOIN ranks USING (player_id, metric)
LEFT JOIN cohorts ON rates.position = cohorts.position AND rates.age_band = cohorts.age_band
CROSS JOIN settings;