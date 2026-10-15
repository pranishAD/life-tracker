# Status Board

Updated by the orchestrator after every phase or major task.

Last updated: 2026-10-15

## Current phase: 4. Frontend (done, awaiting Aayush approval)

Phase 0 and Phase 2 approved by Aayush on 2026-10-15. App name is Bihan. Deploy target is Vercel Hobby (x2) + Neon free Postgres — see docs/decisions.md.

| Agent | Status | Current task |
|---|---|---|
| orchestrator | Done | Merged phase-2/foundation to main, branched phase-3/core-backend, added GET /internal/daily-snapshot to api-contract.yaml, ran + reviewed Phase 3 |
| product-planner | Done (Phase 0) | docs/prd.md + docs/user-stories.md (US-01..US-19, EC-01..EC-10) |
| devops | Done (Phase 2) | Docker verified; Vercel/Neon deploy scaffolding |
| scoring-engine | Done (Phase 0) | backend/scoring/* + 71 passing tests + README with worked example |
| db-architect | Done (Phase 2) | SQLAlchemy models, Alembic migration, seed script, NullPool/Neon-ready session.py |
| backend-dev | Done | All 16 api-contract.yaml paths + daily-snapshot cron, Calibrating-goal rollup fix, and a data-safety fix to the test suite (see docs/decisions.md). 179/179 tests passing |
| frontend-dev | Done | All 6 screens + empty/Calibrating states + Settings, wired to the live backend. 44 tests passing, clean build |
| qa-tester | Waiting | Phase 5 — test-plan.md + Playwright e2e against user-stories.md |
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

## Phase 4 deliverables (all done, on branch phase-4/frontend)
- All 6 designed screens + empty/Calibrating states + a Settings page, matching design/ closely — frontend-dev
- Typed API client, TanStack Query, auth via localStorage + auto-logout on 401, responsive mobile/desktop — frontend-dev
- 44 frontend unit/component tests passing, clean `npm run build` — frontend-dev
- Verified independently via a real Playwright session against the live Docker stack (not npm run dev in isolation): login, dashboard, goals list, goal detail, a real check-in submit with live score recalculation, weekly review, settings, mobile layout — orchestrator

## Known gaps / verification notes
- `docker compose up --build` confirmed working by Aayush and re-verified in-sandbox (2026-10-15).
- Vercel deploy config (backend/vercel.json, frontend/vercel.json) is based on current Vercel docs but **not yet verified against a real Vercel/Neon deploy** — that happens in Phase 6. Not a blocker so far.
- Calibrating goals excluded from dashboard rollups, resolved 2026-10-15 — see docs/decisions.md.
- A real data-safety bug (test suite could silently wipe the dev DB) was found and fixed 2026-10-15 — see docs/decisions.md. Always run backend tests with `TEST_DATABASE_URL` explicitly set (backend/tests/conftest.py now enforces this).
- Frontend gaps (none blocking the Phase 4 gate, all documented in frontend-dev's handoff): no live check-in score-preview (no backend field to predict it); weekly review's past-week category/daily breakdown isn't available from the API; dashboard hero card approximates active-goal-count via a second query since `/dashboard` doesn't return it; one 674KB JS bundle (code-splitting is a Phase 6 concern).
- `docs/api-contract.yaml`'s `/goals/{id}/score-history` only allows `days=7|30`, but the design mock shows a 14D option — frontend-dev used 7D/30D to match the actual contract. Would need a contract change if 14D is wanted later.

## Open questions for Aayush
1. ~~Final app name?~~ Bihan (decided 2026-10-15)
