# Stage 6: Explainable One-Page Player Report

Status: implemented and verified, 2026-10-01; awaiting user acceptance. The user approved both progression and the focused bilingual report/browser print-to-PDF contract. No backend, dependency, schema or analytical calculation changes were needed.

## Scope And Impact

Add an English/Spanish report for an existing World Cup 2022 player. Reuse verified profile, similarity, historical comparison and saved club-preference calculations. Do not change ingestion, schemas, cohort eligibility, metric definitions, similarity weights, search ordering or preference storage. No new data acquisition, LLM service, accounts, public hosting or Git operations.

The report is an evidence summary, not a development forecast or a training prescription. The project roadmap's "development report" does not establish that two tournament snapshots measure continuous development.

Affected surfaces: a new report page under the existing player route, a link from the player profile, scoped screen/print styles and focused browser tests. Existing backend endpoints should suffice; change backend contracts only if a verified implementation gap requires a separate review. Update README and project handoff after delivery. No existing architectural decision is superseded.

## User Flow

1. Search for a player, open the existing profile, then open the report.
2. Route: `/players/{playerId}/report?lang=en|es&q=...&club_id=...`. Preserve language and search context on return; validate player/club IDs as positive signed 64-bit integers and limit q to 500 characters.
3. A club selector is optional. No selection means no club-preference claim. Selecting a club reads its saved preferences; the report cannot edit or save them.
4. Provide an explicit reload action and a print action. Print opens the browser dialog, where the user can choose Save as PDF. Direct server-side PDF download and a report archive are out of scope.
5. On-screen layout is responsive. Desktop Chromium print output must fit one A4 portrait page at 100% scale with browser headers/footers disabled. Do not hide evidence warnings or clip content to achieve the page limit.

## Report Contents

| Section | Content and limit |
|---|---|
| Identity and sample | Name, national team, primary position, age at reference date when verified, minutes, appearances and tournament dates. Never current age or inferred club membership. |
| Metrics | All six metric totals, per90 and existing WC2022 cohort percentiles; cohort identity, qualified peer count and eligibility thresholds. |
| Visual profile | Reuse the existing radar only when all six percentiles are available. Otherwise show the actual missing-evidence reason; never plot null as zero. |
| Historical comparison | Six per90 values for 2018 and 2022 with existing deltas when the existing comparison is eligible. Include each sample's minutes and positions. No historical percentiles or interpolated trajectory. |
| Similar players | Up to three eligible names, primary position/age-band context and existing equally weighted percentile-point distances. Lower distance means a closer observed profile, not higher talent. |
| Club preferences | Optional saved club name, revision, 0-100 preference index and six effective weight/contribution values, or an explicit unavailable reason. Clearly applies to WC2022 observations, not historical club performance. |
| Summary and evidence | At most two deterministic observations tied to displayed metric values, plus sources, methodology version, report-loaded time and limitations. No generated facts, causal claims, recommendations or forecasts. |

Summary rules: identify highest/lowest available cohort percentiles with deterministic metric-order tie handling; describe relative observed volume, not strength/weakness or ability. If the profile is ineligible or ranks are all equal, report that condition instead of inventing distinctions. Historical changes are labeled numerical differences between samples, never improvement/decline in ability. No aggregate confidence score.

## Data And State Contract

Reuse these existing GET endpoints:

- `/api/players/{player_id}`: required base profile, metric definitions, dataset scope and methodology.
- `/api/players/{player_id}/similar` with `limit=3`: same-cohort candidates and distances.
- `/api/players/{player_id}/history`: approved snapshot comparison or explicit unavailable reason.
- `/api/clubs`: selector options only; failure must not prevent a report without a club.
- `/api/players/{player_id}/club-fit` with `club_id`: selected club, saved preference revision, index and contributions.

Key every loaded result by player, language, selected club and reload generation. Abort superseded requests, use existing request timeout patterns and reject stale responses. Fetch with no-store; a loaded report remains a fixed client-side view until reload. Source databases are the pinned local snapshots, not a live atomic cross-database transaction.

Required profile failure blocks report output and offers retry; unknown player is 404. Optional endpoint failures are visibly distinct from genuine insufficient evidence, with retry available. Disable printing while any selected report section is loading or has a transport/server error. A successful API response explaining unavailable evidence is a valid printable state. Changing player/language/club must never print a mixture of old and new content.

Reject unsupported base dataset scopes rather than labeling arbitrary data WC2022. Unknown club selection produces an explicit error and a clear-selection action, not silent fallback. Preserve zero values, and display missing values as unavailable. Unsupported goalkeeper comparisons and scores remain unavailable.

