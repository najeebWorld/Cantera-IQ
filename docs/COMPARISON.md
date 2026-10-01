# Stage 4: Player Comparison

Last verified: 2026-10-01. Status: approved WC2018/WC2022 snapshot scope implemented and verified; awaiting user review. Continuous season development and predictions are not implemented. See [data-source audit](DATA-SOURCES.md).

## Similarity

The bilingual player profile reuses player_metrics without changing cohorts or the ingestion schema. Comparisons include only other players in the same primary position, age band and competition-season, with all six qualified percentiles present. Eligibility is not relaxed to fill a list. The selected player and goalkeepers are excluded from similarity.

Candidates are ordered by the mean absolute difference of their six existing percentiles, ascending, then player_id for deterministic ties. Distance is in percentile points (0 means identical on these metrics), not a probability, talent score or claim of equal ability. Each metric has equal weight; club-specific weights remain Stage 5. Expand a candidate to see all six paired per90 values, percentiles and absolute differences. The page shows minutes and sample evidence; the existing profile supplies cohort context. There is no additional comparison radar.

API: GET /api/players/{player_id}/similar?lang=en&limit=5 (limit 1-10). Returns eligibility, method, source profile, candidate count and selected comparisons. Unknown player: 404. Insufficient evidence or unsupported GK comparison: successful response with explicit reason and no candidates. Search query and language are preserved while navigating profiles.

## Historical Snapshots

After research, the user approved World Cup 2018 versus 2022. The implementation uses two isolated single-competition databases rather than migrating the working 2022 schema. This preserves independent minutes, roles, teams, shirts, ages and cohorts by construction. Do not append historical matches to the current database.

Run `python -m cantera ingest-history` to atomically build data/cantera-2018.duckdb. The default 2022 database is protected from this command; an existing destination from another tournament is rejected. CANTERA_HISTORY_DB optionally selects the API's historical file. Default search and profiles remain 2022.

GET /api/players/{player_id}/history?lang=en pairs the same StatsBomb player ID only when full names match after Unicode decomposition, accent removal, case folding and whitespace normalization. Conflicting names or recorded birth dates withhold the historical profile. Historical national team and shirt are retained; the 2022 team/shirt birth-date lookup is never run on 2018 rosters. The response reuses verified FIFA birth-date provenance only after identity matching, computes age at 2018-06-14, and never writes enriched dates into the historical cohort database.

Both periods must have at least 180 minutes (their stored policy threshold) before the UI shows paired totals/per90 and the signed 2022-minus-2018 rate difference. Otherwise only snapshot metadata and the unavailable reason are shown. Missing files, missing players and identity conflicts have explicit states. Historical percentiles and peer counts are always null: importing only known birth dates for returning players would create survivorship-biased ranks. No historical radar, percentile change or projected trajectory is produced.

All 64 historical matches and all 736 roster identities are retained, including players absent from 2022. 604 played minutes; 208 roster IDs match active 2022 players, and 96 have >=180 minutes in both samples. These are repeated tournament observations, not representative longitudinal development coverage. Opponents, roles, selection, possession and sample size differ; supplied xG model equivalence remains unverified. Rates include all roles.

Source manifests remain in the checksummed cache, with URL/hash references in each database's sources table; match source revisions remain in matches. The 2018 and 2022 competition/season IDs are 43/3 and 43/106. Version metadata remains in the pinned raw manifests, not a new normalized version table. Generic multi-period storage, a historical search selector, other providers and club transfers within a season remain outside this two-snapshot implementation.

## Focused Review

| Challenge | Response | Verdict |
|---|---|---|
| Can results look similar only because of different ranking populations? | Restrict to the same existing position/age cohort and competition-season. | Implemented and tested |
| Could missing values appear as zero or inflate similarity? | Require all six qualified percentiles on both sides. Preserve genuine zeros. | Implemented and tested |
| Is distance a claim about talent or future success? | Report percentile-point distance and all contributions; no predictive label. Six volume metrics are a limited description. | Accepted limitation |
| Can this describe a goalkeeper or continuous development? | Exclude GK similarity; historical general event counts are descriptive, not goalkeeper assessment. No continuous-development claims. | Accepted limitation |
| Could equal weighting double-count related metrics? | Shots and npxG are correlated. State equal weighting and limited feature coverage; no talent ranking or learned weights. | Accepted limitation |

## Verification

124 Python tests and 14 desktop/mobile Playwright cases pass; lint/build pass. Tests cover exact similarity distances/ties, unchanged cohort sizes, identity conflicts, destination protection, no-history cases, historical ages, null ranks, both languages, exact displayed paired metrics and independent retries. All six metrics reconcile to checksummed source events across all 128 matches; interval overlap and team-minute bounds pass. Existing radar canvas-pixel checks remain green. Desktop and mobile screenshots were inspected.

The 2022 database SHA-256 before and after historical import is identical: f8c1503cebb9020f46e40fd339923f27fa7c90a3fd2073dbf633150e25d3af0d. Existing schema and search calculations are unchanged. Demo player: /players/3009. Stages 5-6 require separate approval.