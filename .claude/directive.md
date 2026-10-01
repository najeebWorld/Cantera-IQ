# Session Handoff

Last session: 2026-10-01

Status: Stage 3 implemented after approval; awaiting user review before Stage 4.

## Next Session

Read README.md (including Player Profiles), docs/SEARCH.md and docs/DATA-REFERENCE.md. Progress source of truth: .claude/project-tracker.md. Preserve the explicit stage approval gate. The sample is historical World Cup 2022 data with opening-day ages and national teams, not current academy scouting data. Stage 4 needs explicit approval and a decision about missing longitudinal coverage; do not infer development trajectories from this single tournament.

The local API runs on 8001 and Next.js UI on 3002; commands are in README.md. The API has no reload flag and needs restarting after edits. The local Lark grammar is deliberately constrained, not an LLM. Preserve full-input rejection and the typed SearchPlan boundary when extending language support. Player profiles reuse existing cohorts; Chart.js plots only complete, non-null percentile sets. Source snapshots are in data/cache and generated exports are in reports. Browser tests use the actual ingested dataset and save screenshots under web/test-results. No Git commit, push or external project registration was performed.