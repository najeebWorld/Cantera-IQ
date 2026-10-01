import json
import hashlib
from pathlib import Path

import duckdb
import pytest

from cantera.providers import MatchBundle, SourceCache
from cantera.store import DEFAULT_DB, HISTORY_DB, build_database, build_history_database, dataset_summary, records


class FixtureProvider:
    def matches(self):
        yield MatchBundle(
            match={"match_id": 1, "match_date": "2022-11-20", "competition": "Fixture", "season": "2022",
                   "home_team": "Fixture", "away_team": "Opponent",
                   "duration_seconds": 6000, "raw_event_count": 1},
            players=[{"player_id": 1, "name": "Fixture Player", "display_name": "Fixture Player", "team_id": 1,
                      "team": "Fixture", "shirt_number": 1}],
            stints=[{"match_id": 1, "player_id": 1, "team_id": 1, "position": "GK",
                     "start_seconds": 0, "end_seconds": 6000}],
            events=[],
        )


def test_repeated_import_is_idempotent_and_incomplete_import_preserves_database(tmp_path):
    path = tmp_path / "test.duckdb"
    cache = SourceCache(tmp_path / "cache")
    for _ in range(2):
        summary = build_database(path, FixtureProvider(), None, cache, expected_matches=1)
        assert summary["players"] == 1
        assert summary["missing_birth_dates"] == 1
    with pytest.raises(ValueError, match="Incomplete match coverage"):
        build_database(path, FixtureProvider(), None, cache, expected_matches=2)
    with duckdb.connect(str(path), read_only=True) as database:
        assert dataset_summary(database)["players"] == 1
    assert not list(tmp_path.glob("*.building-*"))


def test_historical_import_cannot_replace_current_or_other_database(tmp_path):
    cache = SourceCache(tmp_path / "cache")
    with pytest.raises(ValueError, match="must not replace"):
        build_history_database(DEFAULT_DB, cache)
    path = tmp_path / "other.duckdb"
    build_database(path, FixtureProvider(), None, cache, expected_matches=1)
    with pytest.raises(ValueError, match="not a World Cup 2018"):
        build_history_database(path, cache)


@pytest.mark.parametrize("path,missing_dates", [(DEFAULT_DB, 0), (HISTORY_DB, 736)])
def test_real_dataset_integrity_and_source_reconciliation(path, missing_dates):
    if not path.exists():
        pytest.skip("Import the corresponding snapshot for real-data checks")
    with duckdb.connect(str(path), read_only=True) as database:
        summary = dataset_summary(database)
        assert summary["matches"] == 64
        assert summary["missing_birth_dates"] == missing_dates
        if path == HISTORY_DB:
            assert database.execute("SELECT count(*) FROM player_metrics WHERE percentile IS NOT NULL").fetchone()[0] == 0
        assert database.execute("""
            SELECT count(*) FROM (
                SELECT *, lag(end_seconds) OVER (PARTITION BY player_id, match_id ORDER BY start_seconds) AS previous_end
                FROM stints
            ) WHERE start_seconds < previous_end
        """).fetchone()[0] == 0
        assert database.execute("""
            SELECT count(*) FROM (
                SELECT match_id, team_id, sum(end_seconds - start_seconds) AS team_seconds
                FROM stints GROUP BY match_id, team_id
            ) JOIN matches USING (match_id) WHERE team_seconds > 11 * duration_seconds + 0.01
        """).fetchone()[0] == 0
        assert database.execute("SELECT count(*) FROM player_metrics WHERE percentile NOT BETWEEN 0 AND 100").fetchone()[0] == 0
        for match in records(database, "SELECT matches.*, sources.cache_path, sources.sha256 FROM matches JOIN sources ON matches.source_url = sources.url"):
            payload = Path(match["cache_path"]).read_bytes()
            assert hashlib.sha256(payload).hexdigest() == match["sha256"]
            raw = json.loads(payload)
            assert len(raw) == match["raw_event_count"]
            assert len({event["id"] for event in raw}) == len(raw)
            shots = [event for event in raw if event["period"] <= 4 and event["type"]["name"] == "Shot"
                     and event["shot"]["type"]["name"] != "Penalty"]
            actual = database.execute("SELECT sum(shots), sum(npxg) FROM events WHERE match_id = ?", [match["match_id"]]).fetchone()
            assert actual[0] == len(shots)
            assert actual[1] == pytest.approx(sum(event["shot"]["statsbomb_xg"] for event in shots))
            passes = [event["pass"] for event in raw if event["period"] <= 4 and event["type"]["name"] == "Pass"]
            dribbles = [event["dribble"] for event in raw if event["period"] <= 4 and event["type"]["name"] == "Dribble"]
            duels = [event["duel"] for event in raw if event["period"] <= 4 and event["type"]["name"] == "Duel"]
            actual = database.execute("SELECT sum(key_passes), sum(completed_passes), sum(successful_dribbles), sum(tackles_won) FROM events WHERE match_id = ?", [match["match_id"]]).fetchone()
            assert actual == (sum(bool(event.get("shot_assist")) for event in passes),
                              sum("outcome" not in event for event in passes),
                              sum(event["outcome"]["name"] == "Complete" for event in dribbles),
                              sum(event.get("type", {}).get("name") == "Tackle" and event.get("outcome", {}).get("name") in {"Won", "Success In Play", "Success Out"} for event in duels))