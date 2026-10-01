# Stage 5: Club Profile & Position-Specific Metric Weights

Last verified: 2026-10-01. User approved the revised historical multi-club implementation contract with "yes". Stage 5 is implemented and verified, ready for user review. Stage 6 remains unauthorized. The contract and its original focused design review are retained below; delivery evidence is at the end.

## Scope

### Requested Extension: Club Squad And Player Statistics

Use StatsBomb La Liga 2015/2016, competition 11/season 27, at pinned revision 4b73468fc5b0f1950f9f66fada70ad3a4f9327cb. Import all 380 listed matches across 20 clubs. Multiple local club profiles, separate weights and a club selector are in scope; multi-tenant accounts/hosting are not. Do not research paid alternatives again unless this source fails validation or the user changes scope.

Proposed squad view: club identity and season/sample, roster table with player name, position, age at the sample reference date, appearances, minutes and all available metric totals/per90; position/name filters and links to existing detailed profiles, percentiles, radar and comparisons when evidence permits. Clearly distinguish full registered squad coverage from players with observed match data. Goalkeepers can appear in the squad even though the preference score is unsupported.

Keep current World Cup samples isolated. Derive historical club membership from each match's source lineup and team ID. Display the union of observed match rosters as the 2015/16 observed squad, not a current or complete registered squad. No manual assignment, nationality-based inference or model-memory enrichment.

Initial statistics are appearances, minutes and all six currently supported metrics with totals/per90: non-penalty shots, npxG, key passes, completed passes, successful dribbles and tackles won. Other event metrics need their own definitions and tests before inclusion. Zero minutes yields null per90; never infer zero observations from an incomplete import. Historical age, age-cohort percentiles, radar and fit remain unavailable without verified population-wide DOB coverage. No enrichment restricted to World Cup survivors and no silent position-only cohort fallback.

