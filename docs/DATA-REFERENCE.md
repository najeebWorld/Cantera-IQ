# Data Reference

Last verified: 2026-10-01. Methodology: stage1-v1.

## Tables

| Relation | Grain | Purpose |
|---|---|---|
| matches | match_id | Match dates, duration, raw event count, source revision |
| players | player_id in one competition-season | Names, national team, shirt, birth date and its provenance |
| stints | match + player + interval start | Non-overlapping active playing intervals and position groups |
| events | original StatsBomb event UUID | Six metric contributions and source JSON for auditing |
| sources | source URL | Retrieval timestamp, SHA-256, local cache path and byte count |
| settings | one row | Age reference date and evidence thresholds |
| player_summary (view) | player | Age, primary position, minutes, appearances and primary-position share |
| metric_totals (view) | player + metric | Aggregated event contributions |
| player_metrics (view) | player + metric | Total, per90, percentile, peer_count, evidence_status |

Full downloaded event and lineup JSON is preserved in the source cache. The events table contains only the supported metric event types, not every raw event. kloppy can emit multiple typed records for one source event: the adapter deduplicates on the original UUID and checks coverage against raw event types.

Stage 4 retains this schema in two physically isolated databases: data/cantera.duckdb (WC2022, default search/profile) and data/cantera-2018.duckdb (WC2018, historical API only). Every view above is local to its own competition-season. No aggregated view unions periods. The historical import has all 64 matches, 227825 raw events, 69798 metric events, 736 roster identities and 604 active players; all historical stored birth dates remain null. Full details: [comparison contract](COMPARISON.md).

Stage 5 uses a separate `club_schema.sql` and `data/cantera-clubs-2015-16.duckdb`: 380 La Liga 2015/16 matches, 20 clubs, 601 players and 761 sources. Stable `players` have no singleton team/shirt fields; `rosters` associates match/player/team/shirt, and stints/events reference this membership. `club_players` and `club_metrics` group by club AND player. Birth dates, ages, percentiles and peer counts remain NULL. Sources include all match-event and lineup files plus the season schedule. Independent source reconciliation covers every club/player numerator. Full contract: [club profiles](CLUB-PROFILE.md).

Preferences are not analytical observations. `data/club-profiles.json` stores schema version 1 and club-ID-keyed weights/revisions; writes are atomic under one process lock and reject stale revisions. The WC2022 preference index uses saved positive weights and existing percentiles only, with no change to either World Cup database or the equal-weight Stage 4 distance.

## Identity And Age

Age is completed years on the earliest match date in the imported competition-season. In the demo this is 2022-11-20, not today's age or the age on each appearance. A player who turns 24 during the tournament remains in the opening-day age cohort.

FIFA identities are joined using the fixed 2022 tournament + national team + shirt number. This avoids guessing from name spellings. The FIFA source name is retained for human review; no fuzzy name matching is used. Explicit country aliases handle USA, Korea Republic and IR Iran. Unmatched dates are NULL and excluded from age-filtered samples and percentiles. Unknown ages remain visible in player_summary. Squad-list names are not independently verified against a second birth-date source.

Historical display matches the same StatsBomb ID and normalized full name, rejects conflicts, and reuses current verified birth-date provenance without changing stored historical data. The historical age reference is 2018-06-14. Team, shirt, primary role, minutes and appearances remain period-specific. Historical age bands/percentiles/peer counts are not published, even for matched identities, to avoid ranks based only on returning players. The derived response evidence status is historical_cohort_unavailable; it is not a persisted player_metrics status. The two-period rate comparison requires each sample's minimum minutes.

## Playing Time And Position

Period-relative timestamps are converted to continuous playing seconds by summing each previous period's Half End timestamp. Both teams' duplicate Half End events are merged using the maximum. Intervals start at Starting XI or Substitution/Player On and end at Substitution, Player Off, dismissal or the last period end. Tactical Shift changes the position group without adding minutes. Temporary off/on absences are excluded when recorded. Missing period ends fail the import.

Only periods 1-4 count. Stoppage time and extra time count; breaks and shootouts do not. This differs deliberately from the conventional 90/120-minute cap. It is elapsed on-field time, not ball-in-play time. Position intervals in lineup JSON are not used because the source contains overlapping/inconsistent intervals.

