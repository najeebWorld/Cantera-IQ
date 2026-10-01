from copy import deepcopy

import duckdb
import pytest

from cantera.clubs import build_club_database, club_player, club_squad
from cantera.providers import MatchBundle, SourceCache
from cantera.store import DEFAULT_DB, HISTORY_DB


def test_final_recovery_annotation_does_not_extend_minutes():
    from cantera.minutes import playing_stints
    events = [{"index": 1, "period": 1, "timestamp": "00:45:00.000", "type": {"name": "Half End"}},
              {"index": 2, "period": 1, "timestamp": "00:45:00.750", "type": {"name": "Ball Recovery"}}]
    with pytest.raises(ValueError, match="after period end"):
        playing_stints(events)
    assert playing_stints(events, allow_boundary_annotations=True) == ([], 2700)
    for kind in ["Shot", "Substitution", "Bad Behaviour"]:
        events[1]["type"]["name"] = kind
        with pytest.raises(ValueError, match="after period end"):
            playing_stints(events, allow_boundary_annotations=True)


def test_halftime_return_and_yellow_card_do_not_add_minutes():
    from cantera.minutes import playing_stints
    events = [
        {"index": 1, "period": 1, "timestamp": "00:00:00.000", "type": {"name": "Starting XI"},
         "team": {"id": 10}, "tactics": {"lineup": [{"player": {"id": 1}, "position": {"id": 23}}]}},
        {"index": 2, "period": 1, "timestamp": "00:44:00.000", "type": {"name": "Player Off"}, "player": {"id": 1}},
        {"index": 3, "period": 1, "timestamp": "00:45:00.000", "type": {"name": "Half End"}},
        {"index": 4, "period": 1, "timestamp": "00:45:00.511", "type": {"name": "Player On"}, "player": {"id": 1}},
        {"index": 5, "period": 2, "timestamp": "00:45:00.000", "type": {"name": "Half End"}},
        {"index": 6, "period": 2, "timestamp": "00:45:32.992", "type": {"name": "Bad Behaviour"},
         "bad_behaviour": {"card": {"name": "Yellow Card"}}},
    ]
    stints, duration = playing_stints(events, allow_boundary_annotations=True)
    assert duration == 5400
    assert sum(stint.end_seconds - stint.start_seconds for stint in stints) == 5340
    events[-1]["bad_behaviour"]["card"]["name"] = "Red Card"
    with pytest.raises(ValueError, match="after period end"):
        playing_stints(events, allow_boundary_annotations=True)


class ClubFixture:
    def matches(self):
        for match_id, team_id, seconds, shots in [(1, 10, 3600, 2), (2, 20, 1800, 3)]:
            other_id = 20 if team_id == 10 else 10
            names = {10: "First", 20: "Second"}
            yield MatchBundle(
                match={"match_id": match_id, "match_date": "2015-08-22", "competition": "La Liga",
                       "season": "2015/2016", "home_team": "First", "away_team": "Second",
                       "duration_seconds": 5400, "raw_event_count": 1},
                players=[{"player_id": 1, "name": "Shared Player", "display_name": "Shared",
                          "team_id": team_id, "team": names[team_id], "shirt_number": match_id},
                         {"player_id": 2, "name": "Bench Player", "display_name": "Bench",
                          "team_id": other_id, "team": names[other_id], "shirt_number": 9}],
                stints=[{"match_id": match_id, "player_id": 1, "team_id": team_id, "position": "ST",
                         "start_seconds": 0, "end_seconds": seconds}],
                events=[{"event_id": str(match_id), "match_id": match_id, "player_id": 1,
                         "team_id": team_id, "shots": shots, "npxg": 0.5, "key_passes": 0,
                         "completed_passes": 0, "successful_dribbles": 0, "tackles_won": 0,
                         "source_event": "{}"}],
            )


def test_club_player_isolation_and_atomic_import(tmp_path):
    path = tmp_path / "clubs.duckdb"
    cache = SourceCache(tmp_path / "cache")
    for _ in range(2):
        summary = build_club_database(path, cache, ClubFixture(), 2, 2, 2)
        assert summary["matches"] == 2
    with duckdb.connect(str(path), read_only=True) as database:
        first = club_player(database, 10, 1)
        second = club_player(database, 20, 1)
        assert first["minutes"] == 60
        assert second["minutes"] == 30
        assert next(metric for metric in first["metrics"] if metric["metric"] == "shots")["per90"] == 3
        assert next(metric for metric in second["metrics"] if metric["metric"] == "shots")["per90"] == 9
        assert all(metric["percentile"] is None for metric in first["metrics"])
        assert club_player(database, 99, 1) is None
        bench = club_squad(database, 10)[1]
        assert bench["minutes"] == 0
        assert all(metric["per90"] is None for metric in bench["metrics"])
    previous = path.read_bytes()
    with pytest.raises(ValueError, match="Incomplete"):
        build_club_database(path, cache, ClubFixture(), 3, 2, 2)
    assert path.read_bytes() == previous
    assert not list(tmp_path.glob("*.building-*"))


@pytest.mark.parametrize("path", [DEFAULT_DB, HISTORY_DB])
def test_club_destination_protection(path, tmp_path):
    with pytest.raises(ValueError, match="must not replace"):
        build_club_database(path, SourceCache(tmp_path), ClubFixture(), 2, 2, 2)


