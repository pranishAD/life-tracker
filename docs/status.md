# Status Board

Updated by the orchestrator after every phase or major task.

Last updated: 2026-10-15

## Current phase: 3. Core backend (done, awaiting Aayush approval)

Phase 0 and Phase 2 approved by Aayush on 2026-10-15. App name is Bihan. Deploy target is Vercel Hobby (x2) + Neon free Postgres — see docs/decisions.md.

| Agent | Status | Current task |
|---|---|---|
| orchestrator | Done | Merged phase-2/foundation to main, branched phase-3/core-backend, added GET /internal/daily-snapshot to api-contract.yaml, ran + reviewed Phase 3 |
| product-planner | Done (Phase 0) | docs/prd.md + docs/user-stories.md (US-01..US-19, EC-01..EC-10) |
| devops | Done (Phase 2) | Docker verified; Vercel/Neon deploy scaffolding |
| scoring-engine | Done (Phase 0) | backend/scoring/* + 71 passing tests + README with worked example |
| db-architect | Done (Phase 2) | SQLAlchemy models, Alembic migration, seed script, NullPool/Neon-ready session.py |
| backend-dev | Done | Goals, milestones, check-ins, scoring, dashboard, weekly review, category weights, GET /internal/daily-snapshot — all 16 remaining api-contract.yaml paths, 81 new tests, 170/170 total passing |
| frontend-dev | Waiting (unblock pending) | **6 screen PNGs + HTML reference + updated components.md landed in design/ (2026-10-15) — not yet committed, waiting on Aayush to confirm before Phase 4 kicks off** |
| qa-tester | Waiting | After Phase 4 (frontend) for e2e; test-plan.md can start anytime against user-stories.md |
| Designer (separate chat) | Done | Tokens, components, and all 6 screens (desktop + mobile) delivered |

## Phase 0 deliverables (all done)
- docs/prd.md, docs/user-stories.md — product-planner
- docs/api-contract.yaml (OpenAPI 3.1, 15 paths, 24 schemas) — orchestrator
- Repo skeleton, docker-compose.yml, CI, README, .env.example — devops
- backend/scoring/ + backend/tests/scoring/ (71 tests passing) — scoring-engine

## Phase 2 deliverables (all done, on branch phase-2/foundation)
- SQLAlchemy models, Alembic migration, seed script, Neon-ready (NullPool) session.py — db-architect
- Docker re-verified end-to-end; Vercel + Neon deploy scaffolding (vercel.json x2, README Deployment section, .env.example) — devops
- FastAPI app (CORS, error-shape handlers), auth endpoints (register/login/me/PATCH me) + 18 tests — backend-dev
- 89/89 backend tests passing (71 scoring + 18 auth); every endpoint also manually curl-verified by the orchestrator against the live Docker stack

## Phase 3 deliverables (all done, on branch phase-3/core-backend)
- Goals, milestones, check-ins (full CRUD, ownership-scoped 404s) — backend-dev
- Scoring wired up: live /score, /score-history, dashboard rollup, weekly review, category-weight settings — backend-dev
- GET /internal/daily-snapshot, CRON_SECRET-protected, no background process — backend-dev
- 170/170 backend tests passing (71 scoring + 18 auth + 81 new); full manual curl walkthrough of the create-goal -> check-in -> score -> dashboard -> weekly-review -> settings loop, verified by the orchestrator

## Known gaps / verification notes
- `docker compose up --build` confirmed working by Aayush and re-verified in-sandbox (2026-10-15).
- Vercel deploy config (backend/vercel.json, frontend/vercel.json) is based on current Vercel docs but **not yet verified against a real Vercel/Neon deploy** — that happens in Phase 6. Not a blocker so far.
- **Open: Calibrating goals and dashboard rollups** — see docs/decisions.md 2026-10-15. A goal under 3 days old shows "Calibrating" on its own page but still feeds its raw score into the dashboard total. Needs an Aayush call before Phase 4 builds the dashboard screen against it.
- **Design unblocked, pending confirmation**: all 6 screens (desktop + mobile PNGs, HTML reference) landed in design/ — not yet committed, waiting on Aayush to confirm before committing and starting Phase 4.

## Open questions for Aayush
1. ~~Final app name?~~ Bihan (decided 2026-10-15)
2. Should Calibrating goals be excluded from dashboard category/overall rollups (like archived goals), or count as-is? (docs/decisions.md 2026-10-15)
3. Confirm the 6 screens in design/ are the real, approved output before I commit them and start Phase 4.
