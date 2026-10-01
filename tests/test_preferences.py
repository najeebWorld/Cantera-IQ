import json
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from pathlib import Path

import pytest
from pydantic import ValidationError

from cantera.preferences import (PreferenceConflict, PreferenceStorageError, PreferenceUpdate,
    get_preferences, preference_score, profile_response, save_preferences)


def test_weights_and_score():
    profile = profile_response(10)
    player = {"position": "ST", "metrics": [{"metric": metric, "percentile": 0} for metric in profile["metrics"]]}
    assert preference_score(player, profile)["reason"] == "preferences_unsaved"
    profile["saved"] = True
    assert preference_score(player, profile)["score"] == 0
    player["metrics"][0]["percentile"] = None
    assert preference_score(player, profile)["score"] is None
    profile["weights"]["ST"][player["metrics"][0]["metric"]] = 0
    player["metrics"][1]["percentile"] = 100
    assert preference_score(player, profile)["score"] == 20
    scaled = deepcopy(profile)
    scaled["weights"]["ST"] = {metric: weight * 10 for metric, weight in profile["weights"]["ST"].items()}
    assert preference_score(player, scaled)["score"] == 20
    assert preference_score(player, profile, False)["reason"] == "unsupported_periods"
    player["position"] = "GK"
    assert preference_score(player, profile)["score"] is None
    for value in [-1, 101, float("inf"), float("nan"), True, "5"]:
        weights = deepcopy(profile["weights"])
        weights["CB"]["shots"] = value
        with pytest.raises(ValidationError):
            PreferenceUpdate(revision=0, weights=weights)
    weights = deepcopy(profile["weights"])
    weights["CB"] = {metric: 0 for metric in profile["metrics"]}
    with pytest.raises(ValidationError):
        PreferenceUpdate(revision=0, weights=weights)


def test_atomic_revisions_and_club_isolation(tmp_path, monkeypatch):
    path = tmp_path / "profiles.json"
    monkeypatch.setenv("CANTERA_CLUB_PROFILES", str(path))
    allowed = {10, 20}
    default = get_preferences(10, allowed)
    assert not default["saved"] and default["revision"] == 0
    update = PreferenceUpdate(revision=0, weights=default["weights"])
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda club: save_preferences(club, update, allowed), allowed))
    assert all(result["revision"] == 1 for result in results)
    assert set(json.loads(path.read_text())["clubs"]) == {"10", "20"}
    with pytest.raises(PreferenceConflict):
        save_preferences(10, update, allowed)
    previous = path.read_bytes()
    def fail_replace(*args):
        raise OSError("simulated failure")
    monkeypatch.setattr(Path, "replace", fail_replace)
    with pytest.raises(PreferenceStorageError):
        save_preferences(10, PreferenceUpdate(revision=1, weights=default["weights"]), allowed)
    assert path.read_bytes() == previous
    assert not list(tmp_path.glob("*.tmp"))


def test_malformed_preferences_and_destination(tmp_path, monkeypatch):
    path = tmp_path / "profiles.json"
    monkeypatch.setenv("CANTERA_CLUB_PROFILES", str(path))
    path.write_text('{"schema_version":1,"clubs":{"99":{}}}')
    with pytest.raises(PreferenceStorageError):
        get_preferences(10, {10})
    monkeypatch.setenv("CANTERA_CLUB_PROFILES", str(tmp_path / "analytics.duckdb"))
    with pytest.raises(PreferenceStorageError):
        get_preferences(10, {10})