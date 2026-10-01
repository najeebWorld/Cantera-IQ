from datetime import date

import duckdb
import pytest

from cantera.comparison import historical_comparison, identity_name
from cantera.store import DEFAULT_DB, HISTORY_DB, SCHEMA, player_profile, records


@pytest.fixture
def snapshots():
    with duckdb.connect() as current, duckdb.connect() as historical:
        for database, year in ((current, 2022), (historical, 2018)):
            database.execute(SCHEMA.read_text())
            database.execute("UPDATE settings SET reference_date = ?", [date(year, 6, 14)])
            database.execute("INSERT INTO matches (match_id, match_date, competition, season, duration_seconds) VALUES (1, ?, 'FIFA World Cup', ?, 12000)",
                             [date(year, 6, 14), str(year)])
            database.execute("INSERT INTO players (player_id, name, birth_date) VALUES (1, 'Fixture Player', ?)",
                             [date(1998, 12, 20) if year == 2022 else None])
            database.execute("INSERT INTO stints VALUES (1, 1, 1, 'W', 0, 12000)")
            database.execute("INSERT INTO events (event_id, match_id, player_id, shots) VALUES ('shot', 1, 1, ?)",
                             [4 if year == 2022 else 2])
        yield current, historical


def test_history_keeps_periods_separate_and_uses_verified_dob(snapshots):
    current, historical = snapshots
    before = player_profile(current, 1)
    result = historical_comparison(current, historical, 1)
    assert result["status"] == "available"
    assert result["historical"]["age"] == 19
    assert result["current"]["age"] == 23
    previous_shots = next(metric for metric in result["historical"]["metrics"] if metric["metric"] == "shots")
    assert previous_shots["per90"] == pytest.approx(0.9)
    assert all(metric["percentile"] is None for metric in result["historical"]["metrics"])
    assert player_profile(current, 1) == before
    assert player_profile(historical, 1)["birth_date"] is None


def test_history_rejects_identity_conflicts_and_unknown_players(snapshots):
    current, historical = snapshots
    assert historical_comparison(current, historical, 99) is None
    historical.execute("UPDATE players SET name = 'Someone Else'")
    result = historical_comparison(current, historical, 1)
    assert result["reason"] == "identity_conflict"
    assert result["historical"] is None


def test_history_preserves_missing_period_and_insufficient_minutes(snapshots):
    current, historical = snapshots
    historical.execute("UPDATE stints SET end_seconds = 60")
    assert historical_comparison(current, historical, 1)["reason"] == "insufficient_minutes"
    current.execute("INSERT INTO players (player_id, name) VALUES (2, 'No History')")
    assert historical_comparison(current, historical, 2)["reason"] == "no_historical_record"


def test_history_rejects_wrong_dataset_and_conflicting_birth_dates(snapshots):
    current, historical = snapshots
    historical.execute("UPDATE players SET birth_date = DATE '1999-01-01'")
    assert historical_comparison(current, historical, 1)["reason"] == "identity_conflict"
    historical.execute("UPDATE matches SET season = '2024'")
    assert historical_comparison(current, historical, 1)["reason"] == "unsupported_periods"


@pytest.mark.skipif(not DEFAULT_DB.exists() or not HISTORY_DB.exists(), reason="Both real snapshots required")
def test_real_snapshot_identity_and_history_coverage():
    with duckdb.connect(str(DEFAULT_DB), read_only=True) as current, duckdb.connect(str(HISTORY_DB), read_only=True) as historical:
        previous = {player["player_id"]: player for player in records(historical, "SELECT * FROM player_summary")}
        eligible = []
        overlap = []
        for player in records(current, "SELECT * FROM player_summary WHERE minutes > 0"):
            earlier = previous.get(player["player_id"])
            if earlier is None:
                continue
            overlap.append(player["player_id"])
            assert identity_name(player["name"]) == identity_name(earlier["name"])
            if player["minutes"] >= 180 and earlier["minutes"] >= 180:
                eligible.append(player["player_id"])
        assert len(overlap) == 208
        assert 3009 in eligible
        result = historical_comparison(current, historical, 3009)
        assert result["status"] == "available"
        assert result["historical"]["age"] == 19
        assert result["current"]["age"] == 23
        assert result["historical"]["birth_source_sha256"] == result["current"]["birth_source_sha256"]
        print(f"Historical identity overlap: {len(overlap)}; >=180 minutes in each period: {len(eligible)}")