# Cantera IQ: Handoff To Claude

Last updated: 2026-10-01. Status: all six prototype stages implemented; Stage 6 implementation was explicitly approved and verified, but final user acceptance is pending. The user wants to continue development with Claude. Respond to the user in Hebrew; the application is English/Spanish.

## Start Here

1. Read this handoff, then [project tracker](project-tracker.md) for approval/progress state.
2. Read [README](../README.md) for setup and operational boundaries.
3. Follow the relevant feature contract below before changing code. Read `web/AGENTS.md` and the installed Next.js documentation before frontend work.
4. Ask what the user wants to revise or build next. Do not invent a Stage 7, reimplement delivered work or ask for Stage 6 implementation GO again. Acceptance, deployment and further scope are separate decisions.

## Product And Delivered Stages

Cantera IQ is a local, explainable football-analytics research prototype: source events -> provider normalization -> isolated DuckDB databases -> FastAPI -> bilingual Next.js interface. It demonstrates searchable observations, peer comparisons and configurable club preferences. It is not a validated talent predictor, academy dataset or current scouting service.

| Stage | Delivered behavior |
|---|---|
| 1 | Replaceable source-provider interfaces, reproducible import, DuckDB, player statistics, six per90 metrics, age/position cohorts, evidence labels and ten-player exports. |
| 2 | Constrained English/Spanish natural-language search, interpretation, clarification, results and calculation explanations. Implemented using local Lark grammar, not an LLM. |
| 3 | Bilingual player profiles, six-axis Chart.js radar when ranks are available, raw values, cohort context, metric definitions and source links. |
| 4 | Same-cohort similar players and identity-checked WC2018/WC2022 snapshots. No continuous development curve or historical percentiles. |
| 5 | La Liga 2015/16: 20 historical clubs, observed squads and club/player statistics; independent saved weights by club and seven outfield position groups. Preference index applies separately to eligible WC2022 players. |
| 6 | Explainable One-Page Player Report: six metrics, eligible radar, historical rate differences, up to three similar players, optional saved club preferences, deterministic observations, sources and limits. English/Spanish, responsive, browser print-to-PDF. |

Stages 1-5 have approval to progress. Stage 6 is delivered for review, not yet finally accepted. Detailed status belongs in the tracker, not in older historical gate statements.

## Data And Non-Negotiable Semantics

| Local file | Scope |
|---|---|
| `data/cantera.duckdb` | WC2022, default search/profile: 64 matches, 829 roster identities, 680 active players, 143 active aged <=23 at sample start. |
| `data/cantera-2018.duckdb` | WC2018: 64 matches, 736 roster identities, 604 active players. 96 players meet >=180 minutes in both World Cup samples. |
| `data/cantera-clubs-2015-16.duckdb` | La Liga 2015/16: 380 matches, 20 clubs, 601 roster players, 761 checksummed sources. |
| `data/club-profiles.json` | Separate saved user preferences, not observed analytics. Absent at last verification; equal defaults are not saved preferences. |
| `data/cache/` | Cached source JSON/PDF with provenance. Data and generated artifacts are ignored by Git. |

Source events: StatsBomb Open Data, pinned revision `4b73468fc5b0f1950f9f66fada70ad3a4f9327cb`. WC2022 DOB source: official FIFA squad PDF, matched by tournament/national team/shirt. Ages refer to 2022-11-20, not today. Club historical DOB/age/ranks/fit are unavailable. Never apply the FIFA2022 team/shirt matching rule to another season.

