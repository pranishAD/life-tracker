# Status Board

Updated by the orchestrator after every phase or major task.

Last updated: 2026-10-15

## Current phase: 6. Launch (deploy config approved and merged to main; Aayush doing the real Neon/Vercel setup himself next)

Aayush chose to jump from Phase 4 straight to Phase 6 (deploy config); Phase 5 (QA + polish) has not started yet and remains next after launch is live.

Phase 0, 2, 4, and 6 (deploy config) approved by Aayush. App name is Bihan. Deploy target changed mid-Phase-6 to **one Vercel project using Vercel Services** (not two separate Hobby projects) + Neon free Postgres — see docs/decisions.md and docs/deploy.md.

| Agent | Status | Current task |
|---|---|---|
| orchestrator | Done (this task) | Researched current Vercel Services schema, branched phase-6/deploy, ran + reviewed devops + frontend-dev's deploy work, merged to main |
| product-planner | Done (Phase 0) | docs/prd.md + docs/user-stories.md (US-01..US-19, EC-01..EC-10) |
| devops | Done (Phase 6) | Root vercel.json (Vercel Services: frontend + backend), removed old per-folder vercel.json files, docs/deploy.md, README Deployment section rewritten |
| scoring-engine | Done (Phase 0) | backend/scoring/* + 71 passing tests + README with worked example |
| db-architect | Done (Phase 2) | SQLAlchemy models, Alembic migration, seed script, NullPool/Neon-ready session.py (unchanged by the Phase 6 deploy-architecture switch) |
| backend-dev | Done | All 16 api-contract.yaml paths + daily-snapshot cron, Calibrating-goal rollup fix, and a data-safety fix to the test suite (see docs/decisions.md). 179/179 tests passing |
| frontend-dev | Done | Phase 4: all 6 screens + Settings, wired to the live backend. Phase 6: fixed API client to support a relative base URL for same-origin production deploys. 47/47 tests passing, clean build |
| qa-tester | Waiting | Phase 5 — test-plan.md + Playwright e2e against user-stories.md, once Phase 6 launch is live |
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

## Phase 6 deliverables so far (approved, merged to main)
- Root `vercel.json`: one Vercel project, Vercel Services (`frontend` + `backend`), schema verified against current Vercel docs — devops
- `backend/vercel.json` and `frontend/vercel.json` removed (replaced by the root file) — devops
- `docs/deploy.md`: full Neon + Vercel + env var + migration walkthrough — devops
- `frontend/src/api/client.ts`: fixed to support a relative `VITE_API_URL` (`/api/v1`) for same-origin production, alongside the existing absolute local-dev URL — frontend-dev
- All 179 backend tests + 47 frontend tests pass, `npm run build` clean, `docker compose up --build` still works unaffected — verified independently by the orchestrator
- **Not yet done**: an actual Vercel/Neon account setup and real deploy — Aayush is doing that next himself, orchestrator is not pushing to Vercel

## Known gaps / verification notes
- `docker compose up --build` confirmed working by Aayush and re-verified in-sandbox (2026-10-15).
- Vercel Services config (root `vercel.json`) is based on current Vercel docs (verified live, not from training data) but **not yet verified against a real Vercel/Neon deploy** — that's the next step, Aayush doing it himself. Not a blocker so far.
- Calibrating goals excluded from dashboard rollups, resolved 2026-10-15 — see docs/decisions.md.
- A real data-safety bug (test suite could silently wipe the dev DB) was found and fixed 2026-10-15 — see docs/decisions.md. Always run backend tests with `TEST_DATABASE_URL` explicitly set (backend/tests/conftest.py now enforces this).
- Frontend gaps — Aayush has decided to leave these as-is for now, not fixing before Phase 5: no live check-in score-preview (no backend field to predict it); weekly review's past-week category/daily breakdown isn't available from the API; dashboard hero card approximates active-goal-count via a second query since `/dashboard` doesn't return it; one 674KB JS bundle (code-splitting is a Phase 6 concern). `/goals/{id}/score-history`'s 7D/30D-only limit (vs. the design's 14D mock) is the same kind of deferred gap.

## Open questions for Aayush
1. ~~Final app name?~~ Bihan (decided 2026-10-15)
