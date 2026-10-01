import hashlib
import io
import json
import re
from dataclasses import dataclass
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Iterator, Protocol

import httpx
from kloppy import statsbomb
from pypdf import PdfReader

from cantera.minutes import playing_stints

REVISION = "4b73468fc5b0f1950f9f66fada70ad3a4f9327cb"
STATSBOMB_URL = f"https://raw.githubusercontent.com/statsbomb/open-data/{REVISION}/data"
FIFA_URL = "https://fdp.fifa.org/assetspublic/ce44/pdf/SquadLists-English.pdf"


@dataclass
class MatchBundle:
    match: dict[str, Any]
    players: list[dict[str, Any]]
    stints: list[dict[str, Any]]
    events: list[dict[str, Any]]


class MatchProvider(Protocol):
    def matches(self) -> Iterator[MatchBundle]: ...


@dataclass(frozen=True)
class BirthRecord:
    birth_date: date
    source_name: str
    source_url: str
    source_sha256: str
    match_method: str = "tournament+team+shirt_number"


class BirthDateProvider(Protocol):
    def lookup(self, team_name: str, shirt_number: int) -> BirthRecord | None: ...


class SourceCache:
    def __init__(self, root: Path):
        self.root = root
        self.root.mkdir(parents=True, exist_ok=True)
        self.sources: dict[str, dict[str, Any]] = {}

    def fetch(self, url: str) -> bytes:
        key = hashlib.sha256(url.encode()).hexdigest()
        payload_path = self.root / f"{key}.bin"
        metadata_path = self.root / f"{key}.json"
        if payload_path.exists() and metadata_path.exists():
            payload = payload_path.read_bytes()
            metadata = json.loads(metadata_path.read_text())
            if hashlib.sha256(payload).hexdigest() != metadata["sha256"]:
                raise ValueError(f"Cache checksum mismatch: {url}")
        else:
            transport = httpx.HTTPTransport(retries=3)
            with httpx.Client(transport=transport, timeout=90, follow_redirects=True) as client:
                response = client.get(url)
                response.raise_for_status()
                payload = response.content
            metadata = {"url": url, "sha256": hashlib.sha256(payload).hexdigest(),
                        "retrieved_at": datetime.now(timezone.utc).isoformat(),
                        "cache_path": str(payload_path), "bytes": len(payload)}
            temporary = payload_path.with_suffix(".tmp")
            temporary.write_bytes(payload)
            temporary.replace(payload_path)
            metadata_path.write_text(json.dumps(metadata), encoding="utf-8")
        self.sources[url] = metadata
        return payload


class Fifa2022BirthDates:
    def __init__(self, cache: SourceCache):
        payload = cache.fetch(FIFA_URL)
        digest = hashlib.sha256(payload).hexdigest()
        self.records: dict[tuple[str, int], BirthRecord] = {}
        aliases = {"Korea Republic": "South Korea", "USA": "United States", "IR Iran": "Iran"}
        for page in PdfReader(io.BytesIO(payload)).pages:
            text = page.extract_text(extraction_mode="layout")
            heading = re.search(r"^\s*([A-Za-z .]+) \([A-Z]{3}\)\s*$", text, re.MULTILINE)
            if not heading:
                raise ValueError("FIFA squad page missing team heading")
            team = heading.group(1).strip()
            team = aliases.get(team, team)
            rows = re.findall(
                r"^\s*(\d{1,2})\s+(?:GK|DF|MF|FW)\s+(.+?)\s{2,}.+?(\d{2}/\d{2}/\d{4})",
                text, re.MULTILINE,
            )
            if not 23 <= len(rows) <= 26:
                raise ValueError(f"Incomplete FIFA squad: {team} ({len(rows)} rows)")
            for shirt, name, birthday in rows:
                key = (team, int(shirt))
                if key in self.records:
                    raise ValueError(f"Duplicate FIFA identity: {key}")
                self.records[key] = BirthRecord(datetime.strptime(birthday, "%d/%m/%Y").date(),
                                                name.strip(), FIFA_URL, digest)
        if len({team for team, _ in self.records}) != 32:
            raise ValueError("Expected complete World Cup squads")

    def lookup(self, team_name: str, shirt_number: int) -> BirthRecord | None:
        return self.records.get((team_name, shirt_number))