- Six metric keys: `shots` (non-penalty), `npxg`, `key_passes`, `completed_passes`, `successful_dribbles`, `tackles_won`.
- Per90 = total * 90 / total minutes. Zero minutes -> null; a genuine event count of zero remains zero. Never average match-level rates or replace missing evidence with zero.
- Minutes include stoppage time and extra time, exclude breaks/shootouts, and use non-overlapping event-derived intervals. Club-only bounded period-boundary exceptions are documented; World Cup defaults stay strict.
- Cohorts: same competition-season, primary position and age band (U20, 20-23, 24-29, 30+), known age, >=180 minutes, >=5 qualified peers including self. Midrank percentile = `100 * (L + (T - 1)/2) / (N - 1)`; ties handled explicitly. Evidence labels are heuristic sample labels, not confidence probabilities.
- Similarity = equal-weight mean absolute difference across six eligible percentiles. Lower distance means more similar observed volume, not better ability.
- Historical identity matching uses source ID and normalized name. Verified DOB may be reused for paired display only; original historical DOB and ranks stay null. Opponents/roles/samples differ and xG model equivalence is unverified.
- Club preference score = weighted average of eligible WC2022 percentiles using saved weights; zero weight excludes a metric. Missing weighted evidence withholds the score. No implied club membership, historical club performance, probability or recommendation.
- Do not pool the three databases or change metric/eligibility definitions without a reviewed scope decision. No new data, paid provider, account system or public hosting was approved.

## Implementation Map

- Backend: Python 3.10 virtualenv, FastAPI, DuckDB, httpx, kloppy, Lark, pypdf; pytest.
- `cantera/providers.py`: provider contracts and source normalization; `minutes.py`: playing-time interpretation.
- `cantera/schema.sql`, `store.py`: World Cup storage/views/profile reads; `__main__.py`: administrative CLI.
- `cantera/search.lark`, `search.py`: supported language grammar and search interpretation.
- `cantera/comparison.py`: similarity and historical snapshots.
- `cantera/club_schema.sql`, `clubs.py`: isolated multi-club import and reads.
- `cantera/preferences.py`: validated, revisioned, atomic JSON preference persistence and index calculation.
- `cantera/api.py`: API routes; analytics reads are read-only. Preference PUT is the only application mutation.
- `cantera/report.py`: earlier sample exports, not the new interactive Stage 6 page.
- Frontend: Next.js 16.3.8 App Router, React 19.2.8, TypeScript, Chart.js/react-chartjs-2, lucide-react, locally served Barlow fonts. Async route params/searchParams must be awaited.
- `web/app/`: search screen and global styles; `players/[playerId]/`: profile, radar, comparisons; `players/[playerId]/report/`: Stage 6 page/state/scoped print styles; `clubs/`: club views/preferences.
- `tests/`: backend and source reconciliation; `web/tests/`: Playwright desktop/mobile workflows; `web/test-results/`: ignored PDF/screenshot artifacts.

## Runtime And Commands

Workspace: `/home/najeeb/dev/Cantera IQ` (no trailing space). The last verified services were API8001 and UI3002, both loopback-only. Recheck availability before starting duplicates. The isolated test API8003 was stopped after tests.

Backend, from project root:

```bash
.venv/bin/python -m uvicorn cantera.api:app --host 127.0.0.1 --port 8001
```

Frontend, in a separate terminal:

```bash
cd '/home/najeeb/dev/Cantera IQ/web'
npm run dev -- --hostname 127.0.0.1 --port 3002
```

Running npm from the repository root fails because the frontend package is in `web`. API runs without reload and needs restarting after backend edits. Use one API worker. Next proxies `/api/*` to `CANTERA_API_URL`, default `http://127.0.0.1:8001`.

Relevant environment variables: `CANTERA_DB`, `CANTERA_HISTORY_DB`, `CANTERA_CLUB_DB`, `CANTERA_CLUB_PROFILES`, `CANTERA_FRONTEND_ORIGIN` (default `http://127.0.0.1:3002`). Preference saves require exact Origin, JSON, complete validated weights and the current club revision; conflicts return 409. Origin checks are not authentication.

Demo URLs:
- Search: http://127.0.0.1:3002
- Profile: http://127.0.0.1:3002/players/3009
- Clubs: http://127.0.0.1:3002/clubs
- Report: http://127.0.0.1:3002/players/3009/report
- API docs: http://127.0.0.1:8001/docs

