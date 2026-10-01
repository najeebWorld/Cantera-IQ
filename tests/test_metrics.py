from datetime import date

import duckdb
import pytest

from cantera.store import SCHEMA, player_profile, player_table, records
from cantera.search import SearchPlan, execute_search, search


@pytest.fixture
def database():
    with duckdb.connect() as connection:
        connection.execute(SCHEMA.read_text())
        connection.execute("UPDATE settings SET reference_date = DATE '2022-11-20'")
        connection.execute("""
            INSERT INTO matches (match_id, match_date, competition, season, duration_seconds)
            VALUES (1, '2022-11-20', 'Fixture', '2022', 6000), (2, '2022-11-21', 'Fixture', '2022', 6000);
            INSERT INTO players (player_id, name, birth_date, team, team_id)
            SELECT identifier, 'Player ' || identifier, '1999-11-20'::DATE, 'Team', 1 FROM range(1, 12) AS ids(identifier);
            UPDATE players SET birth_date = NULL WHERE player_id = 9;
            UPDATE players SET birth_date = DATE '1998-11-20' WHERE player_id = 10;
            UPDATE players SET birth_date = DATE '1999-11-21' WHERE player_id = 11;
            INSERT INTO stints
            SELECT match_id, player_id, 1, CASE WHEN player_id = 8 THEN 'CB' ELSE 'CM' END,
                   0, CASE WHEN player_id = 7 THEN 1800 ELSE 6000 END
            FROM matches CROSS JOIN players WHERE player_id != 11;
            INSERT INTO events (event_id, match_id, player_id, shots, npxg, key_passes, completed_passes, successful_dribbles, tackles_won)
            SELECT 'event-' || player_id, 1, player_id,
                   CASE player_id WHEN 1 THEN 0 WHEN 2 THEN 1 WHEN 3 THEN 1 WHEN 4 THEN 2 WHEN 5 THEN 3 ELSE 4 END,
                   0, 0, 0, 0, 0 FROM players;
        """)
        yield connection


def test_rates_are_aggregate_totals_over_aggregate_minutes(database):
    row = records(database, "SELECT * FROM player_metrics WHERE player_id = 4 AND metric = 'shots'")[0]
    assert row["minutes"] == 200
    assert row["total"] == 2
    assert row["per90"] == pytest.approx(0.9)


def test_same_age_and_position_only_with_tie_aware_percentiles(database):
    rows = records(database, "SELECT * FROM player_metrics WHERE player_id IN (1, 2, 3, 6) AND metric = 'shots' ORDER BY player_id")
    assert [row["peer_count"] for row in rows] == [6] * 4
    assert [row["percentile"] for row in rows] == [0, 30, 30, 100]


def test_all_equal_values_have_neutral_percentile(database):
    assert database.execute("SELECT DISTINCT percentile FROM player_metrics WHERE player_id <= 6 AND metric = 'npxg'").fetchall() == [(50.0,)]


@pytest.mark.parametrize("identifier,reason", [(7, "insufficient_minutes"), (8, "insufficient_peers"), (9, "missing_birth_date"), (10, "insufficient_peers"), (11, "no_minutes")])
def test_insufficient_evidence_has_no_percentile(database, identifier, reason):
    row = records(database, "SELECT * FROM player_metrics WHERE player_id = ? AND metric = 'shots'", [identifier])[0]
    assert row["percentile"] is None
    assert row["evidence_status"] == reason
    if identifier == 11:
        assert row["per90"] is None


def test_age_uses_completed_birthdays_at_fixed_reference_date(database):
    rows = records(database, "SELECT age, reference_date FROM player_summary WHERE player_id IN (1, 11) ORDER BY player_id")
    assert [row["age"] for row in rows] == [23, 22]
    assert all(row["reference_date"] == date(2022, 11, 20) for row in rows)


def test_display_filter_does_not_change_cohort(database):
    sample = player_table(database, limit=1)
    assert len(sample) == 1
    assert all(metric["peer_count"] == 6 for metric in sample[0]["metrics"])


def test_search_filters_preserve_full_cohort(database):
    result = execute_search(database, SearchPlan(position="CM", max_age=23, metric="shots", sort_by="per90", limit=1))
    assert result["total_matches"] == 6
    row = result["players"][0]
    assert row["player_id"] == 6
    assert row["per90"] == pytest.approx(1.8)
    assert row["percentile"] == 100
    assert row["peer_count"] == 6
    assert row["evidence_status"] == "limited_sample"
    assert "4.00 / 200.0 * 90 = 1.80" in row["explanation"]


def test_search_lower_minutes_retains_missing_percentiles(database):
    result = execute_search(database, SearchPlan(min_minutes=0, metric="shots", sort_by="per90"))
    row = next(player for player in result["players"] if player["player_id"] == 7)
    assert row["percentile"] is None
    assert row["evidence_status"] == "insufficient_minutes"
    assert "below the 180-minute minimum" in row["explanation"]
    assert all(player["minutes"] > 0 for player in result["players"])


def test_percentile_order_excludes_unqualified_rows(database):
    result = execute_search(database, SearchPlan(min_minutes=0, metric="shots", sort_by="percentile", min_percentile=30))
    assert [row["player_id"] for row in result["players"]] == [6, 5, 4, 2, 3]
    assert all(row["peer_count"] == 6 for row in result["players"])


def test_search_uses_database_minute_setting_and_no_hidden_metric(database):
    database.execute("UPDATE settings SET min_minutes = 201")
    result = search(database, "Find players")
    assert result["effective_min_minutes"] == 201
    assert result["players"] == []
    result = search(database, "Find players with at least 0 minutes")
    assert result["players"][0]["metric"] is None
    assert result["players"][0]["per90"] is None
    assert result["players"][0]["name"] == "Player 1"


def test_quoted_team_cannot_inject_sql(database):
    result = search(database, 'Find players from "Team\'; DROP TABLE players; --"')
    assert result["status"] == "needs_clarification"
    assert database.execute("SELECT count(*) FROM players").fetchone()[0] == 11
    valid = search(database, 'Find players from "Team"')
    assert valid["interpretation"]["team"] == "Team"


def test_profile_matches_full_cohort_metrics(database):
    profile = player_profile(database, 2)
    assert profile["display_name"] == "Player 2"
    assert profile["minutes"] == 200
    assert profile["metrics"] == records(database, """
        SELECT metric, total, per90, percentile, peer_count, evidence_status
        FROM player_metrics WHERE player_id = 2 ORDER BY metric
    """)
    assert len(profile["metrics"]) == 6
    assert next(metric for metric in profile["metrics"] if metric["metric"] == "shots")["percentile"] == 30


@pytest.mark.parametrize("identifier,reason", [(7, "insufficient_minutes"), (8, "insufficient_peers"),
                                             (9, "missing_birth_date"), (11, "no_minutes")])
def test_profile_keeps_missing_percentiles_and_evidence(database, identifier, reason):
    profile = player_profile(database, identifier)
    assert all(metric["percentile"] is None for metric in profile["metrics"])
    assert all(metric["evidence_status"] == reason for metric in profile["metrics"])
    if identifier == 11:
        assert all(metric["per90"] is None for metric in profile["metrics"])


def test_profile_preserves_zero_percentiles_and_unknown_player(database):
    profile = player_profile(database, 1)
    assert next(metric for metric in profile["metrics"] if metric["metric"] == "shots")["percentile"] == 0
    assert player_profile(database, 9999) is None