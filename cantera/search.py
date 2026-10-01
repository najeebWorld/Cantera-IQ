import json
import unicodedata
from pathlib import Path
from typing import Any, Literal

import duckdb
from lark import Lark, UnexpectedInput
from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator

from cantera.store import dataset_summary, records

Metric = Literal["shots", "npxg", "key_passes", "completed_passes", "successful_dribbles", "tackles_won"]
Position = Literal["GK", "CB", "FB", "DM", "CM", "AM", "W", "ST"]


class SearchPlan(BaseModel):
    model_config = ConfigDict(extra="forbid")

    min_age: int | None = Field(None, ge=14, le=60)
    max_age: int | None = Field(None, ge=14, le=60)
    position: Position | None = None
    team: str | None = Field(None, min_length=1, max_length=100)
    min_minutes: float | None = Field(None, ge=0, le=100000, allow_inf_nan=False)
    metric: Metric | None = None
    min_per90: float | None = Field(None, ge=0, le=10000, allow_inf_nan=False)
    min_percentile: float | None = Field(None, ge=0, le=100, allow_inf_nan=False)
    sort_by: Literal["minutes", "per90", "percentile"] = "minutes"
    limit: int = Field(10, ge=1, le=50)

    @model_validator(mode="after")
    def check_consistency(self):
        if self.min_age is not None and self.max_age is not None and self.min_age > self.max_age:
            raise ValueError("Minimum age exceeds maximum age")
        if (self.sort_by != "minutes" or self.min_per90 is not None or self.min_percentile is not None) and self.metric is None:
            raise ValueError("A metric is required for metric filtering or sorting")
        return self


class ClarificationNeeded(ValueError):
    pass


PARSER = Lark(Path(__file__).with_suffix(".lark").read_text(), parser="earley", ambiguity="explicit")
POSITION_CODES = {
    "winger": "W", "striker": "ST", "centre_back": "CB", "full_back": "FB",
    "defensive_midfield": "DM", "central_midfield": "CM", "attacking_midfield": "AM", "goalkeeper": "GK",
}
METRIC_CODES = {"shots", "npxg", "key_passes", "completed_passes", "successful_dribbles", "tackles_won"}
TEAM_ALIASES = {
    "belgica": "belgium", "brasil": "brazil", "camerun": "cameroon", "croacia": "croatia",
    "dinamarca": "denmark", "inglaterra": "england", "francia": "france", "alemania": "germany",
    "japon": "japan", "marruecos": "morocco", "paises bajos": "netherlands", "polonia": "poland",
    "catar": "qatar", "arabia saudita": "saudi arabia", "corea del sur": "south korea",
    "espana": "spain", "suiza": "switzerland", "tunez": "tunisia", "estados unidos": "united states",
    "gales": "wales",
}
EXAMPLES = {
    "en": ["Show me wingers aged 23 or younger with at least 180 minutes sorted by successful dribbles per 90",
           "Find players from France under 24 sorted by npxg",
           "Find players with percentile at least 75 for key passes"],
    "es": ["Muestrame extremos hasta 23 anos con al menos 180 minutos ordenados por regates por 90",
           "Busca jugadores de Francia menores de 24 ordenados por npxg",
           "Busca jugadores con percentil minimo 75 de pases clave"],
}


def normalize(text: str) -> str:
    return " ".join("".join(character for character in unicodedata.normalize("NFKD", text.casefold())
                             if not unicodedata.combining(character)).split())


