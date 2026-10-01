import json
from pathlib import Path

import duckdb
import pytest

from cantera.providers import MatchBundle, SourceCache
from cantera.store import DEFAULT_DB, build_database, dataset_summary, records


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


@pytest.mark.skipif(not DEFAULT_DB.exists(), reason="Run python -m cantera ingest for real-data checks")
def test_real_dataset_integrity_and_source_reconciliation():
    with duckdb.connect(str(DEFAULT_DB), read_only=True) as database:
        summary = dataset_summary(database)
        assert summary["matches"] == 64
        assert summary["missing_birth_dates"] == 0
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
        for match in records(database, "SELECT matches.*, sources.cache_path FROM matches JOIN sources ON matches.source_url = sources.url"):
            raw = json.loads(Path(match["cache_path"]).read_bytes())
            shots = [event for event in raw if event["period"] <= 4 and event["type"]["name"] == "Shot"
                     and event["shot"]["type"]["name"] != "Penalty"]
            actual = database.execute("SELECT sum(shots), sum(npxg) FROM events WHERE match_id = ?", [match["match_id"]]).fetchone()
            assert actual[0] == len(shots)
            assert actual[1] == pytest.approx(sum(event["shot"]["statsbomb_xg"] for event in shots))