The club importer enables `allow_boundary_annotations`; World Cup defaults stay strict. An audit of all 380 club event files found 14 annotations after Half End: Ball Recovery/Ball Receipt*/Carry within 1.092 seconds, five yellow-card Bad Behaviour records within 32.992 seconds, and a Player On record 0.511 seconds after the first-half end in match 3825739. The named non-metric annotations are ignored by the minute state machine within bounds of 2 seconds (ball annotations) or 60 seconds (yellow cards). Player On within 1 second of a non-final boundary is applied at that boundary, adding no break time. The affected player was substituted at second-half start. Late metric events, substitutions, dismissals and unrecognized/out-of-bound annotations still fail ingestion. Source timestamps/JSON and Half End durations are not rewritten.

Primary position is the group with most total seconds, with alphabetical group code as deterministic tie-break. Rates include all the player's events across all positions, not just their primary-role intervals. main_position_share exposes mixed-role exposure.

| Group | StatsBomb position IDs |
|---|---|
| GK | 1 |
| CB | 3, 4, 5 |
| FB | 2, 6, 7, 8 |
| DM | 9, 10, 11 |
| CM | 13, 14, 15 |
| AM | 18, 19, 20 |
| W | 12, 16, 17, 21 |
| ST | 22, 23, 24, 25 |

## Metrics

Every rate is `sum(metric contributions) * 90 / sum(playing minutes)`. Never average match-level rates. Zero playing minutes produces NULL; a participating player with no qualifying events gets zero. Missing non-penalty shot xG fails ingestion instead of becoming zero.

| Metric | Numerator |
|---|---|
| shots | Shot events excluding type Penalty |
| npxg | Sum of statsbomb_xg on non-penalty shots |
| key_passes | Pass events with shot_assist=true, regardless of goal outcome |
| completed_passes | Pass events without outcome, including set pieces |
| successful_dribbles | Dribble events with outcome Complete; not carries |
| tackles_won | Duel, subtype Tackle, outcome Won / Success In Play / Success Out |

Non-penalty shots and npxG exclude regulation/extra-time penalties as well as shootouts. These are volume metrics, not completion or success percentages. npxG estimates chance quality using StatsBomb's supplied model; Cantera does not train or invent it.

## Percentiles And Evidence

Peers share the same competition-season, primary position group and age band: U20 (below 20), 20-23 inclusive, 24-29 inclusive, 30+. Only players with known ages and >=180 minutes enter the cohort. A percentile is published only if that cohort contains >=5 players, including the player being evaluated. Display limits and filters are applied after comparison calculations.

`percentile = 100 * (L + (T - 1)/2) / (N - 1)`

L is the number with a lower rate, T the count tied including self, N the cohort size including self. Rates are rounded to eight decimals for tie identification, without rounding output calculations. Unique minimum/maximum values yield 0/100; an all-tied group yields 50. Percentiles measure relative metric volume, not talent probability.

| evidence_status | Rule |
|---|---|
| no_minutes | Zero playing time; rate and percentile NULL |
| missing_birth_date | Unknown age; percentile NULL |
| insufficient_minutes | Below 180 minutes; rate shown with warning, percentile NULL |
| insufficient_peers | Fewer than 5 qualified peers; percentile NULL |
| limited_sample | Eligible, but below 450 minutes or below 10 peers |
| moderate_sample | At least 450 minutes and 10 peers |

These are transparent prototype policy thresholds, not statistically calibrated confidence estimates. No high-confidence label is assigned. Small tournament samples and event rarity still matter even in a moderate sample. Large numbers of tied zeros can have nonzero percentiles, without implying useful performance.

## Limitations And Operations

- World Cup selection bias, opponent quality, tactics and possession are not adjusted. No inference about current form, academy promise or future first-team readiness is supported.
- Goalkeepers receive the same descriptive event counts, but require goalkeeper-specific assessment before any recommendation.
- If a source lacks comparable event definitions or xG, replace its normalization explicitly; do not silently equate providers' metrics.
- The import writes to a separate database and replaces the target only after complete success. The CLI expects all 64 matches. Repeated imports reuse checksummed cached files and do not duplicate rows.
- Stop API readers before reimporting; concurrent ingestion processes are not supported. Imports are local trusted administrative operations.
- No LLM generates values, ranks or recommendations in stage 1. Every exported/player API number comes from DuckDB.
- Birth-date enrichment uses a cached official FIFA PDF. To intentionally refresh this mutable source, remove its cache entry and reimport, retaining previous provenance externally if historical snapshots are required.