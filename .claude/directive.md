# Session Handoff

Last session: 2026-10-01

Status: Approved Stage 4 WC2018/WC2022 snapshot comparison implemented and verified; awaiting user review before Stage 5.

## Next Session

Read docs/COMPARISON.md first for the implemented two-database design and limitations, then README.md and docs/DATA-REFERENCE.md. Progress source of truth: .claude/project-tracker.md. The user approved WC2018/WC2022 after the research-first step; do not reopen that decision. The original generalized multi-season migration proposal in docs/DATA-SOURCES.md remains future work. No continuous trajectories can be inferred from tournament snapshots. No Stage 5-6 work is authorized yet.

The historical file is data/cantera-2018.duckdb; rebuild with python -m cantera ingest-history. Never append it to data/cantera.duckdb or apply FIFA2022 team/shirt matching to 2018. Historical dates are enriched for display only after matching IDs/names; historical ranks remain null to avoid survivorship bias. Default search/profile remains 2022. Demo: http://127.0.0.1:3002/players/3009.

The local API runs on 8001 and Next.js UI on 3002; commands are in README.md. The API has no reload flag and needs restarting after edits. The local Lark grammar is deliberately constrained, not an LLM. Preserve full-input rejection and the typed SearchPlan boundary when extending language support. Player profiles reuse existing cohorts; Chart.js plots only complete, non-null percentile sets. Source snapshots are in data/cache and generated exports are in reports. Browser tests use the actual ingested dataset and save screenshots under web/test-results. No Git commit, push or external project registration was performed.