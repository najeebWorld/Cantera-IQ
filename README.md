# Cantera IQ

Working stages 1-2 prototype: StatsBomb Open Data -> replaceable provider -> DuckDB -> read-only FastAPI -> English/Spanish Next.js player search. Stage 2 uses a constrained local grammar, not an LLM or unrestricted language understanding.

## Run

Requires Python 3.10+ and internet access for the first import. No API keys or hosted services.

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python -m cantera ingest
.venv/bin/python -m cantera coverage
.venv/bin/python -m cantera sample
.venv/bin/python -m cantera export
.venv/bin/python -m pytest tests -q
.venv/bin/python -m uvicorn cantera.api:app --host 127.0.0.1 --port 8001
```

API documentation: http://127.0.0.1:8001/docs

In another terminal, start the search interface (Node.js 20.9+):

```bash
cd web
npm ci
npm run dev -- --hostname 127.0.0.1 --port 3002
```

Open http://127.0.0.1:3002. The Next.js server proxies API requests to port 8001; optionally set `CANTERA_API_URL` before starting/building the frontend. No browser CORS configuration or API key is needed. Fonts and the small pitch photograph are served locally.

- `GET /api/players?max_age=23&min_minutes=180&limit=10`: player metadata, raw totals, per-90 rates, percentiles, peer counts and evidence labels.
- `GET /api/coverage`: dataset completeness and analytical thresholds.
- `GET /api/methodology?lang=en` or `lang=es`: metric definitions in English or Spanish.
- `POST /api/search`: JSON `{ "query": "Find wingers aged 23 or younger sorted by successful dribbles per 90", "lang": "en" }`. Returns interpretation, dataset context, results and evidence, or `needs_clarification` without executing a player search.
- `CANTERA_DB`: optional database path for the API; CLI uses `--db`.

The API has no arbitrary SQL or write endpoint. It opens a fresh read-only database connection per request. Bind locally only; authentication and public deployment are not part of this prototype.

## Outputs

- Database: `data/cantera.duckdb`; raw source cache: `data/cache/` (both ignored by git).
- [Ten-player sample](reports/sample.md), [CSV](reports/sample.csv), [JSON](reports/sample.json).
- [Data dictionary and methodology](docs/DATA-REFERENCE.md).
- [Search contract, examples, limits and review](docs/SEARCH.md).

The import uses all 64 matches of the men's World Cup 2022, not the entire StatsBomb repository. Player ages are at 2022-11-20. The team field is the national team in the observed matches, not a current club. The sample is ordered by minutes, not talent. These are historical first-team observations, not academy coverage.

StatsBomb Open Data does not provide birth dates. The separate FIFA adapter supplies them from the official tournament squad PDF, matched by tournament, national team and shirt number. Source names and source hashes remain in DuckDB for audit. No dates are inferred by an LLM.

## Boundaries

Stages 1-2 only. Search supports a documented English/Spanish grammar for position, age, national team, minimum minutes, one metric, numeric thresholds and descending order. Unsupported language, qualitative potential, tracking speed and conflicting requests require clarification. No composite talent score, player page/radar, similarity, development trajectory, club weighting or recommendations. kloppy is used for event parsing; socceraction and mplsoccer are not needed yet and are not installed. Stage 3 requires separate approval.

Only one competition-season per database is supported. Provider replacement uses the normalized `MatchBundle`, `MatchProvider` and `BirthDateProvider` contracts. The FIFA 2022 identity adapter must not be reused for another tournament. Tactical and minute interpretation is owned by the StatsBomb adapter; analytics SQL does not parse provider JSON.

## Verification

Tests cover stoppage time, half-time substitutions, extra time, temporary exits, red cards, tactical changes, shootout exclusion, birth-date boundaries, tied percentiles, cohort isolation, insufficient samples, API validation, atomic import failure and repeat imports. When the real database exists, tests also reconcile every match's shots and npxG against cached raw data and check interval overlap and team-minute bounds.

92 Python tests pass, including strict grammar parsing, parameterized search, unchanged cohorts and API validation. Four Playwright cases cover actual database search, calculations, English/Spanish, clarification, empty results, unavailable API/retry, image availability and desktop/mobile page overflow. Screenshots are saved under `web/test-results/`.

With both servers and the imported dataset available:

```bash
cd web
npx playwright install chromium
npm test
npm run lint
npm run build
```

Known dependency warning: Starlette's TestClient emits a deprecation warning for its httpx integration; tests pass. This is a local prototype, not a publicly deployed or authenticated service.

## Data Terms

Event data and xG: [StatsBomb Open Data](https://github.com/statsbomb/open-data), revision `4b73468fc5b0f1950f9f66fada70ad3a4f9327cb`. Birth dates: [FIFA World Cup 2022 official squad list](https://fdp.fifa.org/assetspublic/ce44/pdf/SquadLists-English.pdf).

This is a local research prototype. Before publishing or commercializing, review source permissions. StatsBomb requires attribution and its official logo for shared analysis; obtain the logo from its [media pack](https://statsbomb.com/media-pack/). Do not assume open research data grants unrestricted commercial rights. No tracking, medical, market-value or transfer fields are extracted into the analytics schema.

The sidebar uses an illustrative football-pitch photograph from [Unsplash](https://images.unsplash.com/photo-1522778119026-d647f0596c20), not a photograph claimed to depict this dataset's tournament.