## Verification And Print

Last completed code gates on 2026-10-01: **135 Python tests, 34 browser tests, TypeScript, ESLint and production build passed**. This includes independent six-metric reconciliation across all 508 matches. A known Starlette/httpx deprecation warning is non-failing. Tests were not rerun for this documentation-only handoff.

```bash
.venv/bin/python -m pytest tests -q
cd web
npx tsc --noEmit
npm run lint
npm run build
```

Browser mutation tests must NEVER write normal preferences. With regular API/UI and datasets available, start a separate test API from the root:

```bash
CANTERA_CLUB_PROFILES="$(mktemp -d)/profiles.json" .venv/bin/python -m uvicorn cantera.api:app --host 127.0.0.1 --port 8003
```

Then from `web`: `CANTERA_CLUB_TEST_API=http://127.0.0.1:8003 npm test`. Stop only the temporary API afterward. Without that variable, mutation cases intentionally skip.

Report: Print -> Save as PDF, Chromium, A4 portrait, 100%, 10mm margins, headers/footers off. Bilingual PDFs with and without saved club preferences were checked by pypdf for one page, A4 size and required evidence; screenshots and rasterized output were inspected. Other engines/printers are not certified. No server PDF service or archive.

Report requests use no-store, timeout/abort and keyed remounts by player/language/club/reload. Selected section transport errors block printing; valid unavailable evidence does not. Loaded data stays fixed until reload; separate requests are not a cross-database atomic transaction. Tests cover stale responses, nulls/zeros/ties, long names, real GK/low-minute profiles, errors and navigation.

All three analytics file hashes were unchanged after implementation/tests:

```text
cantera.duckdb: f8c1503cebb9020f46e40fd339923f27fa7c90a3fd2073dbf633150e25d3af0d
cantera-2018.duckdb: 7a72542989653734f134aeccd92100adbae2aa7fe960bfeb003bf7db591bd41b
cantera-clubs-2015-16.duckdb: 14ab15a8eeb5b783c862a46ecd5b666f0966ea5ff5fcb49edc8ecf78c5ccc3e4
```

## Git And Working Rules

At this handoff's status check, branch was `stage_6_player_report`, up to date with locally recorded `origin/stage_6_player_report`, and the working tree was clean BEFORE this handoff edit. No fetch was performed to verify remote freshness. This supersedes earlier `main`/uncommitted-work notes. The assistant did not create this branch or perform a commit/push; preserve user actions. This handoff edit remains local.

Do not stage, commit, push or switch branches without explicit instruction. For newly authorized feature branches, the user wants a freshly fetched `origin/main` base, not stale local main. Inspect status first. Never revert unrelated changes.

Earlier VS Code staging trouble included `.next` and `node_modules` in a stale explicit file list; those generated paths were already ignored and untracked. Do not force-add them or delete user files. ripgrep is unavailable on this machine; use available search tools.

## Authoritative Documents And Next Action

- [Tracker](project-tracker.md): roadmap and approval state.
- [Data reference](../docs/DATA-REFERENCE.md): schema, identity, minutes, metrics and cohorts.
- [Search contract](../docs/SEARCH.md): supported grammar and clarification behavior.
- [Comparison contract](../docs/COMPARISON.md): Stage 4 scope and evidence.
- [Club contract](../docs/CLUB-PROFILE.md): Stage 5 storage, preference rules and evidence.
- [Report contract](../docs/PLAYER-REPORT.md): Stage 6 behavior, print settings and evidence.
- [Data-source research](../docs/DATA-SOURCES.md): researched alternatives; generalized schema migration remains future work, not approved implementation.
- [README](../README.md): setup, commands, endpoints and source licensing.

Next action: collect Stage 6 acceptance/revision feedback or clarify the user's next goal before planning new work. No further feature is currently approved. This remains a local prototype: review source terms and required StatsBomb logo attribution before sharing/publication, and design authentication/security separately before public deployment.