def test_club_identity_conflict_and_unrelated_destination(tmp_path):
    class Conflict:
        def matches(self):
            bundles = list(ClubFixture().matches())
            bundles[1] = deepcopy(bundles[1])
            bundles[1].players[0]["name"] = "Different person"
            yield from bundles
    path = tmp_path / "clubs.duckdb"
    with pytest.raises(ValueError, match="Conflicting player"):
        build_club_database(path, SourceCache(tmp_path / "cache"), Conflict(), 2, 2, 2)
    assert not path.exists()
    with duckdb.connect(str(path)) as database:
        database.execute("CREATE TABLE unrelated (value INTEGER)")
    with pytest.raises(ValueError, match="not a club"):
        build_club_database(path, SourceCache(tmp_path / "cache"), ClubFixture(), 2, 2, 2)


def test_club_api_and_preferences(tmp_path, monkeypatch):
    from fastapi.testclient import TestClient
    from cantera.api import app
    path = tmp_path / "clubs.duckdb"
    build_club_database(path, SourceCache(tmp_path / "cache"), ClubFixture(), 2, 2, 2)
    monkeypatch.setenv("CANTERA_CLUB_DB", str(path))
    monkeypatch.setenv("CANTERA_CLUB_PROFILES", str(tmp_path / "profiles.json"))
    client = TestClient(app)
    assert len(client.get("/api/clubs").json()["clubs"]) == 2
    assert len(client.get("/api/clubs/10/players?lang=es").json()["players"]) == 2
    assert client.get("/api/clubs/10/players/1").json()["radar_available"] is False
    assert client.get("/api/clubs/10/players/99").status_code == 404
    assert client.get("/api/clubs/99/players/1?lang=es").status_code == 404
    assert client.get("/api/clubs?lang=he").status_code == 422
    profile = client.get("/api/clubs/10/profile").json()
    payload = {key: profile[key] for key in ("revision", "weights")}
    endpoint = "/api/clubs/10/profile"
    headers = {"Origin": "http://127.0.0.1:3002"}
    assert client.put(endpoint, json=payload).status_code == 403
    assert client.put(endpoint, json=payload, headers={"Origin": "https://foreign.example"}).status_code == 403
    assert client.put(endpoint, json=payload, headers={**headers, "Sec-Fetch-Site": "cross-site"}).status_code == 403
    assert client.put(endpoint, json=payload, headers=headers).json()["revision"] == 1
    assert client.put(endpoint, json=payload, headers=headers).status_code == 409
    assert not client.get("/api/clubs/20/profile").json()["saved"]
    candidate = client.get("/api/players?limit=1").json()["players"][0]["player_id"]
    fit = client.get(f"/api/players/{candidate}/club-fit?club_id=10").json()
    assert fit["status"] == "available", fit
    original = client.get(f"/api/players/{candidate}").json()["player"]
    assert fit["score"] == pytest.approx(sum(metric["percentile"] for metric in original["metrics"]) / 6)
    assert client.get(f"/api/players/{candidate}/club-fit?club_id=20").json()["reason"] == "preferences_unsaved"
    monkeypatch.setenv("CANTERA_CLUB_DB", str(tmp_path / "missing.duckdb"))
    assert client.get("/api/clubs").status_code == 503


def test_full_club_source_reconciliation():
    import hashlib
    import json
    from collections import defaultdict
    from pathlib import Path
    from cantera.clubs import CLUB_DB, club_dataset, club_list
    from cantera.store import records
    if not CLUB_DB.exists():
        pytest.skip("Import the historical club season first")
    with duckdb.connect(str(CLUB_DB), read_only=True) as database:
        summary = club_dataset(database)
        assert (summary["matches"], summary["clubs"], summary["sources"]) == (380, 20, 761)
        assert all(club["matches"] == 38 for club in club_list(database))
        expected = defaultdict(lambda: defaultdict(float))
        for source in records(database, "SELECT * FROM sources"):
            payload = Path(source["cache_path"]).read_bytes()
            assert hashlib.sha256(payload).hexdigest() == source["sha256"]
        for match in records(database, "SELECT matches.*, cache_path FROM matches JOIN sources ON source_url = url"):
            raw = json.loads(Path(match["cache_path"]).read_bytes())
            assert len(raw) == match["raw_event_count"] == len({event["id"] for event in raw})
            for event in raw:
                if event["period"] > 4 or "player" not in event:
                    continue
                totals = expected[(event["team"]["id"], event["player"]["id"])]
                kind = event["type"]["name"]
                if kind == "Shot" and event["shot"]["type"]["name"] != "Penalty":
                    totals["shots"] += 1
                    totals["npxg"] += event["shot"]["statsbomb_xg"]
                if kind == "Pass":
                    totals["key_passes"] += bool(event["pass"].get("shot_assist"))
                    totals["completed_passes"] += "outcome" not in event["pass"]
                if kind == "Dribble":
                    totals["successful_dribbles"] += event["dribble"]["outcome"]["name"] == "Complete"
                if kind == "Duel":
                    totals["tackles_won"] += (event["duel"].get("type", {}).get("name") == "Tackle"
                        and event["duel"].get("outcome", {}).get("name") in {"Won", "Success In Play", "Success Out"})
        for metric in records(database, "SELECT club_metrics.*, minutes FROM club_metrics JOIN club_players USING (team_id, player_id)"):
            assert metric["total"] == pytest.approx(expected[(metric["team_id"], metric["player_id"])][metric["metric"]])
            assert metric["percentile"] is None
            assert metric["per90"] == (pytest.approx(metric["total"] * 90 / metric["minutes"]) if metric["minutes"] else None)