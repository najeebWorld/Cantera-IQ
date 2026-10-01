import csv
import json
from pathlib import Path
from typing import Any

import duckdb

from cantera.api import METRIC_DEFINITIONS
from cantera.store import dataset_summary, player_table


def export_sample(connection: duckdb.DuckDBPyConnection, output: Path) -> dict[str, Any]:
    output.mkdir(parents=True, exist_ok=True)
    players = player_table(connection)
    summary = dataset_summary(connection)
    payload = {"selection": "Ten age <=23 players with most minutes; not a talent ranking",
               "dataset": summary, "players": players}
    (output / "sample.json").write_text(json.dumps(payload, ensure_ascii=False, default=str, indent=2), encoding="utf-8")
    flat_rows = []
    for player in players:
        row = {key: player[key] for key in ("player_id", "display_name", "age", "reference_date", "position", "team", "minutes", "age_band", "birth_source_url")}
        for metric in player["metrics"]:
            for key in ("total", "per90", "percentile", "peer_count", "evidence_status"):
                row[f"{metric['metric']}_{key}"] = metric[key]
        flat_rows.append(row)
    if flat_rows:
        with (output / "sample.csv").open("w", newline="", encoding="utf-8") as handle:
            writer = csv.DictWriter(handle, fieldnames=list(flat_rows[0]))
            writer.writeheader()
            writer.writerows(flat_rows)
    lines = ["# Cantera IQ: Stage 1 Sample", "",
             f"Age at {summary['reference_date']}; {summary['matches']} matches; {summary['players']} players; "
             f"{summary['missing_birth_dates']} missing birth dates.", "",
             "Historical World Cup 2022 national-team data, not academy data or present-day ages.",
             "Selection: ten age <=23 players with the most minutes, not a talent ranking.", "",
             "Metric cells: per 90 (percentile). NA means insufficient evidence, not zero.", "",
             "| Player | Age | Position | National team | Minutes | Peers | Shots | npxG | Key passes | Completed passes | Dribbles won | Tackles won | Evidence |",
             "|---|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|"]
    order = ("shots", "npxg", "key_passes", "completed_passes", "successful_dribbles", "tackles_won")
    for player in players:
        metrics = {metric["metric"]: metric for metric in player["metrics"]}
        cells = []
        for key in order:
            metric = metrics[key]
            percentile = "NA" if metric["percentile"] is None else f"{metric['percentile']:.0f}"
            cells.append(f"{metric['per90']:.2f} ({percentile})")
        values = [player["display_name"], str(player["age"]), player["position"], player["team"],
                  f"{player['minutes']:.1f}", str(metrics["shots"]["peer_count"]), *cells,
                  metrics["shots"]["evidence_status"]]
        lines.append("| " + " | ".join(values) + " |")
    lines.extend(["", "## Metric Definitions", "", "All rates = total * 90 / total playing minutes.", ""])
    for name, translations in METRIC_DEFINITIONS.items():
        lines.append(f"- **{name}**: {translations['en']}")
    lines.extend(["", "## Evidence And Comparisons", "",
                  f"Percentiles require >= {summary['min_minutes']:g} minutes and >= {summary['min_peers']} peers, "
                  "including the player, in the same primary position and age band (U20, 20-23, 24-29, 30+).",
                  "Percentile = 100 * (number below + (number tied - 1) / 2) / (peer count - 1).",
                  "An all-tied group receives 50. Rates are rounded to 8 decimals only for identifying ties.",
                  "Primary position is the position group with most playing time; all player events enter their overall rates.",
                  "Minutes include stoppage and extra time, exclude breaks, shootouts and recorded temporary absences.",
                  "Evidence labels are heuristics, not calibrated probabilities or statistical confidence intervals.",
                  "A moderate sample requires 450 minutes and 10 peers; a smaller eligible sample is limited.",
                  "Higher volume does not necessarily mean better performance. Goalkeepers need specialist metrics later.",
                  "This tournament cannot establish academy potential, future development or first-team readiness.", "",
                  "## Sources", "",
                  "- Events, lineups and xG: [StatsBomb Open Data](https://github.com/statsbomb/open-data).",
                  "- Birth dates: [FIFA official 2022 squad list](https://fdp.fifa.org/assetspublic/ce44/pdf/SquadLists-English.pdf).",
                  "- Every source URL, retrieval time and SHA-256 is stored in DuckDB's sources table.",
                  "- Before external publication, comply with StatsBomb's terms and include their logo from the official media pack.",
                  "- Full methodology and limitations: [../docs/DATA-REFERENCE.md](../docs/DATA-REFERENCE.md).", ""])
    (output / "sample.md").write_text("\n".join(lines), encoding="utf-8")
    return {"players": len(players), "files": [str(output / f"sample.{extension}") for extension in ("json", "csv", "md")]}