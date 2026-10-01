# Project Tracker: Cantera IQ

Last updated: 2026-10-01

## Roadmap

| ID | Feature | Status |
|---|---|---|
| 01 | Provider abstraction, DuckDB, player table, per90, cohorts, ten-player sample | Complete; user approved progression |
| 02 | Constrained English/Spanish player search and Next.js search screen | Complete; user approved progression |
| 03 | Next.js bilingual player page, radar and percentiles | Implemented and verified; awaiting user review |
| 04 | Similar players and historical development comparison | Not authorized yet |
| 05 | Club profile and position-specific metric weights | Not authorized yet |
| 06 | One-page explainable development report | Not authorized yet |

## Verification

107 Python tests and ten desktop/mobile browser tests pass; Next.js lint/build pass. Includes complete live-source shot/npxG reconciliation, minute bounds, atomic reimport, API validation, search grammar, fixed cohorts, bilingual UI, missing evidence, clarification, empty results and error/retry. Profile tests verify view equality, null/zero distinctions, exact displayed rates/percentiles, nonblank radar pixels, unavailable-radar states, unknown players and return-to-search context. Desktop/mobile screenshots visually inspected. All 64 World Cup 2022 matches loaded; zero unmatched birth dates. Known non-failing Starlette/httpx deprecation warning. Contracts: README.md and docs/SEARCH.md.

## Active Work

Stage 3 implementation complete after explicit approval. Database-backed profile API, bilingual player page, six-axis Chart.js radar, metric calculations, cohort/evidence context and source provenance are ready for review. No external LLM or paid service configured. No talent score, similarity or development recommendation added.

## Review Gate

STOP after presenting Stage 3 results. Stage 4 (similar players and historical development comparison) requires explicit approval and a coverage check: the current database is one historical tournament, not longitudinal player histories. Final five-minute question-to-report demo remains future scope.