Source and architecture are approved: [historical coverage evidence](DATA-SOURCES.md#stage-5-multiple-clubs-and-squad-statistics). Historical totals/per90 without age-cohort scores and a separate WC2022 preference demonstration were accepted.

| Extension challenge | Response | Verdict |
|---|---|---|
| Can World Cup team labels identify a club squad? | Use approved La Liga match lineups with team IDs, dates and provenance. | Addressed in design |
| Would a squad page falsely imply club-season performance or complete coverage? | Show competition/season/provenance and roster coverage; distinguish missing observations from zero. | Addressed in proposed design |
| Does "each club" invalidate single-profile JSON and singular routes? | Explicit club identifiers, separate preferences and club-scoped statistics in the contracts below. | Addressed in design |
| Does every player have every statistic? | Show only supported metrics and explicit missing evidence; GK may be listed without a fit score. | Addressed in proposed design |

Impact: adds squad UI, membership/provenance model, isolated historical import and associated API/tests. This exceeds the original settings-only feature; no delivery-time estimate is asserted before a full import. Acceptance checks cover season-specific membership, identity, provenance, observed versus registered coverage, missing data, club isolation and unchanged World Cup analytics.

### Club Preferences

Each imported club has its source name and editable weights for the six metrics, separately for CB, FB, DM, CM, AM, W and ST. Club IDs/names cannot be reassigned through preferences. Equal weights are an unsaved neutral starting configuration, not a claim about real club tactics. GK scoring is unsupported because goalkeeper-specific metrics are absent.

English/Spanish club settings page, linked from search and player profiles. A position selector, numeric weight inputs/sliders, effective percentage shares, save and reset actions, unsaved-change warning, loading/error/retry and save-confirmation states. Reset changes the draft only until explicitly saved. Navigation preserves language and search context.

A separate club-preference summary on the existing WC2022 player profile can use a selected club's saved weights and the existing eligible WC2022 percentiles. Label this as the club's current user-configured preferences applied to World Cup 2022 observations, not 2015/16 club performance or proof of membership. On historical club-player profiles show an explicit historical-cohort-unavailable state instead of a score. This keeps weights demonstrable without inventing historical ranks. Unsaved club preferences do not produce scores.

Observed totals/per90, cohort percentiles, search order, Stage 4 similarity weights and historical comparisons remain unchanged. No weighted search grammar, cross-cohort leaderboard, automatic club-to-World-Cup identity link, forecasts, recommendations or Stage 6 report. Club profiles preserve season/club context; existing World Cup routes retain their existing meaning.

## Calculation Contract

For a player's primary position, proposed score = sum(weight * existing percentile) / sum(weights). Weights are finite numbers from 0 through 100; each supported position must have a positive total. The server normalizes weights; the UI displays their effective shares. Zero weight explicitly excludes a metric.

The score is a 0-100 preference index, not a new percentile, probability, ability grade or prediction. Higher means higher weighted relative metric volume under the user's chosen preferences, not universally better football performance. It is meaningful only in the player's existing tournament/position/age-band cohort. Shots and npxG are correlated and can emphasize similar information twice.

Any positively weighted metric with a missing percentile makes the score unavailable. Never substitute missing data with zero or silently renormalize around missing metrics. Preserve genuine zero percentiles. Existing minimum-minute, peer-count and age requirements remain in force. No scores from the 2018 snapshot, whose cohort percentiles are withheld.

## Storage And APIs

Use data/cantera-clubs-2015-16.duckdb for one isolated La Liga competition-season. Do not change schema.sql or weaken the tournament importer's identity checks. A club-specific schema/importer reuses the provider, normalized metric events, minute logic and source cache while separating stable identity from membership:

| Entity | Key and ownership |
|---|---|
| Dataset | One pinned provider/competition/season, date range/reference date, schema/methodology versions and expected coverage |
| Clubs | Provider team ID and source name |
| Players | Provider player ID, identity names; no singleton team/shirt fields; null DOB unless independently verified |
| Match rosters | Match/player/team key with observed shirt number and provenance; shirt changes do not change identity |
| Matches, stints, events, sources | Existing evidence fields; validate source team IDs against match participants and roster membership |
| Club player summary/metrics | Aggregate by club AND player within this dataset; primary position from that club's playing intervals; six numerators and denominators share the same filter |

Players observed at multiple clubs have separate club-statistical records and one stable identity. Reject identity conflicts for explicit review; no fuzzy merges. The import stages to a temporary database, verifies 380 unique matches, 20 clubs/38 fixtures each, all expected source files and metric/minute invariants, then atomically replaces only the club database. Refuse destinations resolving to either World Cup store and reject overwriting an unrelated existing database. Failure retains the previous usable club store. CLI proposal: python -m cantera ingest-clubs. Environment override: CANTERA_CLUB_DB, with the same destination guards.

Store preferences separately in data/club-profiles.json (CANTERA_CLUB_PROFILES override), with schema version and a mapping keyed by allowlisted imported club IDs, each having its own revision. Require a JSON destination distinct from analytics files. Atomic replacement, single-process lock around read/check/merge/write, and expected per-club revision prevent lost updates both within and across clubs; stale saves return 409. Missing file or missing club settings returns an explicit unsaved default; malformed existing data returns an error, never an automatic reset. One local API worker only; no new dependency required.

- GET /api/clubs?lang=en: 20 imported clubs and dataset/coverage; missing dataset returns explicit 503.
- GET /api/clubs/{club_id}/players?lang=en: full observed squad, club-scoped minutes/appearances and six metric totals/per90; stable ID ordering. Client-side name/position filtering does not alter metrics.
- GET /api/clubs/{club_id}/players/{player_id}?lang=en: club-season player details/provenance; unknown membership returns 404 even if the player exists elsewhere.
- GET /api/clubs/{club_id}/profile: saved preferences/revision or unsaved default and supported metrics/positions.
- PUT /api/clubs/{club_id}/profile: exact validated weights and expected revision; reject unknown fields/clubs, negative/non-finite weights and all-zero positions.
- GET /api/players/{player_id}/club-fit?club_id={club_id}&lang=en: WC2022 observations only; explicit saved club context, contributions, score or unavailable reason. Unknown IDs return 404; unsaved preferences yield unavailable status.

UI routes: /clubs for selection, /clubs/{clubId} for observed squad and settings, /clubs/{clubId}/players/{playerId} for historical details. Preserve q/lang when linking back to search; never send a historical club ID to the default player route and imply a historical profile. Shared metric labels/formatting may be reused without conflating payload types.

Mutation is new to this prototype: require JSON, validate browser Origin against the configured local frontend origin, reject cross-site requests and keep both servers bound to loopback. This is not authentication or authorization for public hosting. Never accept a client-supplied file path. Atomic writes retain the prior file on failure; ordinary local file backups protect settings. No Git operations or external deployment are part of this stage.

## Focused Design Review

| Challenge | Proposed response | Verdict |
|---|---|---|
| Is a weighted score being presented as talent? | Label it club preference, expose every contribution and fixed cohort, prohibit prediction and cross-cohort ranking. | Addressed in design; user acceptance required |
| Can missing evidence improve a score? | Require every positively weighted percentile; preserve real zeros and existing thresholds. | Addressed in design |
| Can saving settings or a player's club change corrupt observations? | Separate files; per-club revisions under one lock; match-roster membership and club/player aggregation; tournament importer untouched. | Addressed in design |
| Do the weights secretly change Stage 4 or overstate metric coverage? | Keep similarity equal-weight and historical ranks absent; disclose correlated shots/npxG and unsupported GK. | Addressed in design |
| Does adding a write API make localhost publicly safe? | No. JSON/origin protections, fixed paths and loopback-only operation; public authentication remains out of scope. | Accepted prototype limitation, subject to user review |

Technical feasibility: schema.sql currently aggregates by player only and store.py rejects changes to a player's team/shirt. Those paths cannot directly ingest a club season. A separate club schema/importer avoids regressions while existing FastAPI/Pydantic, DuckDB, provider/minutes utilities and Next.js suffice. The two-match source probe is not a substitute for a full import test. Attribution must follow StatsBomb's published terms; commercial deployment rights remain unverified.

## Implementation And Verification Gate

Approved implementation checklist:

1. Implement club schema/import and aggregation with synthetic two-club fixtures; immediately verify player club changes, shirt changes, identity conflicts, club-specific metric/minute totals, zero minutes and destination/failure protections.
2. Import/reconcile all 380 matches; verify expected fixture sets, source checksums, roster membership, minute bounds and six metric numerators. Gate: stop on missing files or inconsistent coverage; no partial dataset presented as complete.
3. Implement preferences/calculation/API; test club isolation, saved/default states, scaling invariance, real zeros, excluded/missing metrics, GK, historical-score suppression and existing WC2022 cohort preservation. Test concurrent different-club saves, same-club revision conflicts, malformed files, atomic failure preservation, origin policy and bilingual 404/error states.
4. Implement bilingual selector/squad/details/settings and optional WC2022 club-preference section; verify all 20 clubs, exact API values, club-context navigation, save/reload/reset/unsaved changes and error recovery on desktop/mobile. Gate: inspect screenshots and missing-evidence labels before completion.
5. Run existing backend/browser regressions and lint/build; prove both World Cup hashes and existing search/similarity values unchanged. Update docs/tracker and present Stage 5 for review; do not start Stage 6.

Gate: implementation complete; awaiting user review of Stage 5, not a new implementation GO. No Stage 6 work, Git branch changes, commit, push or deployment was performed.

## Delivery Evidence

- Complete import: 380 matches, 20 clubs with 38 fixtures each, 601 stable player identities, 761 source records; dates 2015-08-21 through 2016-05-15. All source hashes verified; six metrics independently reconciled by club/player to the raw event files. Atomic imports, conflicting identities, club changes, shirt changes and zero-minute observations are tested.
- Full-season timing audit found 14 post-Half-End annotations. The bounded club-only policy preserves raw evidence and match durations; World Cup defaults remain strict. Rules and evidence are documented in [playing time](DATA-REFERENCE.md#playing-time-and-position).
- Backend: club-specific schema/importer plus `preferences.py`; existing tournament schema is unchanged. API exposes the six route families above, with guarded JSON saves, per-club revisions, storage errors and bilingual evidence. UI routes share the `clubs/[[...segments]]` page, with shape/ID validation.
- Preference tests cover finite bounded weights, positive totals, scaling invariance, real zero ranks, excluded/missing metrics, GK and unsupported scope, malformed storage, concurrent different-club saves, stale revisions and atomic failure preservation.
- 135 Python tests pass. All 20 browser cases pass on desktop/mobile, including actual isolated preference saves, reload, reset-draft, unsaved language/navigation guards, conflicts, different-club isolation, historical details/provenance, WC2022 index, errors/retry and prior search/profile/comparison workflows. Lint, type checks and production build pass. Screenshots inspected under `web/test-results/`.
- WC2022 SHA-256 remains `f8c1503cebb9020f46e40fd339923f27fa7c90a3fd2073dbf633150e25d3af0d`; WC2018 remains `7a72542989653734f134aeccd92100adbae2aa7fe960bfeb003bf7db591bd41b`.
- Normal preferences were not modified by verification. Mutation browser cases require `CANTERA_CLUB_TEST_API` pointing to a separate local API with a temporary JSON path; otherwise those cases skip. Commands and environment variables are in [README](../README.md#clubs-and-preferences).
- Remaining boundaries: no verified historical DOB, current/registered squad claim, historical age-cohort ranks, public authentication, licensed current data or Stage 6 recommendation. Single local API process only; published-data licensing review remains required. Existing Starlette/httpx deprecation warning is non-failing.