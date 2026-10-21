# Bug log

Severity: critical (blocks core loop, data loss, security, wrong score) / major (broken with workaround, or bad mobile UX) / minor (cosmetic, copy, small layout).

## BUG-001 - Dev frontend crashes after pulling new dependencies (stale node_modules volume)

- Severity: major
- Area: dev environment / docker compose
- Owner: devops
- Steps to reproduce:
  1. On a machine with an existing `frontend_node_modules` Docker volume (created before `@dnd-kit/*` was added to `frontend/package.json`), run `docker compose up -d --build frontend`.
  2. Open http://localhost:5173/register.
- Expected: app loads.
- Actual: Vite error overlay: `Failed to resolve import "@dnd-kit/core" from "src/components/settings/CategoriesSettings.tsx"`. Whole app unusable. Rebuilding the image does not help because the named volume `frontend_node_modules` masks the image's `node_modules`.
- Evidence: Playwright screenshot of the overlay (first run, `e2e/test-results/`, not kept).
- Workaround: `docker compose exec frontend npm install`.
- Suggested fix: run `npm install` (or `npm ci`) in the frontend container start command, or document `docker compose down -v` after dependency changes in README.
- Status: Open

## BUG-002 - Local DB not migrated automatically; stack runs against an old schema

- Severity: major
- Area: dev environment / migrations
- Owner: devops (with db-architect)
- Steps to reproduce:
  1. Existing local DB at revision `0002_journal_entries`; check out `feature/goal-customisation` (head is `0003_goal_customisation`).
  2. `docker compose up`.
- Expected: schema upgraded, or a clear startup error.
- Actual: backend starts with the old schema (`alembic current` = 0002, head = 0003); category and new goal-field endpoints would fail until `alembic upgrade head` is run by hand. No warning at startup.
- Evidence: `docker compose exec backend alembic current` shows 0002 while `alembic heads` shows `0003_goal_customisation (head)`.
- Workaround: `docker compose exec backend alembic upgrade head` (local DB only).
- Suggested fix: run `alembic upgrade head` in the backend start command for dev, or fail fast if not at head.
- Status: Fixed 2026-10-21 (docker-compose backend command now runs `alembic upgrade head` before uvicorn; DATABASE_URL pinned to the compose db). Verified: alembic current = 0003 (head).

## BUG-003 - Progress bars expose no accessible role or value

- Severity: minor
- Area: frontend / accessibility
- Owner: frontend-dev
- Steps to reproduce: open any goal detail page with a numeric goal; inspect the progress bar (component `ProgressBar`).
- Expected: `role="progressbar"` with `aria-valuenow` (0-100), `aria-valuemin`, `aria-valuemax` and a label, so screen readers and tests can read the progress.
- Actual: plain `div`s with an inline `width: N%`; no role or value. E2E (TC-GC-04) has to assert on the inline style `width: 50%`, which is fragile.
- Evidence: `frontend/src/components/ProgressBar.tsx`.
- Status: Fixed 2026-10-21 (ProgressBar has role=progressbar + aria-valuenow/min/max + aria-label; 3 vitest cases). Pending: qa-tester to switch TC-GC-04 off the inline-style assertion; call sites could pass the goal name as label.