def normalize_event(raw: dict[str, Any], match_id: int) -> dict[str, Any]:
    kind = raw["type"]["name"]
    shot = raw.get("shot", {})
    non_penalty_shot = kind == "Shot" and shot.get("type", {}).get("name") != "Penalty"
    if non_penalty_shot and shot.get("statsbomb_xg") is None:
        raise ValueError(f"Missing xG: {raw['id']}")
    passing = raw.get("pass", {})
    duel = raw.get("duel", {})
    return {
        "event_id": raw["id"], "match_id": match_id,
        "player_id": raw["player"]["id"], "team_id": raw["team"]["id"],
        "shots": int(non_penalty_shot),
        "npxg": float(shot["statsbomb_xg"]) if non_penalty_shot else 0.0,
        "key_passes": int(kind == "Pass" and bool(passing.get("shot_assist"))),
        "completed_passes": int(kind == "Pass" and "outcome" not in passing),
        "successful_dribbles": int(kind == "Dribble" and raw["dribble"]["outcome"]["name"] == "Complete"),
        "tackles_won": int(kind == "Duel" and duel.get("type", {}).get("name") == "Tackle"
                           and duel.get("outcome", {}).get("name") in {"Won", "Success In Play", "Success Out"}),
        "source_event": json.dumps(raw, ensure_ascii=False),
    }


class StatsBombOpenData:
    def __init__(self, cache: SourceCache, competition_id: int = 43, season_id: int = 106,
                 allow_boundary_annotations: bool = False):
        self.cache = cache
        self.competition_id = competition_id
        self.season_id = season_id
        self.allow_boundary_annotations = allow_boundary_annotations

    def matches(self) -> Iterator[MatchBundle]:
        schedule = json.loads(self.cache.fetch(
            f"{STATSBOMB_URL}/matches/{self.competition_id}/{self.season_id}.json"))
        for match in sorted(schedule, key=lambda item: (item["match_date"], item["match_id"])):
            yield self.load_match(match)

    def load_match(self, match: dict[str, Any]) -> MatchBundle:
        match_id = match["match_id"]
        event_url = f"{STATSBOMB_URL}/events/{match_id}.json"
        event_bytes = self.cache.fetch(event_url)
        lineup_bytes = self.cache.fetch(f"{STATSBOMB_URL}/lineups/{match_id}.json")
        raw_events = json.loads(event_bytes)
        if len({event["id"] for event in raw_events}) != len(raw_events):
            raise ValueError(f"Duplicate event identifiers in {match_id}")
        stints, duration = playing_stints(raw_events, allow_boundary_annotations=self.allow_boundary_annotations)
        dataset = statsbomb.load(event_data=io.BytesIO(event_bytes), lineup_data=io.BytesIO(lineup_bytes),
                                 event_types=["shot", "pass", "take_on", "duel"])
        supported = {"Shot", "Pass", "Dribble", "Duel"}
        unique_events = {event.raw_event["id"]: event.raw_event for event in dataset.events
                 if event.raw_event["period"] <= 4 and event.raw_event["type"]["name"] in supported}
        normalized = [normalize_event(raw, match_id) for raw in unique_events.values()]
        expected = sum(event["period"] <= 4 and event["type"]["name"] in {"Shot", "Pass", "Dribble", "Duel"}
                       for event in raw_events)
        if len(normalized) != expected:
            raise ValueError(f"kloppy event coverage mismatch in {match_id}: {len(normalized)} != {expected}")
        players = [{"player_id": player["player_id"], "name": player["player_name"],
                    "display_name": player.get("player_nickname") or player["player_name"],
                    "team_id": team["team_id"], "team": team["team_name"],
                    "shirt_number": player["jersey_number"]}
                   for team in json.loads(lineup_bytes) for player in team["lineup"]]
        return MatchBundle(
            match={"match_id": match_id, "match_date": match["match_date"],
                   "competition": match["competition"]["competition_name"],
                   "season": match["season"]["season_name"],
                   "home_team": match["home_team"]["home_team_name"],
                   "away_team": match["away_team"]["away_team_name"],
                   "duration_seconds": duration, "raw_event_count": len(raw_events),
                   "source_url": event_url, "source_revision": REVISION},
            players=players,
            stints=[{"match_id": match_id, "player_id": stint.player_id,
                     "team_id": stint.team_id, "position": stint.position,
                     "start_seconds": stint.start_seconds, "end_seconds": stint.end_seconds}
                    for stint in stints],
            events=normalized,
        )