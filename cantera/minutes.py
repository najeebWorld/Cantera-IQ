from collections import defaultdict
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class Stint:
    player_id: int
    team_id: int
    position: str
    start_seconds: float
    end_seconds: float


def seconds(timestamp: str) -> float:
    hours, minutes, remainder = timestamp.split(":")
    return int(hours) * 3600 + int(minutes) * 60 + float(remainder)


def position_group(position_id: int) -> str:
    groups = {
        "GK": {1},
        "CB": {3, 4, 5},
        "FB": {2, 6, 7, 8},
        "DM": {9, 10, 11},
        "CM": {13, 14, 15},
        "AM": {18, 19, 20},
        "W": {12, 16, 17, 21},
        "ST": {22, 23, 24, 25},
    }
    for name, identifiers in groups.items():
        if position_id in identifiers:
            return name
    raise ValueError(f"Unknown position: {position_id}")


def playing_stints(events: list[dict[str, Any]]) -> tuple[list[Stint], float]:
    period_lengths: dict[int, float] = defaultdict(float)
    for event in events:
        if event["type"]["name"] == "Half End" and event["period"] <= 4:
            period = event["period"]
            period_lengths[period] = max(period_lengths[period], seconds(event["timestamp"]))
    periods = {event["period"] for event in events if event["period"] <= 4}
    if not periods or periods != set(period_lengths):
        raise ValueError("Missing Half End: cannot establish reliable minutes")
    offsets = {period: sum(length for earlier, length in period_lengths.items() if earlier < period)
               for period in periods}
    duration = sum(period_lengths.values())
    active: dict[int, tuple[int, str, float]] = {}
    known: dict[int, tuple[int, str]] = {}
    dismissed: set[int] = set()
    stints: list[Stint] = []

    def close(player_id: int, clock: float) -> None:
        if player_id in active:
            team_id, position, start = active.pop(player_id)
            if clock < start:
                raise ValueError("Negative playing interval")
            if clock > start:
                stints.append(Stint(player_id, team_id, position, start, clock))

    def enter(player_id: int, team_id: int, position: str, clock: float) -> None:
        if player_id in dismissed:
            raise ValueError("Dismissed player re-entered")
        if player_id in active:
            raise ValueError("Player entered twice")
        known[player_id] = (team_id, position)
        active[player_id] = (team_id, position, clock)

    for event in sorted(events, key=lambda item: item["index"]):
        period = event["period"]
        if period > 4:
            continue
        clock = offsets[period] + seconds(event["timestamp"])
        if seconds(event["timestamp"]) > period_lengths[period] + 0.001:
            raise ValueError("Event occurs after period end")
        kind = event["type"]["name"]
        team_id = event.get("team", {}).get("id")
        player_id = event.get("player", {}).get("id")
        if kind == "Starting XI":
            for member in event["tactics"]["lineup"]:
                enter(member["player"]["id"], team_id,
                      position_group(member["position"]["id"]), 0.0)
        elif kind == "Tactical Shift":
            for member in event["tactics"]["lineup"]:
                identifier = member["player"]["id"]
                position = position_group(member["position"]["id"])
                known[identifier] = (team_id, position)
                if identifier in active and active[identifier][1] != position:
                    close(identifier, clock)
                    enter(identifier, team_id, position, clock)
        elif kind == "Substitution":
            if player_id not in known:
                raise ValueError("Substitution for unknown player")
            previous_team, previous_position = known[player_id]
            close(player_id, clock)
            enter(event["substitution"]["replacement"]["id"], previous_team,
                  previous_position, clock)
        elif kind == "Player Off":
            close(player_id, clock)
        elif kind == "Player On":
            if player_id not in known:
                raise ValueError("Return for unknown player")
            previous_team, previous_position = known[player_id]
            enter(player_id, previous_team, previous_position, clock)
        card = (event.get("foul_committed", {}).get("card", {}).get("name")
                or event.get("bad_behaviour", {}).get("card", {}).get("name"))
        if card in {"Red Card", "Second Yellow"}:
            close(player_id, clock)
            dismissed.add(player_id)
    for player_id in list(active):
        close(player_id, duration)
    return stints, duration