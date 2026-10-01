import os
from pathlib import Path
from typing import Literal

import duckdb
from fastapi import FastAPI, HTTPException, Path as ApiPath, Query
from pydantic import BaseModel, ConfigDict, Field

from cantera.search import explain_evidence, search
from cantera.comparison import historical_comparison, similar_players
from cantera.store import DEFAULT_DB, HISTORY_DB, dataset_summary, player_profile, player_table, records

app = FastAPI(title="Cantera IQ", version="0.4.0", description="Database-grounded search, profiles and comparisons")

METRIC_DEFINITIONS = {
    "shots": {
        "en": "Non-penalty shots: count of Shot events excluding penalties; shootouts excluded.",
        "es": "Tiros sin penalti: eventos Shot salvo penaltis; se excluyen las tandas.",
    },
    "npxg": {
        "en": "Non-penalty expected goals: sum of StatsBomb shot probabilities, excluding penalties. Not goals scored or a Cantera model.",
        "es": "Goles esperados sin penalti: suma de probabilidades de StatsBomb, sin penaltis. No son goles marcados ni un modelo de Cantera.",
    },
    "key_passes": {
        "en": "Shot-assist passes: Pass events with shot_assist=true, whether or not the shot becomes a goal.",
        "es": "Pases de tiro: eventos Pass con shot_assist=true, termine o no en gol.",
    },
    "completed_passes": {
        "en": "Completed passes: Pass events without an outcome field, including set pieces. Volume, not completion percentage.",
        "es": "Pases completados: eventos Pass sin campo outcome, incluido el balon parado. Volumen, no porcentaje de acierto.",
    },
    "successful_dribbles": {
        "en": "Successful take-ons: Dribble events with outcome Complete. Carries are not dribbles.",
        "es": "Regates logrados: eventos Dribble con resultado Complete. Las conducciones no se cuentan como regates.",
    },
    "tackles_won": {
        "en": "Tackles won: Duel/Tackle events with Won, Success In Play or Success Out. Not interceptions or all defensive duels.",
        "es": "Entradas ganadas: eventos Duel/Tackle con Won, Success In Play o Success Out. No incluye intercepciones ni todos los duelos defensivos.",
    },
}


def connection() -> duckdb.DuckDBPyConnection:
    path = Path(os.environ.get("CANTERA_DB", str(DEFAULT_DB)))
    if not path.is_file():
        raise HTTPException(503, detail="Dataset unavailable. Run: python -m cantera ingest")
    return duckdb.connect(str(path), read_only=True)


COMPARISON_REASONS = {
    "goalkeeper_metrics_unavailable": ("Goalkeeper-specific metrics are unavailable.", "No hay metricas especificas de porteria."),
    "incomplete_metrics": ("The six-metric profile is incomplete.", "El perfil de seis metricas esta incompleto."),
    "insufficient_minutes": ("At least the dataset minimum minutes are required in each compared sample.", "Se requieren los minutos minimos del conjunto en cada muestra comparada."),
    "insufficient_peers": ("Too few qualified players in this cohort.", "No hay suficientes jugadores elegibles en este grupo."),
    "missing_birth_date": ("No verified birth date for the age cohort.", "No hay fecha de nacimiento verificada para el grupo de edad."),
    "no_minutes": ("No recorded playing minutes.", "No hay minutos jugados registrados."),
    "no_eligible_candidates": ("No eligible comparison players.", "No hay jugadores elegibles para comparar."),
    "no_historical_record": ("No 2018 record for this player.", "No hay registro de 2018 para este jugador."),
    "identity_conflict": ("Player identity requires review; comparison withheld.", "La identidad requiere revision; comparacion no disponible."),
    "unsupported_periods": ("These datasets are not the approved 2018 and 2022 World Cup samples.", "Estos datos no corresponden a las muestras aprobadas de los Mundiales de 2018 y 2022."),
    "historical_dataset_unavailable": ("The 2018 dataset is unavailable.", "Los datos de 2018 no estan disponibles."),
}


@app.get("/api/players/{player_id}/similar")
def similarities(player_id: int = ApiPath(ge=1, le=9223372036854775807),
                 lang: Literal["en", "es"] = "en", limit: int = Query(5, ge=1, le=10)):
    with connection() as database:
        result = similar_players(database, player_id, limit)
        if result is None:
            raise HTTPException(404, detail="Player not found" if lang == "en" else "Jugador no encontrado")
        result["dataset"] = dataset_summary(database)
    result["language"] = lang
    result["explanation"] = COMPARISON_REASONS[result["reason"]][lang == "es"] if result["reason"] else None
    result["methodology"] = (
        "Mean absolute difference across six percentiles, equally weighted. Lower distance means a closer observed profile, not talent or a probability. Same tournament, primary position and age band; qualified minutes and complete percentiles only. Rates include all roles. Player ID breaks ties.",
        "Diferencia absoluta media de seis percentiles con pesos iguales. Una distancia menor indica un perfil observado mas cercano, no talento ni probabilidad. Mismo torneo, posicion principal y grupo de edad; solo minutos elegibles y percentiles completos. Las tasas incluyen todos los roles. El identificador desempata."
    )[lang == "es"]
    return result


