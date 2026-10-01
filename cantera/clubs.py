import os
from pathlib import Path
from uuid import uuid4

import duckdb

from cantera.comparison import identity_name
from cantera.providers import MatchProvider, SourceCache, StatsBombOpenData
from cantera.store import DEFAULT_DB, HISTORY_DB, ROOT, append_rows, records

CLUB_DB = ROOT / "data" / "cantera-clubs-2015-16.duckdb"
CLUB_SCHEMA = Path(__file__).with_name("club_schema.sql")


def club_dataset(database):
    return records(database, """
        SELECT club_dataset.*,
            (SELECT count(*) FROM matches) AS matches,
            (SELECT count(*) FROM clubs) AS clubs,
            (SELECT count(*) FROM players) AS players,
            (SELECT count(*) FROM sources) AS sources,
            (SELECT min(match_date) FROM matches) AS start_date,
            (SELECT max(match_date) FROM matches) AS end_date,
            'observed_match_rosters' AS coverage
        FROM club_dataset
    """)[0]


def club_list(database):
    return records(database, """
        SELECT clubs.*, (SELECT count(*) FROM club_players WHERE club_players.team_id = clubs.team_id) AS players,
            (SELECT count(*) FROM matches WHERE home_team = clubs.name OR away_team = clubs.name) AS matches
        FROM clubs ORDER BY name, team_id
    """)


def club_squad(database, club_id):
    players = records(database, "SELECT * FROM club_players WHERE team_id = ? ORDER BY player_id", [club_id])
    metrics = records(database, "SELECT * FROM club_metrics WHERE team_id = ? ORDER BY metric", [club_id])
    by_player = {}
    for metric in metrics:
        by_player.setdefault(metric["player_id"], []).append(metric)
    for player in players:
        player["metrics"] = by_player.get(player["player_id"], [])
    return players


def club_player(database, club_id, player_id):
    player = next((player for player in club_squad(database, club_id) if player["player_id"] == player_id), None)
    if player is not None:
        player["observations"] = records(database, """
            SELECT matches.match_id, match_date, home_team, away_team, shirt_number, source_url, source_revision,
                   sources.sha256 AS event_sha256
            FROM rosters JOIN matches USING (match_id)
            LEFT JOIN sources ON sources.url = matches.source_url
            WHERE team_id = ? AND player_id = ? ORDER BY match_date, match_id
        """, [club_id, player_id])
    return player


def build_club_database(path: Path, cache: SourceCache, provider: MatchProvider | None = None,
                        expected_matches: int = 380, expected_clubs: int = 20,
                        fixtures_per_club: int = 38):
    protected = {DEFAULT_DB.resolve(), HISTORY_DB.resolve(),
                 Path(os.getenv("CANTERA_DB", str(DEFAULT_DB))).resolve(),
                 Path(os.getenv("CANTERA_HISTORY_DB", str(HISTORY_DB))).resolve()}
    if path.resolve() in protected:
        raise ValueError("Club import must not replace a World Cup database")
    if path.exists():
        with duckdb.connect(str(path), read_only=True) as database:
            if not database.execute("SELECT count(*) FROM information_schema.tables WHERE table_name = 'club_dataset'").fetchone()[0]:
                raise ValueError("Destination is not a club database")
            if database.execute("SELECT * FROM club_dataset").fetchall() != [("clubs-v1", "La Liga", "2015/2016")]:
                raise ValueError("Destination is not the supported club dataset")
    path.parent.mkdir(parents=True, exist_ok=True)
    staging = path.with_name(f"{path.stem}.building-{uuid4().hex}.duckdb")
    provider = provider or StatsBombOpenData(cache, competition_id=11, season_id=27, allow_boundary_annotations=True)
    identities = {}
    teams = {}
    try:
        with duckdb.connect(str(staging)) as database:
            database.execute(CLUB_SCHEMA.read_text())
            database.execute("BEGIN TRANSACTION")
            for count, bundle in enumerate(provider.matches(), 1):
                if (bundle.match["competition"], bundle.match["season"]) != ("La Liga", "2015/2016"):
                    raise ValueError("Unexpected club competition-season")
                append_rows(database, "matches", [bundle.match])
                for player in bundle.players:
                    team_id, player_id = player["team_id"], player["player_id"]
                    if player["team"] not in (bundle.match["home_team"], bundle.match["away_team"]):
                        raise ValueError("Roster team is not a match participant")
                    if team_id not in teams:
                        database.execute("INSERT INTO clubs VALUES (?, ?)", [team_id, player["team"]])
                        teams[team_id] = player["team"]
                    elif teams[team_id] != player["team"]:
                        raise ValueError("Conflicting club identity")
                    name = identity_name(player["name"])
                    if player_id not in identities:
                        append_rows(database, "players", [{key: player[key] for key in ("player_id", "name", "display_name")}])
                        identities[player_id] = name
                    elif identities[player_id] != name:
                        raise ValueError(f"Conflicting player identity: {player_id}")
                    database.execute("INSERT INTO rosters VALUES (?, ?, ?, ?)",
                                     [bundle.match["match_id"], player_id, team_id, player["shirt_number"]])
                append_rows(database, "stints", bundle.stints)
                append_rows(database, "events", bundle.events)
                print(f"Imported club match {count}: {bundle.match['home_team']} - {bundle.match['away_team']}", flush=True)
            scope = club_dataset(database)
            if scope["matches"] != expected_matches or scope["clubs"] != expected_clubs:
                raise ValueError("Incomplete club match coverage")
            if any(club["matches"] != fixtures_per_club for club in club_list(database)):
                raise ValueError("Incomplete club fixture coverage")
            invalid = database.execute("""
                SELECT count(*) FROM stints JOIN matches USING (match_id)
                WHERE end_seconds > duration_seconds + 0.001
            """).fetchone()[0]
            overlap = database.execute("""
                SELECT count(*) FROM (SELECT *, lag(end_seconds) OVER (
                    PARTITION BY match_id, player_id ORDER BY start_seconds) AS previous_end FROM stints)
                WHERE start_seconds < previous_end
            """).fetchone()[0]
            excess = database.execute("""
                SELECT count(*) FROM (SELECT match_id, team_id, sum(end_seconds-start_seconds) AS seconds
                    FROM stints GROUP BY match_id, team_id) JOIN matches USING (match_id)
                WHERE seconds > 11 * duration_seconds + 0.01
            """).fetchone()[0]
            missing_team = database.execute("""
                SELECT count(*) FROM matches WHERE
                    (SELECT count(DISTINCT team_id) FROM rosters WHERE rosters.match_id = matches.match_id) != 2
            """).fetchone()[0]
            if invalid or overlap or excess or missing_team:
                raise ValueError("Invalid club playing intervals or roster coverage")
            append_rows(database, "sources", list(cache.sources.values()))
            database.execute("COMMIT")
            summary = club_dataset(database)
            database.execute("CHECKPOINT")
        staging.replace(path)
        return summary
    finally:
        staging.unlink(missing_ok=True)
        Path(f"{staging}.wal").unlink(missing_ok=True)