def parse_search(query: str) -> SearchPlan:
    if not query.strip() or len(query) > 500:
        raise ClarificationNeeded("query_length")
    try:
        tree = PARSER.parse(normalize(query))
    except UnexpectedInput as error:
        raise ClarificationNeeded("unsupported_request") from error
    fields: dict[str, Any] = {}

    def assign(key: str, value: Any) -> None:
        if key in fields and fields[key] != value:
            raise ClarificationNeeded("conflicting_constraints")
        fields[key] = value

    for node in tree.iter_subtrees_topdown():
        kind = str(node.data)
        if kind == "_ambig":
            raise ClarificationNeeded("ambiguous_request")
        if kind in POSITION_CODES:
            assign("position", POSITION_CODES[kind])
        elif kind in METRIC_CODES:
            assign("metric", kind)
        elif kind in {"age_under", "age_max"}:
            assign("max_age", int(node.children[0]) - (1 if kind == "age_under" else 0))
        elif kind == "age_range":
            assign("min_age", int(node.children[0]))
            assign("max_age", int(node.children[1]))
        elif kind == "result_limit":
            assign("limit", int(node.children[0]))
        elif kind == "minutes_filter":
            assign("min_minutes", float(str(node.children[0]).replace(",", ".")))
        elif kind == "team_filter":
            token = str(node.children[0])
            try:
                team = json.loads(token) if token.startswith('"') else token
            except json.JSONDecodeError as error:
                raise ClarificationNeeded("invalid_team") from error
            assign("team", TEAM_ALIASES.get(team, team))
        elif kind in {"rate_sort", "percentile_sort", "minutes_sort"}:
            assign("sort_by", {"rate_sort": "per90", "percentile_sort": "percentile", "minutes_sort": "minutes"}[kind])
        elif kind in {"rate_filter", "percentile_filter"}:
            assign("min_per90" if kind == "rate_filter" else "min_percentile",
                   float(str(node.children[0]).replace(",", ".")))
    try:
        return SearchPlan(**fields)
    except ValidationError as error:
        raise ClarificationNeeded("invalid_constraints") from error


def execute_search(database: duckdb.DuckDBPyConnection, plan: SearchPlan, lang: Literal["en", "es"] = "en") -> dict[str, Any]:
    summary = dataset_summary(database)
    effective_minutes = plan.min_minutes if plan.min_minutes is not None else summary["min_minutes"]
    if plan.team is not None:
        teams = {normalize(row["team"]): row["team"] for row in records(database, "SELECT DISTINCT team FROM players")}
        canonical_team = teams.get(normalize(plan.team))
        if canonical_team is None:
            raise ClarificationNeeded("unknown_team")
        plan = plan.model_copy(update={"team": canonical_team})
    clauses = ["metric = ?", "minutes > 0", "minutes >= ?"]
    parameters: list[Any] = [plan.metric or "shots", effective_minutes]
    for column, operator, value in (
        ("age", ">=", plan.min_age), ("age", "<=", plan.max_age),
        ("position", "=", plan.position), ("team", "=", plan.team),
        ("per90", ">=", plan.min_per90), ("percentile", ">=", plan.min_percentile),
    ):
        if value is not None:
            clauses.append(f"{column} {operator} ?")
            parameters.append(value)
    if plan.sort_by == "percentile":
        clauses.append("percentile IS NOT NULL")
    where = " AND ".join(clauses)
    total = database.execute(f"SELECT count(*) FROM player_metrics WHERE {where}", parameters).fetchone()[0]
    sort_column = {"minutes": "minutes", "per90": "per90", "percentile": "percentile"}[plan.sort_by]
    results = records(database, f"""
        SELECT player_id, name, coalesce(display_name, name) AS display_name, age, reference_date, position, main_position_share,
               team, minutes, appearances, age_band, total, per90, percentile, peer_count,
               evidence_status, birth_source_url
        FROM player_metrics WHERE {where}
        ORDER BY {sort_column} DESC NULLS LAST, minutes DESC, player_id ASC LIMIT ?
    """, [*parameters, plan.limit])
    for row in results:
        row["metric"] = plan.metric
        if plan.metric is None:
            row["total"] = row["per90"] = row["percentile"] = None
        row["explanation"] = explain_result(row, lang) + " " + explain_evidence(row, summary, lang)
    return {
        "status": "ok", "parser": "local_grammar_v1", "language": lang,
        "interpretation": plan.model_dump(), "effective_min_minutes": effective_minutes,
        "default_minutes_applied": plan.min_minutes is None,
        "sort_direction": "descending", "total_matches": total, "returned": len(results),
        "dataset": summary, "players": results,
        "notice": {
            "en": "Historical national-team data; ages at tournament start. Metric order is not a talent ranking. Evidence labels are sample-size rules, not success probabilities.",
            "es": "Datos historicos de selecciones; edades al inicio del torneo. El orden por metrica no es un ranking de talento. La evidencia indica tamano de muestra, no probabilidades de exito.",
        }[lang],
    }


