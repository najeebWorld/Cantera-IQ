# Stage 2: Player Search

Last verified: 2026-10-01. Parser: local_grammar_v1. Analytics remain stage1-v1.

## Scope And Decision

The user approved Stage 2 after the Stage 1 demonstration, then approved progression to Stage 3. Added one search API and one bilingual Next.js search screen. No database schema change or external AI service is needed. Stage 4 now adds approved WC2018/WC2022 comparisons to player profiles; search remains scoped to 2022. Stages 5-6 remain gated.

Lark parses the entire normalized request into a validated SearchPlan. The executor accepts only bounded typed fields and allowlisted identifiers; values are bound SQL parameters. It reads the existing player_metrics view, so displayed results and cohort ranks use exactly the Stage 1 methodology. The interpreter can later be replaced without changing SQL execution. This implementation is a constrained-language prototype, not an LLM, semantic talent model or general-purpose conversational search.

## Requests

POST /api/search accepts query (1-500 characters) and lang (en or es). Extra keys are rejected. lang selects response language, not input grammar: both English and Spanish are accepted. Accents/case/whitespace are normalized. Hebrew input is not supported.

Examples:

```text
Find wingers aged 23 or younger with at least 180 minutes sorted by successful dribbles per 90
Show me top 5 players aged 20 to 23 from France with percentile at least 75 for key passes
Find strikers with at least 0.3 npxg per 90
Find players under 23 sorted by percentile for key passes
Busca extremos hasta 23 anos con al menos 180 minutos ordenados por regates por 90
Busca jugadores de Francia menores de 24 ordenados por npxg
```

Supported dimensions:

| Dimension | Semantics |
|---|---|
| Subject | players/jugadores, or one specific position: GK, CB, FB, DM, CM, AM, W, ST via documented grammar words |
| Age | under 23 is strictly <23; aged 23 or younger is <=23; aged 20 to 23 includes both boundaries; valid supported ages 14-60 |
| National team | from France / de Francia; aliases resolve to names present in the database; quoted names permit future datasets |
| Minutes | at least 180 minutes; defaults to database settings.min_minutes; active players only; zero-minute rows never returned |
| Metric | non-penalty shots, npxg, key passes, completed passes, successful dribbles or tackles won |
| Minimum rate | at least 0.3 npxg per 90; explicit per90 unit required |
| Minimum percentile | percentile at least 75 for key passes; requires a qualified, non-null percentile |
| Sorting | minutes (default), one metric per90, or one metric's percentile; descending only; minute ties then player_id give stable order |
| Limit | top 5 players or 5 players; defaults to 10, maximum 50; total_matches is reported separately |

Full accepted vocabulary lives in cantera/search.lark. Unknown phrases, negation, OR, multiple metrics, vague positions such as "midfielders", conflicting constraints and unmeasured qualities fail closed. Names of individual players, club filters, date filters, ascending order and pagination are not implemented. No automatic constraint relaxation. Adjust the explicit top-N limit to display more matches, up to 50.

## Response And Evidence

An ok response includes interpretation, effective_min_minutes, whether the minute default was applied, ordering, total_matches, returned, dataset and players. All result values and evidence thresholds are queried from DuckDB. User-specified numeric constraints are echoed as inputs, never presented as observed statistics.

Percentiles are calculated before search filters or limits, using all eligible players in the same primary position, age band and competition-season. Filtering to a national team does not change the cohort. Sorting by per90 can include players without a percentile, with explicit evidence status. Sorting/filtering by percentile excludes missing percentiles rather than treating them as zero. Without a selected metric, total/per90/percentile are null; evidence describes sample eligibility.

Explanations show the observed role, historical age/date, national team, minutes, selected metric calculation and evidence rule. The displayed arithmetic is rounded for readability; raw numeric fields retain database precision. Cohort labels and peer counts are available in expanded table rows. Higher metric volume is not automatically better and this order is not a talent ranking, club-fit score or future-success probability.

Clarification responses contain no players, a reason, localized message and examples. Parsing failures happen before executing player selection SQL. The API still checks database availability when opening its read-only connection. Invalid body types/language/length produce 422; a missing database produces 503. The UI replaces previous results on submission and distinguishes loading, clarification, no results and request failure. Switching interface language resets to that language's default example.

Stage 3 adds player-name links to `/players/{player_id}`. The submitted query and interface language travel in the URL; the profile's return link restores them and reruns the search. Switching language on a profile preserves the query because response language is independent of the input grammar. Profile behavior and API are documented in [README](../README.md#player-profiles).

## Verification And Review

Stage 2 initially passed 92 Python tests plus four desktop/mobile Playwright cases. The Stage 3 regression now passes 107 Python tests and ten browser cases; Next.js lint and production build pass. Browser tests require the ingested World Cup dataset and both local servers. Existing tests still reconcile raw event totals, minutes and provenance. Real default search returns 19 qualifying wingers aged <=23, showing the first 10 by successful dribbles/90.

| Challenge | Response | Verdict |
|---|---|---|
| Can unsupported language silently change the question? | Full-input grammar; conflicting or unsupported clauses require clarification; invalid quoted strings are tested. | Addressed within grammar scope |
| Can a filter inflate percentiles by shrinking the cohort? | Selection runs over the existing fully computed view; cohort-preservation tests use known ties and low-minute rows. | Addressed |
| Could high rates with little evidence look like certainty? | Evidence labels, cohort size, historical age and explicit missing-percentile reasons are displayed; no probability or talent score. | Addressed |
| Is this general natural-language understanding? | No. Vocabulary and syntax are bounded. Broader language or an LLM intent adapter needs a separate decision; present limitation for user review. | Known limitation |
| Is the system production-ready? | Localhost only; no authentication, public hosting, source-licensing sign-off or load target. Revert code to remove search without modifying ingested data. | Outside approved prototype scope |

Stage 2 accepted through the user's explicit approval to implement Stage 3. The constrained-language limitation remains. Stage 3 accepted through approval to start Stage 4. After research, the user approved the historical-snapshot scope; see [comparison implementation](COMPARISON.md). There is no historical search mode or pooled ranking.