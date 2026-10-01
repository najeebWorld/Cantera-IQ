import json
import os
from pathlib import Path
from threading import Lock
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator

from cantera.clubs import CLUB_DB
from cantera.comparison import METRICS
from cantera.store import DEFAULT_DB, HISTORY_DB, ROOT

POSITIONS = ("CB", "FB", "DM", "CM", "AM", "W", "ST")
PROFILE_PATH = ROOT / "data" / "club-profiles.json"
PROFILE_LOCK = Lock()


class PreferenceUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, allow_inf_nan=False)
    revision: int = Field(ge=0)
    weights: dict[str, dict[str, float]]

    @field_validator("weights")
    @classmethod
    def validate_weights(cls, weights):
        if set(weights) != set(POSITIONS):
            raise ValueError("Exact supported position keys required")
        for metrics in weights.values():
            if set(metrics) != set(METRICS) or any(value < 0 or value > 100 for value in metrics.values()):
                raise ValueError("Exact metric keys and finite weights between 0 and 100 required")
            if sum(metrics.values()) <= 0:
                raise ValueError("Each position requires a positive total weight")
        return weights


class PreferenceConflict(Exception):
    pass


class PreferenceStorageError(Exception):
    pass


def preference_path():
    path = Path(os.getenv("CANTERA_CLUB_PROFILES", str(PROFILE_PATH)))
    protected = {DEFAULT_DB.resolve(), HISTORY_DB.resolve(), CLUB_DB.resolve()}
    for variable, default in [("CANTERA_DB", DEFAULT_DB), ("CANTERA_HISTORY_DB", HISTORY_DB), ("CANTERA_CLUB_DB", CLUB_DB)]:
        protected.add(Path(os.getenv(variable, str(default))).resolve())
    if path.suffix.lower() != ".json" or path.resolve() in protected:
        raise PreferenceStorageError("Preferences require a separate JSON path")
    return path


def read_profiles(path, allowed_clubs):
    if not path.exists():
        return {"schema_version": 1, "clubs": {}}
    try:
        data = json.loads(path.read_text())
        if (not isinstance(data, dict) or set(data) != {"schema_version", "clubs"}
                or type(data["schema_version"]) is not int or data["schema_version"] != 1
                or not isinstance(data["clubs"], dict)
                or not set(data["clubs"]).issubset({str(identifier) for identifier in allowed_clubs})):
            raise ValueError("Invalid preferences schema")
        for profile in data["clubs"].values():
            parsed = PreferenceUpdate.model_validate(profile)
            if parsed.revision < 1:
                raise ValueError("Saved revision must be positive")
        return data
    except (OSError, ValueError, ValidationError) as error:
        raise PreferenceStorageError("Stored preferences are invalid or unreadable") from error


def profile_response(club_id, profile=None):
    saved = profile is not None
    profile = profile or {"revision": 0, "weights": {position: {metric: 1.0 for metric in METRICS} for position in POSITIONS}}
    return {"club_id": club_id, "saved": saved, **profile, "positions": POSITIONS, "metrics": METRICS}


def get_preferences(club_id, allowed_clubs):
    with PROFILE_LOCK:
        return profile_response(club_id, read_profiles(preference_path(), allowed_clubs)["clubs"].get(str(club_id)))


def save_preferences(club_id, update, allowed_clubs):
    if club_id not in allowed_clubs:
        raise ValueError("Unknown club")
    with PROFILE_LOCK:
        path = preference_path()
        data = read_profiles(path, allowed_clubs)
        current = data["clubs"].get(str(club_id), {"revision": 0})
        if update.revision != current["revision"]:
            raise PreferenceConflict("Preferences changed; reload before saving")
        profile = {"revision": update.revision + 1, "weights": update.weights}
        data["clubs"][str(club_id)] = profile
        temporary = path.with_name(f".{path.name}.{uuid4().hex}.tmp")
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            with temporary.open("x") as output:
                json.dump(data, output, allow_nan=False, indent=2)
                output.flush()
                os.fsync(output.fileno())
            temporary.replace(path)
        except OSError as error:
            raise PreferenceStorageError("Could not save preferences") from error
        finally:
            temporary.unlink(missing_ok=True)
        return profile_response(club_id, profile)


def preference_score(player, profile, supported_scope=True):
    result = {"status": "unavailable", "score": None, "reason": None, "contributions": [],
              "club_id": profile["club_id"], "revision": profile["revision"], "position": player["position"]}
    if not supported_scope:
        result["reason"] = "unsupported_periods"
    elif not profile["saved"]:
        result["reason"] = "preferences_unsaved"
    elif player["position"] not in POSITIONS:
        result["reason"] = "goalkeeper_metrics_unavailable"
    else:
        weights = profile["weights"][player["position"]]
        percentiles = {metric["metric"]: metric["percentile"] for metric in player["metrics"]}
        if any(percentiles.get(metric) is None for metric, weight in weights.items() if weight > 0):
            result["reason"] = "incomplete_metrics"
        else:
            total = sum(weights.values())
            result["contributions"] = [{"metric": metric, "weight": weight, "share": weight / total,
                "percentile": percentiles.get(metric), "contribution": weight * percentiles[metric] / total if weight else 0}
                for metric, weight in weights.items()]
            result.update(status="available", score=sum(item["contribution"] for item in result["contributions"]))
    return result