def explain_result(row: dict[str, Any], lang: str) -> str:
    age = str(row["age"]) if row["age"] is not None else ("unknown" if lang == "en" else "desconocida")
    if lang == "en":
        text = f"{row['position']}, age {age} on {row['reference_date']}, {row['team']}; {row['minutes']:.1f} minutes."
    else:
        text = f"{row['position']}, edad {age} al {row['reference_date']}, {row['team']}; {row['minutes']:.1f} minutos."
    if row["metric"]:
        text += f" {row['metric']}: {row['total']:.2f} / {row['minutes']:.1f} * 90 = {row['per90']:.2f}."
        if row["percentile"] is not None:
            text += (f" Percentile {row['percentile']:.1f} among {row['peer_count']} peers."
                     if lang == "en" else f" Percentil {row['percentile']:.1f} entre {row['peer_count']} pares.")
    return text


def explain_evidence(row: dict[str, Any], settings: dict[str, Any], lang: str) -> str:
    messages = {
        "en": {
            "no_minutes": "No observed playing minutes.",
            "missing_birth_date": "No age-cohort percentile: verified birth date unavailable.",
            "insufficient_minutes": f"No percentile: {row['minutes']:.1f} minutes is below the {settings['min_minutes']:g}-minute minimum.",
            "insufficient_peers": f"No percentile: {row['peer_count']} qualified peers is below the required {settings['min_peers']}.",
            "limited_sample": f"Limited sample: fewer than {settings['stronger_minutes']:g} minutes or {settings['stronger_peers']} qualified peers.",
            "moderate_sample": f"Moderate sample: at least {settings['stronger_minutes']:g} minutes and {settings['stronger_peers']} qualified peers. Not predictive confidence.",
        },
        "es": {
            "no_minutes": "Sin minutos observados.",
            "missing_birth_date": "Sin percentil por edad: fecha de nacimiento verificada no disponible.",
            "insufficient_minutes": f"Sin percentil: {row['minutes']:.1f} minutos, por debajo del minimo de {settings['min_minutes']:g}.",
            "insufficient_peers": f"Sin percentil: {row['peer_count']} pares elegibles, por debajo de los {settings['min_peers']} necesarios.",
            "limited_sample": f"Muestra limitada: menos de {settings['stronger_minutes']:g} minutos o {settings['stronger_peers']} pares elegibles.",
            "moderate_sample": f"Muestra moderada: al menos {settings['stronger_minutes']:g} minutos y {settings['stronger_peers']} pares elegibles. No es confianza predictiva.",
        },
    }
    return messages[lang][row["evidence_status"]]


def search(database: duckdb.DuckDBPyConnection, query: str, lang: Literal["en", "es"] = "en") -> dict[str, Any]:
    try:
        return execute_search(database, parse_search(query), lang)
    except ClarificationNeeded as error:
        return {
            "status": "needs_clarification", "parser": "local_grammar_v1", "language": lang,
            "reason": str(error), "players": [], "examples": EXAMPLES[lang],
            "message": {
                "en": "I could not safely interpret the full request. Specify one position, age range, national team, minimum minutes and one available metric. Terms such as best, potential or creative need a measurable definition. No search was executed.",
                "es": "No pude interpretar toda la solicitud con seguridad. Indica una posicion, rango de edad, seleccion, minutos minimos y una metrica disponible. Mejor, potencial o creativo necesitan una definicion medible. No se ejecuto la busqueda.",
            }[lang],
        }