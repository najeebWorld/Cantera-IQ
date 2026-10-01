# Stage 4 Data-Source Research

Last verified: 2026-10-01. Research complete; the user subsequently approved WC2018/WC2022 snapshots. Implemented and verified in [the comparison contract](COMPARISON.md). Research tables below retain their original audit scope.

## Recommendation

The approved no-provider-fee prototype uses StatsBomb World Cup 2018 and the existing World Cup 2022 dataset. Both have 64 matches and 32 teams. This enables historical tournament snapshots, not continuous season-by-season development, causal improvement, or future-success prediction. Both complete imports and identity checks have now passed.

For actual multi-season academy/player development analysis, obtain a licensed event-data sample for the agreed competition and consecutive seasons. Prefer the existing StatsBomb event semantics if its offered coverage meets the requirement; evaluate Wyscout as an alternative only with explicit metric mapping. Exact historical coverage, fees, DOB availability and redistribution rights remain unverified until a provider supplies them. No purchase, registration or vendor contact was made.

## Audit Method

Source: [StatsBomb competition manifest](https://raw.githubusercontent.com/statsbomb/open-data/4b73468fc5b0f1950f9f66fada70ad3a4f9327cb/data/competitions.json), pinned to the application's existing revision `4b73468fc5b0f1950f9f66fada70ad3a4f9327cb`.

Manifest SHA256: `e6cd42f5d8956d6aa30fb917ce8d4c3b3df1879a93f02f8feba820930a6971fa`.

Fetched competition-season match arrays, counted entries and unique teams, and counted each team's home plus away fixtures. All La Liga seasons in the manifest were inspected. The other inspected seasons are listed below; this is not a claim to have audited every football data source. Manifest completeness is not proof that every event file can be imported correctly.

## Observed Coverage

Each reference is a competition/season ID path below the pinned [matches directory](https://github.com/statsbomb/open-data/tree/4b73468fc5b0f1950f9f66fada70ad3a4f9327cb/data/matches).

| Competition | Season | Reference | Listed matches | Teams | Matches per team | Assessment |
|---|---|---|---:|---:|---|---|
| World Cup | 2018 | 43/3 | 64 | 32 | 3-7 | Candidate historical snapshot |
| World Cup | 2022 | 43/106 | 64 | 32 | 3-7 | Already ingested |
| UEFA Euro | 2020 | 55/43 | 51 | 24 | 3-7 | Actually played in 2021; optional later snapshot |
| UEFA Euro | 2024 | 55/282 | 51 | 24 | 3-7 | Optional later snapshot |
| La Liga | 2015/2016 | 11/27 | 380 | 20 | 38 | Full fixture-count candidate, only one full league season found |
| La Liga | 2018/2019 | 11/4 | 34 | 20 | 1-34 | All listed games involve Barcelona |
| La Liga | 2019/2020 | 11/42 | 33 | 20 | 1-33 | All listed games involve Barcelona |
| La Liga | 2020/2021 | 11/90 | 35 | 19 | 1-35 | All listed games involve Barcelona |
| Ligue 1 | 2015/2016 | 7/27 | 377 | 20 | 37-38 | Incomplete against 380-fixture double-round-robin expectation |
| Ligue 1 | 2021/2022 | 7/108 | 26 | 18 | 1-26 | All listed games involve PSG |
| Ligue 1 | 2022/2023 | 7/235 | 32 | 20 | 1-32 | All listed games involve PSG |
| Bundesliga | 2015/2016 | 9/27 | 34 | 18 | 2-34 | All listed games involve Bayer Leverkusen |
| Bundesliga | 2023/2024 | 9/281 | 34 | 18 | 2-34 | All listed games involve Bayer Leverkusen |
| Premier League | 2015/2016 | 2/27 | 380 | 20 | 38 | One historical league season, not a continuous series |
| Serie A | 2015/2016 | 12/27 | 380 | 20 | 38 | One historical league season, not a continuous series |
| Women's Super League | 2018/2019 | 37/4 | 107 | 11 | 19-20 | Broad but uneven coverage; separate population |
| Women's Super League | 2019/2020 | 37/42 | 87 | 12 | 13-16 | Uneven schedule; completeness requires external schedule reconciliation |
| Women's Super League | 2020/2021 | 37/90 | 131 | 12 | 21-22 | Broad but uneven coverage |
| Women's Super League | 2023/2024 | 37/281 | 132 | 12 | 22 | Full fixture-count candidate, not adjacent to the previous listed season |

The remaining La Liga seasons contain only Barcelona fixtures: 2017/18: 36; 2016/17: 34; 2014/15: 38; 2013/14: 31; 2012/13: 32; 2011/12: 37; 2010/11: 33; 2009/10: 35; 2008/09: 31; 2007/08: 27; 2006/07: 26; 2005/06: 17; 2004/05: 7; 1973/74: 1. Opponents' observed games against one selected club cannot stand in for their season-wide profiles. Even 38 Barcelona games do not constitute full league coverage.

Women's datasets are a separate potential product scope, not a substitute to silently merge into the existing men's cohorts. There is no recommendation to change the target population without approval.

## Identity And Dates

Fetched all 166 lineup files for World Cup 2018, Euro 2020 and Euro 2024. Compared unique roster IDs with the 680 active players returned by the current World Cup 2022 API (`max_age=60`, `min_minutes=0`, `limit=1000`). These are roster overlaps, not counts of players who meet a historical minute threshold.

| Period | Observed dates | Unique roster IDs | Overlap with active WC2022 IDs | Matching normalized full names |
|---|---|---:|---:|---:|
| WC2018 | 2018-06-14 to 2018-07-15 | 736 | 208 | 208 |
| Euro2020 | 2021-06-11 to 2021-07-11 | 612 | 175 | 174 |
| Euro2024 | 2024-06-14 to 2024-07-14 | 621 | 168 | 168 |

Normalization was Unicode NFKD, removal of combining marks, lowercase, and collapsed spaces. Euro2020 has ID 4354 named `Philip Foden`, versus `Phil Foden` in the current dataset. This is an alias review case, not permission for fuzzy-name merges. Consistent IDs and names are linkage evidence, not a substitute for identity conflict checks.

Kylian Mbappe has source ID 3009 in all three inspected historical roster sets and the current database; the names match. His retained FIFA2022 DOB is 1998-12-20. No DOB-named fields were present in any of the inspected historical lineup records.

Reuse a verified DOB only through an explicit stable player identity mapping, retaining the original source URL/hash, identity evidence and assertions. Never run the FIFA2022 team-plus-shirt adapter against a different tournament: shirt numbers and squads change. Do not assign the same birth date to a fuzzy name match. Missing/conflicting identity or DOB remains unavailable.

Historical cohorts must cover the historical population, not only players who survived into the 2022 squad. Import all historical rosters/events; show coverage for unresolved DOBs. Do not publish historical age-cohort percentiles based only on the linked overlap. Resolve the intended cohort's DOB coverage or explicitly withhold those ranks. Paired raw totals and per90 may still be shown when both periods pass their own data/minute checks.

## Event Compatibility Probe

Inspected the first and last match event files of each candidate tournament (eight files total):

| Period | Sample match IDs | Metadata data_version |
|---|---|---|
| WC2018 | 7525, 8658 | 1.0.2 |
| WC2022 | 3857286, 3869685 | 1.1.0 |
| Euro2020 | 3788741, 3795506 | 1.1.0 |
| Euro2024 | 3930158, 3943043 | 1.1.0 |

All eight had unique event IDs within each file, Starting XI events and numeric xG on all non-penalty shots in periods 1-4. WC2022 and Euro2020 finals also had shootout period 5, which must remain excluded. This is a schema feasibility probe, not a full kloppy/minutes/import validation. Data-version equivalence and xG-model comparability are not established by these checks. Store source versions and suppress unsupported cross-period improvement claims; do not equate a change in supplied xG with a change in player ability.

## Architecture Decision

build_database rejects multiple competition-seasons and changing team/shirt identities; settings has one reference date; player_summary and metric_totals group by player only; ranks partition by position/age/metric without period. Appending another season would mix observations and corrupt comparisons. The implemented bounded solution keeps two isolated single-period databases and joins verified identities in the read-only historical service. This avoids changing the working 2022 schema. Raw manifest metadata and hashes remain in each database's source cache, and matches retain their pinned source revision.

The following original proposal remains future work for a generalized multi-season architecture, not a claim about the delivered two-snapshot implementation:

1. Add an explicit dataset/period identity with provider, competition/season IDs, gender/youth category, start/end/reference dates, coverage and source/methodology versions.
2. Separate stable player identity and DOB assertions from period/match roster membership, team and shirt number. Retain provider IDs and resolve aliases explicitly. Support multiple teams within a season without replacing identity.
3. Attach matches to periods and namespace provider identifiers. Derive minute totals, primary roles and six metric totals per player-period. Preserve raw event provenance and shootout/temporary-absence rules.
4. Partition age, eligibility and percentile calculations by period and comparison population. Use actual reference dates, not a nominal year label (Euro2020 was played in 2021). Similarity compares within one fixed population; historical views pair the same player across periods.
5. Preserve existing API defaults at WC2022. Add an explicit period selector/parameter and separate historical response with paired coverage and unavailable reasons. Do not silently pool competitions, ages or genders. Percentile changes across different cohorts are not direct improvement measures.
6. Build a separate staging database from pinned sources. Keep the existing database untouched until migration checks pass; retain the existing snapshot for rollback. No external hosting/authentication changes are needed for the local prototype.

## Source And Rights Options

- [StatsBomb Open Data terms](https://github.com/statsbomb/open-data/blob/4b73468fc5b0f1950f9f66fada70ad3a4f9327cb/README.md): research-oriented open access; shared analysis must credit StatsBomb and use its logo. Commercial redistribution permission must be reviewed separately. Free download is not a general commercial license.
- [Hudl Statsbomb](https://www.hudl.com/products/statsbomb): official page offers APIs/files, event data and academy collection. Require written confirmation of the desired consecutive seasons, event definitions/model versions, player identifiers, DOB provenance, match completeness and product-use rights. Pricing and a suitable sample were not obtained.
- [Hudl Wyscout Data](https://www.hudl.com/products/wyscout/data-api): official page distinguishes database, stats and events packs. A UI subscription must not be assumed to include event API access. A different event provider needs a new adapter and definition-equivalence tests; do not mix its xG or event counts with StatsBomb as though identical. Pricing and a suitable longitudinal sample were not obtained.

No tracking/physical/medical/market-value/transfer data is required or authorized, even where vendor bundles offer it. Public Wyscout/Figshare collection and Nature article pages did not yield usable content in the web fetches, so they are not treated as verified multi-season alternatives.

## Gate And Acceptance Criteria

| Risk | Required response | Current verdict |
|---|---|---|
| Selected-club samples masquerade as full league history | Display fixture coverage; exclude from general league-wide development claims | Both complete World Cups imported |
| Tournament snapshots masquerade as continuous development | Explicitly narrow the historical view to observed periods; no prediction or causal claim | User-approved scope; bilingual caveats |
| Historical age percentiles use only surviving 2022 players | Complete relevant DOB coverage or withhold ranks; retain all historical players | All 736 historical identities retained; historical ranks null |
| Cross-period IDs, names, teams and shirt numbers collide | Stable identity mapping, assertion provenance and conflict rejection | ID/name checks tested; period roster data isolated |
| Event/model version differences change metric meaning | Import/reconcile all selected events; compare definitions and retain version caveats | Six metrics reconciled across 128 matches; model equivalence remains unverified |

Before accepting a migration: verify exact selected match sets and unique IDs; reconcile all six metric contributions and playing intervals; verify identities, DOBs and per-period age/position rules; count paired players meeting minute thresholds; test cohort isolation, alias conflicts, transfers, no-history cases and null/zero distinctions; prove the existing WC2022 results remain unchanged; run bilingual desktop/mobile regression and inspect historical labels/coverage. No projected developmental paths may be generated from absent data.

Decision recorded: WC2018/WC2022 historical-snapshot prototype approved after research. It is implemented with 96 players meeting >=180 minutes in each period, unchanged 2022 database hash, 124 passing Python tests and 14 passing desktop/mobile browser cases. The generalized migration/transfer tests above do not apply to the isolated tournament design; continuous club/academy seasons require a future source and architecture decision. Stage 4 awaits user review. Stages 5-6 are not authorized.