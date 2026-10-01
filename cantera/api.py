import os
from pathlib import Path
from typing import Literal

import duckdb
from fastapi import FastAPI, HTTPException, Query

from cantera.store import DEFAULT_DB, dataset_summary, player_table, records

app = FastAPI(title="Cantera IQ", version="0.1.0", description="Stage 1: database-grounded player metrics")

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


@app.get("/api/methodology")
def methodology(lang: Literal["en", "es"] = "en"):
    with connection() as database:
        settings = records(database, "SELECT * FROM settings")[0]
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