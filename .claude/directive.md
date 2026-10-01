# Session Handoff

Last session: 2026-10-01

Status: Stage 5 implementation and verification complete; awaiting user review. Stage 6 is not authorized.

The user approved the revised historical multi-club contract. See docs/CLUB-PROFILE.md for delivered behavior and verification evidence, and .claude/project-tracker.md for progress. Do not ask for implementation GO again or reopen paid-source research. Demo: http://127.0.0.1:3002/clubs. Historical club age/ranks/fit remain unavailable; saved preferences are demonstrated separately on eligible WC2022 profiles.

## Next Session

Review the delivered Stage 5 UI with the user; address concrete feedback within the accepted scope. Read docs/CLUB-PROFILE.md first. Keep Stage 4 similarity and historical comparisons unchanged; do not start Stage 6 without approval. Preference writes require the configured local frontend Origin, one API worker and a JSON file separate from all databases. Browser mutation tests must target an isolated API/preferences path; see README.md.

For current analytics, read docs/COMPARISON.md, README.md and docs/DATA-REFERENCE.md. WC2018/WC2022 scope is already approved; the generalized migration proposal in docs/DATA-SOURCES.md remains future work. No continuous trajectories can be inferred from tournament snapshots.

The historical file is data/cantera-2018.duckdb; rebuild with python -m cantera ingest-history. Never append it to data/cantera.duckdb or apply FIFA2022 team/shirt matching to 2018. Historical dates are enriched for display only after matching IDs/names; historical ranks remain null to avoid survivorship bias. Default search/profile remains 2022. Demo: http://127.0.0.1:3002/players/3009.

The local API runs on 8001 and Next.js UI on 3002; commands are in README.md. The API has no reload flag and needs restarting after edits. The local Lark grammar is constrained, not an LLM. Player profiles reuse existing cohorts; Chart.js plots only complete, non-null percentile sets. Source snapshots are in data/cache; browser screenshots are in web/test-results. Current observed branch is main, with uncommitted Stage 5 work. No branch switch, commit or push was performed by this implementation; preserve user Git changes. ripgrep is unavailable on this machine, so use editor search tools.