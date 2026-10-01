from datetime import date

import duckdb
import pytest

from cantera.store import SCHEMA, player_table, records


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