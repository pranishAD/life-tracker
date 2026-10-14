# Decisions Log

Format: date — decision — why — who approved.

- 2026-10-14 — Web app first (responsive + PWA); native mobile out of scope for v1 — faster, matches React learning — Aayush
- 2026-10-14 — Stack locked: React + Vite + TS + Tailwind / FastAPI / PostgreSQL — matches Aayush's Python + SQL strengths — Aayush
- 2026-10-14 — Code agents run as Claude Code subagents under one orchestrator; Designer runs in a separate claude.ai chat — agents share the repo instead of copy-paste — Aayush
- 2026-10-14 — docs/api-contract.yaml (OpenAPI 3.1) written by orchestrator from master-plan section 6 + user-stories.md — 15 paths, 24 schemas, Bearer JWT auth, {error:{code,message}} error shape — pending Aayush review
- 2026-10-14 — Scoring engine resolves 7 ambiguities in master-plan section 4 (per-type pace progress, non-habit consistency defaults to 1/week, momentum uses check-in/milestone count not value deltas, streak definition, frozen-score mechanics, archived goals excluded not zeroed, date vs datetime) — documented in backend/scoring/README.md — pending Aayush thumbs-up, does not change formula weights or schema
