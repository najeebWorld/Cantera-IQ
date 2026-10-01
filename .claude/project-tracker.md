# Project Tracker: Cantera IQ

Last updated: 2026-10-01

## Roadmap

| ID | Feature | Status |
|---|---|---|
| 01 | Provider abstraction, DuckDB, player table, per90, cohorts, ten-player sample | Complete; user approved progression |
| 02 | Constrained English/Spanish player search and Next.js search screen | Implemented and verified; awaiting user review |
| 03 | Next.js bilingual player page, radar and percentiles | Not authorized yet |
| 04 | Similar players and historical development comparison | Not authorized yet |
| 05 | Club profile and position-specific metric weights | Not authorized yet |
| 06 | One-page explainable development report | Not authorized yet |

## Verification

92 Python tests and four desktop/mobile browser tests pass; Next.js lint/build pass. Includes complete live-source shot/npxG reconciliation, minute bounds, atomic reimport, API validation, search grammar, fixed cohorts, bilingual UI, missing evidence, clarification, empty results and error/retry. All 64 World Cup 2022 matches loaded; zero unmatched birth dates. Known non-failing Starlette/httpx deprecation warning. Contract and focused review: docs/SEARCH.md.

## Active Work

Stage 2 implementation complete. Await review of the constrained grammar: this is not unrestricted language understanding. No external LLM or paid service configured. Search does not add a composite talent ranking.

## Review Gate

STOP after presenting Stage 2 results and its language limitations. Stage 3 (player page/radar) requires explicit approval. Final five-minute question-to-report demo remains future scope.