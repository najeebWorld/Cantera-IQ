from math import fsum
import unicodedata

import duckdb

from cantera.store import dataset_summary, player_profile, records

METRICS = ("completed_passes", "key_passes", "npxg", "shots", "successful_dribbles", "tackles_won")


def similar_players(database: duckdb.DuckDBPyConnection, player_id: int, limit: int = 5) -> dict | None:
    if not 1 <= limit <= 10:
        raise ValueError("Limit must be between 1 and 10")
    player = player_profile(database, player_id)
    if player is None:
        return None
    result = {"player": player, "status": "available", "reason": None, "candidate_count": 0,
              "method": "mean_absolute_percentile_difference", "comparisons": []}
    if player["position"] == "GK":
        return {**result, "status": "unavailable", "reason": "goalkeeper_metrics_unavailable"}
    if tuple(metric["metric"] for metric in player["metrics"]) != METRICS:
        return {**result, "status": "unavailable", "reason": "incomplete_metrics"}
    if any(metric["percentile"] is None for metric in player["metrics"]):
        return {**result, "status": "unavailable", "reason": player["metrics"][0]["evidence_status"]}
    rows = records(database, """
        SELECT player_id, metric, total, per90, percentile, peer_count, evidence_status
        FROM player_metrics WHERE position = ? AND age_band = ? AND player_id != ?
        ORDER BY player_id, metric
    """, [player["position"], player["age_band"], player_id])
    candidates = {}
    for row in rows:
        candidates.setdefault(row["player_id"], []).append(row)
    for identifier, metrics in candidates.items():
        if tuple(metric["metric"] for metric in metrics) != METRICS or any(metric["percentile"] is None for metric in metrics):
            continue
        differences = [{"metric": source["metric"], "source_per90": source["per90"],
                        "candidate_per90": other["per90"], "source_percentile": source["percentile"],
                        "candidate_percentile": other["percentile"],
                        "difference": abs(source["percentile"] - other["percentile"])}
                       for source, other in zip(player["metrics"], metrics)]
        result["comparisons"].append({"player_id": identifier,
                                      "distance": fsum(item["difference"] for item in differences) / len(METRICS),
                                      "differences": differences})
    result["candidate_count"] = len(result["comparisons"])
    result["comparisons"] = sorted(result["comparisons"], key=lambda item: (item["distance"], item["player_id"]))[:limit]
    for comparison in result["comparisons"]:
        comparison["player"] = player_profile(database, comparison["player_id"])
    if not result["comparisons"]:
        result.update(status="unavailable", reason="no_eligible_candidates")
    return result


def identity_name(name: str) -> str:
    normalized = unicodedata.normalize("NFKD", name)
    return " ".join("".join(character for character in normalized if not unicodedata.combining(character)).casefold().split())


def historical_comparison(current: duckdb.DuckDBPyConnection, historical: duckdb.DuckDBPyConnection,
                          player_id: int) -> dict | None:
    player = player_profile(current, player_id)
    if player is None:
        return None
    result = {"status": "unavailable", "reason": None, "current": player, "historical": None,
              "current_dataset": dataset_summary(current), "historical_dataset": dataset_summary(historical),
              "historical_percentiles_available": False, "identity_verified": False}
    if (current.execute("SELECT DISTINCT competition, season FROM matches").fetchall() != [("FIFA World Cup", "2022")]
            or historical.execute("SELECT DISTINCT competition, season FROM matches").fetchall() != [("FIFA World Cup", "2018")]):
        return {**result, "reason": "unsupported_periods"}
    previous = player_profile(historical, player_id)
    if previous is None:
        return {**result, "reason": "no_historical_record"}
    if identity_name(previous["name"]) != identity_name(player["name"]):
        return {**result, "reason": "identity_conflict"}
    if previous["birth_date"] is not None and previous["birth_date"] != player["birth_date"]:
        return {**result, "reason": "identity_conflict"}
    for key in ("birth_date", "birth_source_name", "birth_source_url", "birth_source_sha256"):
        previous[key] = player[key]
    previous["birth_match_method"] = "statsbomb_id+normalized_name+reference_birth_record"
    previous["age"] = historical.execute("SELECT date_part('year', age(reference_date, ?::DATE))::INTEGER FROM settings",
                                       [player["birth_date"]]).fetchone()[0]
    previous["age_band"] = None
    for metric in previous["metrics"]:
        metric.update(percentile=None, peer_count=None, evidence_status="historical_cohort_unavailable")
    result.update(historical=previous, identity_verified=True)
    if (player["minutes"] < result["current_dataset"]["min_minutes"]
            or previous["minutes"] < result["historical_dataset"]["min_minutes"]
            or player["minutes"] <= 0 or previous["minutes"] <= 0):
        return {**result, "reason": "insufficient_minutes"}
    return {**result, "status": "available"}