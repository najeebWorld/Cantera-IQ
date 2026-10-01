# Project Tracker: Cantera IQ

Last updated: 2026-10-01

## Roadmap

| ID | Feature | Status |
|---|---|---|
| 01 | Provider abstraction, DuckDB, player table, per90, cohorts, ten-player sample | Complete; user approved progression |
| 02 | Constrained English/Spanish player search and Next.js search screen | Complete; user approved progression |
| 03 | Next.js bilingual player page, radar and percentiles | Complete; user approved progression |
| 04 | Similar players and historical comparison | Complete in approved snapshot scope; user approved progression to Stage 5 |
| 05 | Multiple historical clubs, squads and position-specific preferences | Implemented and verified; awaiting user review |
| 06 | One-page explainable development report | Not authorized yet |

## Verification

135 Python tests and 20 desktop/mobile browser tests pass; Next.js lint/build pass. All six metrics reconcile to checksummed source events across 508 matches. Club isolation, atomic import/preferences, concurrent different-club saves, conflicts, missing evidence and existing search/profile/comparison behavior pass. Browser mutation tests use an isolated temporary preferences file. Screenshots inspected. Both World Cup SHA-256 hashes unchanged. Known non-failing Starlette/httpx deprecation warning. Delivery contracts: docs/CLUB-PROFILE.md and docs/COMPARISON.md.

## Active Work

### Stage 5

**Decision:** User approved the revised historical multi-club contract. Implemented La Liga 2015/16, 20 clubs/380 matches, observed squads, club-specific statistics and separate per-position preferences. Historical age/ranks/fit remain unavailable; eligible WC2022 profiles demonstrate saved preferences separately. The original singleton proposal is superseded. No current-data acquisition, accounts or paid-provider work.

**Delivery:** [Club profile contract and evidence](../docs/CLUB-PROFILE.md#delivery-evidence). Full source import and independent metric reconciliation completed. Fourteen period-boundary annotations are handled by a tested, documented club-only minute policy without changing source JSON or World Cup defaults. Local demo: http://127.0.0.1:3002/clubs.

- [x] Scope affected components and write focused design review
- [x] Confirm multiple clubs and research available sources
- [x] Resolve club scope and club-season data source; revise storage/API design and review gate
- [x] User GO on revised Stage 5 design
- [x] Implement isolated import and reconcile complete season
- [x] Implement and verify calculation and configuration
- [x] Implement and verify persistence/API boundaries
- [x] Implement and verify bilingual settings/profile UI
- [x] Run regression gates and present Stage 5 review
- [ ] User review of Stage 5 delivery

### Stage 4 Delivery Record

The user chose research first, then approved WC2018/WC2022 snapshots. Delivery uses isolated databases rather than a generalized schema migration. All 736 historical roster identities retained, 604 active players; 208 IDs match active 2022 players and 96 meet >=180 minutes in both samples. Similarity uses equal-weight mean absolute percentile distance within the existing 2022 cohort. Historical comparison uses verified ID/name matching, source-preserving age enrichment for display only, and null historical ranks. No new dependencies. Implementation and limitations: docs/COMPARISON.md; research: docs/DATA-SOURCES.md.

- [x] Similarity calculation and eligibility tests
- [x] Isolated full 2018 import and source reconciliation
- [x] Bilingual APIs and profile comparison sections
- [x] Desktop/mobile verification and Stage 1-3 regression
- [x] Documentation and scope synchronization
- [x] User approved progression to Stage 5

## Review Gate

Stage 5 is ready for user review. Stage 4 remains a snapshot comparison, not continuous development or prediction. Stage 6 and the final question-to-report demo remain outside current authorization. Current observed branch is main; no branch operations, commit or push were performed for Stage 5. Do not perform Git mutations without a new instruction.