@app.get("/api/players/{player_id}/history")
def history(player_id: int = ApiPath(ge=1, le=9223372036854775807), lang: Literal["en", "es"] = "en"):
    path = Path(os.environ.get("CANTERA_HISTORY_DB", str(HISTORY_DB)))
    with connection() as database:
        if player_profile(database, player_id) is None:
            raise HTTPException(404, detail="Player not found" if lang == "en" else "Jugador no encontrado")
        if not path.is_file():
            result = {"status": "unavailable", "reason": "historical_dataset_unavailable", "historical": None,
                      "historical_percentiles_available": False, "identity_verified": False}
        else:
            with duckdb.connect(str(path), read_only=True) as historical:
                result = historical_comparison(database, historical, player_id)
    result["language"] = lang
    result["explanation"] = COMPARISON_REASONS[result["reason"]][lang == "es"] if result["reason"] else None
    result["methodology"] = (
        "World Cup snapshots, not continuous seasons or a development forecast. All 2018 rosters were imported; historical age-cohort percentiles are withheld because birth-date coverage is incomplete. Identity uses StatsBomb ID and normalized full name; birth dates retain the verified 2022 FIFA source. Age is calculated at each tournament start. Opponents, roles, team context and small samples differ; xG model equivalence is unverified. A change in per90 is not evidence of improved ability.",
        "Muestras de Mundiales, no temporadas continuas ni una prediccion de desarrollo. Se importaron todas las plantillas de 2018; no se publican percentiles historicos por cobertura incompleta de fechas de nacimiento. Identidad por ID de StatsBomb y nombre completo normalizado; nacimiento con fuente FIFA 2022 verificada. Edad al inicio de cada torneo. Cambian rivales, roles, contexto y muestras; la equivalencia de modelos xG no esta verificada. Un cambio por 90 no demuestra mejora de capacidad."
    )[lang == "es"]
    return result


@app.get("/api/coverage")
def coverage():
    with connection() as database:
        return dataset_summary(database)


@app.get("/api/players")
def players(max_age: int = Query(23, ge=14, le=60), min_minutes: float = Query(180, ge=0, le=100000),
            limit: int = Query(10, ge=1, le=1000)):
    with connection() as database:
        return {"selection": "minutes_desc_not_talent_ranking", "dataset": dataset_summary(database),
                "players": player_table(database, max_age, min_minutes, limit)}


class SearchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    query: str = Field(min_length=1, max_length=500)
    lang: Literal["en", "es"] = "en"


@app.post("/api/search")
def search_players(request: SearchRequest):
    with connection() as database:
        return search(database, request.query, request.lang)


@app.get("/api/methodology")
def methodology(lang: Literal["en", "es"] = "en"):
    with connection() as database:
        settings = records(database, "SELECT * FROM settings")[0]
    return methodology_details(settings, lang)


def methodology_details(settings: dict, lang: Literal["en", "es"]) -> dict:
    return {
        "language": lang, "settings": settings,
        "metrics": {name: translations[lang] for name, translations in METRIC_DEFINITIONS.items()},
        "per90_formula": "total * 90 / minutes",
        "percentile_formula": "100 * (lower_count + (tie_count - 1) / 2) / (peer_count - 1)",
        "cohort": "primary position + age band + same competition-season; includes player; qualified minutes only",
        "warning": {
            "en": "Historical tournament sample, not academy or current-age scouting data. Sample labels are heuristic, not statistical confidence intervals. No talent ranking or development recommendation.",
            "es": "Muestra historica de un torneo, no datos de cantera ni edades actuales. Las etiquetas de evidencia son reglas practicas, no intervalos de confianza. Sin ranking de talento ni recomendaciones de desarrollo.",
        }[lang],
        "sources": {"events": "StatsBomb Open Data", "birth_dates": "FIFA World Cup 2022 official squad list"},
    }


@app.get("/api/players/{player_id}")
def profile(player_id: int = ApiPath(ge=1, le=9223372036854775807), lang: Literal["en", "es"] = "en"):
    with connection() as database:
        player = player_profile(database, player_id)
        if player is None:
            raise HTTPException(404, detail="Player not found" if lang == "en" else "Jugador no encontrado")
        dataset = dataset_summary(database)
        settings = records(database, "SELECT * FROM settings")[0]
        scope = records(database, "SELECT DISTINCT competition, season FROM matches ORDER BY competition, season")
    for metric in player["metrics"]:
        metric["definition"] = METRIC_DEFINITIONS[metric["metric"]][lang]
        metric["evidence_explanation"] = explain_evidence({**player, **metric}, settings, lang)
    return {
        "language": lang, "player": player, "dataset": dataset, "scope": scope,
        "radar_available": bool(player["metrics"]) and all(metric["percentile"] is not None for metric in player["metrics"]),
        "methodology": methodology_details(settings, lang),
    }