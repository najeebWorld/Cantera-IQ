# Project Tracker: Cantera IQ

Last updated: 2026-10-01

## Roadmap

| ID | Feature | Status |
|---|---|---|
| 01 | Provider abstraction, DuckDB, player table, per90, cohorts, ten-player sample | Complete; awaiting user approval |
| 02 | Natural-language player search | Not authorized yet |
| 03 | Next.js bilingual player page, radar and percentiles | Not authorized yet |
| 04 | Similar players and historical development comparison | Not authorized yet |
| 05 | Club profile and position-specific metric weights | Not authorized yet |
| 06 | One-page explainable development report | Not authorized yet |

## Verification

24 tests pass, including complete live-source shot/npxG reconciliation, minute bounds, atomic reimport and API validation. All 64 World Cup 2022 matches loaded; zero unmatched birth dates. Example outputs in reports/. Known non-failing Starlette/httpx deprecation warning.

## Review Gate

STOP after presenting stage-one results. Do not start later stages without explicit user approval. Final five-minute end-to-end product demo remains future scope, not delivered by stage 1.