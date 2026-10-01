# Cantera IQ

Working stages 1-4 prototype: StatsBomb Open Data -> replaceable provider -> isolated DuckDB snapshots -> read-only FastAPI -> English/Spanish Next.js search, player profiles, similarity and historical tournament comparisons. Stage 2 uses a constrained local grammar, not an LLM or unrestricted language understanding.

## Run

Requires Python 3.10+ and internet access for the first import. No API keys or hosted services.

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python -m cantera ingest
.venv/bin/python -m cantera ingest-history
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
- `GET /api/players/{player_id}?lang=en` or `lang=es`: one player's metadata, all six metrics, definitions, evidence, cohort context, dataset scope and methodology; unknown IDs return 404.
- `GET /api/players/{player_id}/similar?lang=en&limit=5`: same-cohort comparisons with explained percentile-point distances; limit 1-10.
- `GET /api/players/{player_id}/history?lang=en`: identity-checked 2018/2022 snapshots with explicit insufficient-evidence states and no historical percentiles.
- `CANTERA_HISTORY_DB`: optional historical API database path; defaults to `data/cantera-2018.duckdb`.
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
- [Stage 4 comparison contract and verification](docs/COMPARISON.md).
- [Data-source research and scope decision](docs/DATA-SOURCES.md).

The import uses all 64 matches of the men's World Cup 2022, not the entire StatsBomb repository. Player ages are at 2022-11-20. The team field is the national team in the observed matches, not a current club. The sample is ordered by minutes, not talent. These are historical first-team observations, not academy coverage.

StatsBomb Open Data does not provide birth dates. The separate FIFA adapter supplies them from the official tournament squad PDF, matched by tournament, national team and shirt number. Source names and source hashes remain in DuckDB for audit. No dates are inferred by an LLM.

## Player Profiles

Click a player name in the search results to open `/players/{player_id}`. The profile contains historical identity and playing time, a six-axis percentile radar, comparison-group details, raw totals and per90 rates, expandable metric calculations, and source links. The return link preserves the submitted search and interface language. Direct profile URLs also work, including players outside the search's age/minute filters.

The radar uses Chart.js through react-chartjs-2, with a fixed 0-100 scale and the database's existing percentiles. It is shown only when all six percentiles are available. Missing values remain `--`, not zero; genuine zero values remain visible. Low minutes, too few peers, missing birth dates and no appearances retain their evidence labels. Goalkeepers get a warning that these are general metrics, not a goalkeeper evaluation. Cohorts do not change when opening a profile or switching language.

Implementation: `cantera.store.player_profile` reads `player_summary` and `player_metrics`; `cantera.api.profile` adds localized definitions and evidence. The frontend route lives in `web/app/players/[playerId]/`. No schema changes, new analytics model or generated player statistics are involved. Displayed arithmetic is rounded; API values retain database precision.

## Boundaries

Search supports a documented English/Spanish grammar for position, age, national team, minimum minutes, one metric, numeric thresholds and descending order. Unsupported language, qualitative potential, tracking speed and conflicting requests require clarification. Stage 4 implements the approved WC2018/WC2022 snapshot scope, not continuous seasons or a development forecast. No composite talent score, club weighting or recommendations. kloppy is used for event parsing; socceraction is not needed yet. The interactive radar uses Chart.js; mplsoccer is not installed. Stages 5-6 require separate approval.

Profiles now include up to five similar players, expandable paired metrics, and same-player historical totals/per90 with changes when both tournaments have sufficient minutes. All 64 matches per tournament are isolated in separate databases; 2018 has 736 roster players, 604 active players and 96 players with >=180 minutes in both samples. Historical age-cohort percentiles are withheld because full birth-date coverage is unavailable. Verified 2022 birth-date provenance is reused for paired display only after matching StatsBomb ID and normalized name. The original 2022 file and search defaults remain unchanged.

Only one competition-season per database is supported. Provider replacement uses the normalized `MatchBundle`, `MatchProvider` and `BirthDateProvider` contracts. The FIFA 2022 identity adapter must not be reused for another tournament. Tactical and minute interpretation is owned by the StatsBomb adapter; analytics SQL does not parse provider JSON.

## Verification

Tests cover stoppage time, half-time substitutions, extra time, temporary exits, red cards, tactical changes, shootout exclusion, birth-date boundaries, tied percentiles, cohort isolation, insufficient samples, API validation, atomic import failure and repeat imports. With both snapshots imported, tests reconcile all six metrics in all 128 matches against checksummed raw data and check interval overlap and team-minute bounds.

124 Python tests pass, including similarity distances, snapshot isolation, identity conflicts and historical evidence. Fourteen Playwright cases cover actual database search, profiles, comparisons, calculations, English/Spanish, clarification, empty results, unavailable API/retry, unknown players, return-to-search context, image availability and desktop/mobile page overflow. Profile tests compare displayed metrics with the API and verify nonblank radar pixels; missing percentiles must render no canvas. Desktop/mobile screenshots were visually inspected and are saved under `web/test-results/`. Lint and production build pass.

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