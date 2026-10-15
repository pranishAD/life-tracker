# Status Board

Updated by the orchestrator after every phase or major task.

Last updated: 2026-10-15

## Current phase: 3. Core backend (in progress)

Phase 0 and Phase 2 approved by Aayush on 2026-10-15. App name is Bihan. Deploy target is Vercel Hobby (x2) + Neon free Postgres — see docs/decisions.md.

| Agent | Status | Current task |
|---|---|---|
| orchestrator | In progress | Merged phase-2/foundation to main, branched phase-3/core-backend, added GET /internal/daily-snapshot to api-contract.yaml, running Phase 3 |
| product-planner | Done (Phase 0) | docs/prd.md + docs/user-stories.md (US-01..US-19, EC-01..EC-10) |
| devops | Done (Phase 2) | Docker verified; Vercel/Neon deploy scaffolding |
| scoring-engine | Done (Phase 0) | backend/scoring/* + 71 passing tests + README with worked example |
| db-architect | Done (Phase 2) | SQLAlchemy models, Alembic migration, seed script, NullPool/Neon-ready session.py |
| backend-dev | In progress | Goals, milestones, check-ins, scoring, dashboard, weekly review, category weights, GET /internal/daily-snapshot — all wired to backend/scoring/ |
| frontend-dev | Waiting | design/tokens.json + components.md landed (2026-10-15) — still blocked on the 6 screen layouts before Phase 4 can start |
| qa-tester | Waiting | After Phase 4 (frontend) for e2e; test-plan.md can start anytime against user-stories.md |
| Designer (separate chat) | In progress | Design system (tokens/components) done; 6 screen layouts (Login, Dashboard, Goals list, Goal detail, Check-in modal, Weekly review) not designed yet |

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

## Known gaps / verification notes
- `docker compose up --build` confirmed working by Aayush and re-verified in-sandbox (2026-10-15).
- Vercel deploy config (backend/vercel.json, frontend/vercel.json) is based on current Vercel docs but **not yet verified against a real Vercel/Neon deploy** — that happens in Phase 6. Not a Phase 2 blocker.
- frontend-dev is unblocked on tokens/components but still blocked on the 6 screen layouts (design/components.md § Screens: "Not designed yet") — blocks Phase 4, not Phase 2.
- Daily-snapshot endpoint (Phase 3) must be `GET /api/v1/internal/daily-snapshot`, not POST — Vercel Cron only sends GET (docs/decisions.md 2026-10-15).

## Open questions for Aayush
1. ~~Final app name?~~ Bihan (decided 2026-10-15)
2. 6 screen layouts from the design chat — when ready, drop into design/ to unblock Phase 4.