Sources: link the pinned StatsBomb event revision and the player's recorded FIFA DOB source, retain attribution, and show methodology version and saved preference revision where applicable. The loaded timestamp is not a data freshness claim. Detailed calculation/source inspection remains available through the existing profile and linked methodology.

## Focused Design Review

| Challenge | Response | Verdict |
|---|---|---|
| Does the title imply proven player development? | Use an evidence-summary title in the UI and explicitly label snapshots; prohibit causal or predictive wording. | Addressed in design |
| Can loading failures or stale requests create a convincing but false report? | Key/abort requests; distinguish errors from unavailable evidence; block printing until selected sections settle successfully. | Addressed in design |
| Can a selected historical club imply membership or 2015/16 fit? | Only use the existing WC2022 preference endpoint, with club name/revision and explicit observation scope. | Addressed in design |
| Will the one-page constraint suppress important evidence? | Bound similar players and narrative length, keep all six metrics and limitations, verify PDF page count and rendered clipping; revise layout rather than hide data. | Requires print verification |
| Does reuse of separate endpoints guarantee an atomic snapshot? | No. Pin analytics stores during local use, record loaded time and preference revision, and keep the assembled view fixed until reload. No claim of transactional live reporting. | Prototype limitation for user acceptance |

Technical feasibility: current profile, history, similar and club-fit endpoints expose the required calculations; the existing Chart.js radar and browser test stack can be reused. No new dependency is planned. A focused print-layout probe is required during implementation, before building out the full report. Exact implementation duration is not estimated from endpoint availability alone.

Operational boundary: keep the existing loopback-only API/UI and one API worker. No new writes or credentials. Report failure cannot mutate analytics or preferences. Rollback removes the additive report route/profile link; existing features continue to operate. Report sources retain current licensing restrictions; public/commercial redistribution is not authorized by this feature.

## Implementation And Review Gates

1. Add the smallest report route and base-profile render/print layout. Immediately test one eligible player and base-profile failure; verify A4 pagination before expanding sections.
2. Add existing comparison/preference data and deterministic summaries. Test each addition for exact API-value fidelity, null/zero handling, unsupported GK/history, club revisions and rapid context changes.
3. Add navigation, bilingual labels, loading/error/retry and print controls. Verify English/Spanish on desktop/mobile and inspect print output for long names, missing history, selected club and unavailable ranks.
4. Run focused browser/API checks, TypeScript, lint/build and existing regression gates. Verify unchanged analytics database hashes and that normal preferences were not written by tests.
5. Demonstrate question-to-search-to-profile-to-report, then browser Save as PDF. Validate one-page PDFs using the existing local PDF parser and inspect rendered output; do not equate a passing screenshot with valid pagination.
6. Update delivered evidence and present Stage 6 for user acceptance. Implementation approval does not authorize commit, push, deployment, new data or a further stage.

The focused implementation gate was approved. Final acceptance remains with the user; no further stage or Git operation is authorized.

## Delivery Evidence

Last verified: 2026-10-01.

- Route: `/players/{playerId}/report`; profile link preserves language and search. Demo: http://127.0.0.1:3002/players/3009/report.
- All six metrics, history rates/deltas, three similarity distances and saved club contributions match the existing APIs at displayed precision. Reload, language, club selection/clearing and canceled requests are covered. No report writes.
- Fourteen report cases pass across desktop and mobile, including real goalkeeper 6909 and low-minute player 21026, missing ranks, zero values, ties, a long-name fixture, missing history, service errors, unsupported scopes and invalid IDs.
- Chromium exports verified by pypdf: one A4 page, required evidence/source text retained, English/Spanish with and without saved club preferences. Desktop/mobile screenshots and a rasterized full Spanish PDF were inspected. Print canvas bounds are checked against the explanatory note; no clipping is used.
- Full regression: 135 Python tests and 34 browser cases pass; TypeScript, ESLint and production build pass. The existing Starlette/httpx deprecation warning remains non-failing.
- All three analytics database SHA-256 hashes match the pre-implementation baseline. Normal `data/club-profiles.json` remains absent. Preference mutation tests used a temporary file behind port 8003; that test API was stopped.
- PDF/screenshot artifacts are local ignored outputs under `web/test-results/`. No commit, push, deployment or data import was performed.

Print using Chromium's Print / Save as PDF, A4 portrait, 100% scale, 10mm margins and browser headers/footers off. Other browser engines and physical printers have not been certified. This is not an archived or atomic live-data report; check the displayed loaded time and saved preference revision. Shared/public analysis still requires source-license review and required StatsBomb logo attribution, as described in README; the local report does not grant redistribution rights.