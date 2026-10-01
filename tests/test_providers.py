import pytest

from cantera.providers import SourceCache, normalize_event


def raw(kind, **fields):
    return dict(id="event-one", type={"name": kind}, player={"id": 1}, team={"id": 2}, **fields)


def test_penalties_are_excluded_from_shots_and_npxg():
    result = normalize_event(raw("Shot", shot={"type": {"name": "Penalty"}, "statsbomb_xg": 0.78}), 1)
    assert result["shots"] == 0
    assert result["npxg"] == 0


def test_missing_xg_is_not_zero():
    with pytest.raises(ValueError, match="Missing xG"):
        normalize_event(raw("Shot", shot={}), 1)


def test_complete_pass_and_shot_assist_are_distinct():
    result = normalize_event(raw("Pass", **{"pass": {"shot_assist": True}}), 1)
    assert result["completed_passes"] == result["key_passes"] == 1
    result = normalize_event(raw("Pass", **{"pass": {"outcome": {"name": "Incomplete"}}}), 1)
    assert result["completed_passes"] == result["key_passes"] == 0


def test_cache_checksum_is_verified(tmp_path):
    import hashlib
    import json

    url = "https://example.org/data"
    key = hashlib.sha256(url.encode()).hexdigest()
    (tmp_path / f"{key}.bin").write_bytes(b"tampered")
    (tmp_path / f"{key}.json").write_text(json.dumps({"sha256": "incorrect"}))
    with pytest.raises(ValueError, match="checksum mismatch"):
        SourceCache(tmp_path).fetch(url)