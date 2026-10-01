# Project Tracker: Cantera IQ

Last updated: 2026-10-01

## Roadmap

| ID | Feature | Status |
|---|---|---|
| 01 | Provider abstraction, DuckDB, player table, per90, cohorts, ten-player sample | Complete; user approved progression |
| 02 | Constrained English/Spanish player search and Next.js search screen | Complete; user approved progression |
| 03 | Next.js bilingual player page, radar and percentiles | Complete; user approved progression |
| 04 | Similar players and historical comparison | Approved WC2018/WC2022 snapshot scope implemented; awaiting user review |
| 05 | Club profile and position-specific metric weights | Not authorized yet |
| 06 | One-page explainable development report | Not authorized yet |

## Verification

124 Python tests and 14 desktop/mobile browser tests pass; Next.js lint/build pass. All six metrics reconcile to checksummed source events across 128 matches; minute bounds, identity conflicts, snapshot isolation, import protection and existing search/profile behavior pass. Browser tests verify paired values, similarity details, language/navigation, unavailable evidence, independent retries, nonblank radar pixels and page overflow. Screenshots visually inspected. Original 2022 database SHA-256 is unchanged. Known non-failing Starlette/httpx deprecation warning. Contract: docs/COMPARISON.md.

## Active Work

The user chose research first, then approved WC2018/WC2022 snapshots. Delivery uses isolated databases rather than a generalized schema migration. All 736 historical roster identities retained, 604 active players; 208 IDs match active 2022 players and 96 meet >=180 minutes in both samples. Similarity uses equal-weight mean absolute percentile distance within the existing 2022 cohort. Historical comparison uses verified ID/name matching, source-preserving age enrichment for display only, and null historical ranks. No new dependencies. Implementation and limitations: docs/COMPARISON.md; research: docs/DATA-SOURCES.md.

- [x] Similarity calculation and eligibility tests
- [x] Isolated full 2018 import and source reconciliation
- [x] Bilingual APIs and profile comparison sections
- [x] Desktop/mobile verification and Stage 1-3 regression
- [x] Documentation and scope synchronization
- [ ] User review of Stage 4

## Review Gate

Review the implemented snapshot comparison at /players/3009. Do not label it continuous development analysis or prediction; incomplete historical DOB coverage precludes historical percentiles. Stages 5-6 require separate approval. Final five-minute question-to-report demo remains future scope.