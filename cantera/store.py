from pathlib import Path
from typing import Any
from uuid import uuid4

import duckdb

from cantera.providers import BirthDateProvider, MatchProvider, SourceCache

SCHEMA = Path(__file__).with_name("schema.sql")
ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DB = ROOT / "data" / "cantera.duckdb"


def player_table(connection: duckdb.DuckDBPyConnection, max_age: int = 23,
                 min_minutes: float = 180, limit: int = 10) -> list[dict[str, Any]]:
    rows = records(connection, """
        SELECT * FROM player_summary WHERE age <= ? AND minutes >= ? AND minutes > 0
        ORDER BY minutes DESC, player_id LIMIT ?
    """, [max_age, min_minutes, limit])
    for row in rows:
        row["metrics"] = records(connection, """
            SELECT metric, total, per90, percentile, peer_count, evidence_status
            FROM player_metrics WHERE player_id = ? ORDER BY metric
        """, [row["player_id"]])
    return rows


def append_rows(connection: duckdb.DuckDBPyConnection, table: str, rows: list[dict[str, Any]]) -> None:
    if table not in {"matches", "players", "stints", "events", "sources"}:
        raise ValueError("Unknown import table")
    if rows:
        connection.execute(f"INSERT INTO {table} BY NAME SELECT unnest(?, recursive := true)", [rows])


def build_database(path: Path, provider: MatchProvider, birthdays: BirthDateProvider | None,
                   cache: SourceCache, expected_matches: int | None = None) -> dict[str, Any]:
    path.parent.mkdir(parents=True, exist_ok=True)
    staging = path.with_name(f"{path.stem}.building-{uuid4().hex}.duckdb")
    seen_players: dict[int, dict[str, Any]] = {}
    count = 0
    try:
        with duckdb.connect(str(staging)) as connection:
            connection.execute(SCHEMA.read_text())
            connection.execute("BEGIN TRANSACTION")
            for bundle in provider.matches():
                append_rows(connection, "matches", [bundle.match])
                new_players = []
                for player in bundle.players:
                    identifier = player["player_id"]
                    if identifier in seen_players:
                        previous = seen_players[identifier]
                        if (previous["team_id"], previous["shirt_number"]) != (player["team_id"], player["shirt_number"]):
                            raise ValueError(f"Ambiguous tournament identity for player {identifier}")
                        continue
                    seen_players[identifier] = player.copy()
                    birth = birthdays.lookup(player["team"], player["shirt_number"]) if birthdays else None
                    new_players.append({**player, "birth_date": birth.birth_date if birth else None,
                                        "birth_source_name": birth.source_name if birth else None,
                                        "birth_source_url": birth.source_url if birth else None,
                                        "birth_source_sha256": birth.source_sha256 if birth else None,
                                        "birth_match_method": birth.match_method if birth else None})
                append_rows(connection, "players", new_players)
                append_rows(connection, "stints", bundle.stints)
                append_rows(connection, "events", bundle.events)
                count += 1
                print(f"Imported match {count}: {bundle.match['home_team']} - {bundle.match['away_team']}", flush=True)
            if count == 0 or (expected_matches is not None and count != expected_matches):
                raise ValueError(f"Incomplete match coverage: {count} (expected {expected_matches})")
            scope_count = connection.execute("SELECT count(*) FROM (SELECT DISTINCT competition, season FROM matches)").fetchone()[0]
            if scope_count != 1:
                raise ValueError("A stage-one database must contain one competition-season")
            connection.execute("UPDATE settings SET reference_date = (SELECT min(match_date) FROM matches)")
            append_rows(connection, "sources", list(cache.sources.values()))
            invalid = connection.execute("""
                SELECT count(*) FROM stints JOIN matches USING (match_id)
                WHERE end_seconds > duration_seconds + 0.001
            """).fetchone()[0]
            if invalid:
                raise ValueError("Playing interval exceeds match length")
            invalid_age = connection.execute("SELECT count(*) FROM player_summary WHERE age NOT BETWEEN 14 AND 60").fetchone()[0]
            if invalid_age:
                raise ValueError("Implausible birth date; import requires review")
            connection.execute("COMMIT")
            result = dataset_summary(connection)
            connection.execute("CHECKPOINT")
        staging.replace(path)
        return result
    finally:
        staging.unlink(missing_ok=True)
        Path(f"{staging}.wal").unlink(missing_ok=True)


def records(connection: duckdb.DuckDBPyConnection, sql: str, parameters: list | None = None) -> list[dict[str, Any]]:
    cursor = connection.execute(sql, parameters or [])
    names = [column[0] for column in cursor.description]
    return [dict(zip(names, row)) for row in cursor.fetchall()]


def dataset_summary(connection: duckdb.DuckDBPyConnection) -> dict[str, Any]:
    return records(connection, """
        SELECT (SELECT count(*) FROM matches) AS matches,
               (SELECT sum(raw_event_count) FROM matches) AS raw_events,
               (SELECT count(*) FROM events) AS metric_events,
               (SELECT count(*) FROM players) AS players,
               (SELECT count(*) FROM player_summary WHERE minutes > 0) AS active_players,
               (SELECT count(*) FROM players WHERE birth_date IS NULL) AS missing_birth_dates,
               (SELECT count(*) FROM player_summary WHERE age <= 23 AND minutes > 0) AS young_players,
               (SELECT min(match_date) FROM matches) AS start_date,
               (SELECT max(match_date) FROM matches) AS end_date,
               (SELECT count(*) FROM sources) AS sources,
               settings.* FROM settings
    """)[0]