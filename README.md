# Life Tracker

Tracks your progress across life areas (fitness, study, career, custom goals)
and rates it with a clear score, so you can see if you're improving,
consistent, or slipping.

See `docs/master-plan.md` for the full spec (scope, stack, scoring formula,
schema, API contract, build phases).

## Stack

| Layer | Choice |
|---|---|
| Frontend | React 18 + Vite + TypeScript + Tailwind CSS + React Router + TanStack Query |
| Backend | Python 3.12 + FastAPI + SQLAlchemy 2 + Alembic + Pydantic v2 |
| Database | PostgreSQL 16 |
| Dev env | Docker Compose (db + backend + frontend) |

## Prerequisites

Install these once, whether you're on **Windows** or **Mac**:

1. **Git** — [git-scm.com](https://git-scm.com/downloads)
2. **Docker Desktop** — [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop/)
   - Windows: Docker Desktop requires WSL2. The installer will prompt you
     to enable it if it isn't already. After install, make sure the
     **Docker Desktop app is running** (whale icon in the system tray)
     before using any `docker` command — the CLI being installed is not
     enough, the background engine has to be up too.
   - Mac: after install, open Docker Desktop once from Applications and
     let it finish starting (whale icon in the menu bar).
3. **Node.js LTS** (currently 22.x) — [nodejs.org](https://nodejs.org/) —
   only needed if you want to run frontend commands *outside* Docker
   (e.g. your editor's TypeScript tooling). Not required to run the app,
   since Docker Compose runs Node for you.
4. **Python 3.12** — [python.org](https://www.python.org/downloads/) —
   same deal: only needed for running backend tooling outside Docker.

You do **not** need Postgres installed locally — Docker Compose runs it
in a container.

## First-time setup

```bash
git clone <repo-url> life-tracker
cd life-tracker
```

Copy the example environment file and adjust values if needed (the
defaults work for local dev as-is):

- **Mac / Linux / Git Bash on Windows:**
  ```bash
  cp .env.example .env
  ```
- **Windows PowerShell:**
  ```powershell
  Copy-Item .env.example .env
  ```

Then start everything:

```bash
docker compose up --build
```

First run builds the backend and frontend images and installs
dependencies, so it can take a few minutes. After that:

- Backend health check: http://localhost:8000/api/v1/health → `{"status":"ok"}`
- Frontend: http://localhost:5173
- Postgres: `localhost:5432` (user/password/db: `lifetracker` / `lifetracker` / `life_tracker` — see `.env`)

These ports are published on `127.0.0.1` only (security review SEC-015), so
other devices on the same Wi-Fi can't reach your dev database. Use
`localhost` / `127.0.0.1` from your own machine; opening the dev app from
your phone over the LAN won't work.

Press `Ctrl+C` to stop, or run detached with `docker compose up -d --build`.

## Common commands

Run these from the repo root, in a terminal open to the `life-tracker`
folder (works the same on Windows PowerShell / Git Bash / Mac Terminal
since they all go through Docker).

| What | Command |
|---|---|
| Start the full stack | `docker compose up` |
| Start in the background | `docker compose up -d` |
| Rebuild after dependency changes | `docker compose up --build` |
| Stop everything | `docker compose down` |
| Stop and **wipe the database** | `docker compose down -v` |
| View logs (all services) | `docker compose logs -f` |
| View logs (one service) | `docker compose logs -f backend` |
| Shell into the backend container | `docker compose exec backend bash` |
| Shell into the frontend container | `docker compose exec frontend sh` |
| Run backend tests | `docker compose exec -e TEST_DATABASE_URL=postgresql+psycopg2://lifetracker:lifetracker@db:5432/life_tracker_test backend pytest` |
| Run frontend tests | `docker compose exec frontend npm run test -- --run` |

Backend tests always require `TEST_DATABASE_URL` set explicitly to a database
whose name contains "test" (see `backend/tests/conftest.py`'s module
docstring) — the `backend` container's own `DATABASE_URL` points at the real
dev database, and `pytest` refuses to start rather than risk running against
it.

### Database migrations (Alembic)

Once `db-architect` has added Alembic config under `backend/db/`:

```bash
# Apply all migrations
docker compose exec backend alembic upgrade head

# Create a new migration after changing models
docker compose exec backend alembic revision --autogenerate -m "describe change"

# Roll back one migration
docker compose exec backend alembic downgrade -1
```

### Reset the database

This drops all data and starts clean (useful if migrations get into a bad
state during early development):

```bash
docker compose down -v   # removes the named Postgres volume
docker compose up -d db  # recreate just the db container
docker compose exec backend alembic upgrade head  # re-apply migrations
```

## Repo structure

See `docs/master-plan.md` section 7 for the full layout and who owns what.

```
life-tracker/
├── backend/        FastAPI app, SQLAlchemy models, Alembic migrations, scoring engine, tests
├── frontend/        React + Vite app
├── e2e/             Playwright end-to-end tests
├── docs/            master plan, PRD, user stories, API contract, status, decisions
├── design/          approved design tokens + screens (from the design chat)
└── docker-compose.yml
```

## Environment variables

Copy `.env.example` to `.env` and fill in real values for anything beyond
local dev. **Never commit `.env`** — it's gitignored.

| Variable | Used by | Meaning |
|---|---|---|
| `DATABASE_URL` | backend | SQLAlchemy connection string for Postgres. Local dev: the Docker Postgres URL. Production: a Neon pooled connection string with `sslmode=require` — see "Deployment" below. |
| `JWT_SECRET` | backend | Secret used to sign auth tokens. The `.env.example` value is a public dev-only placeholder. On Vercel it must be 32+ random chars (use 48+, different from local) for both Production and Preview, or the backend refuses to start — see `docs/deploy.md`. |
| `JWT_EXPIRES_MINUTES` | backend | How long an access token stays valid |
| `CORS_ORIGINS` | backend | Comma-separated list of origins allowed to call the API |
| `CRON_SECRET` | backend | Production only. Shared secret for the daily score-snapshot cron endpoint — see "Deployment" below. Leave blank locally. |
| `VITE_API_URL` | frontend | Base URL the frontend uses to call the backend |

## CI

`.github/workflows/ci.yml` runs on every pull request:
- Backend: spins up a throwaway Postgres service container and runs `pytest` (skips with a message if no tests exist yet).
- Frontend: `npm ci && npm run test -- --run` (skips with a message if no tests exist yet).

## Deployment

100% free, personal-hobby setup (see `docs/decisions.md` for why):

- **One Vercel project**, using Vercel Services (a beta feature), hosts both
  the frontend and backend behind a single domain — a root
  [`vercel.json`](vercel.json) defines a `frontend` service (`frontend/`,
  Vite) and a `backend` service (`backend/`, FastAPI), with top-level
  rewrites sending `/api/*` to the backend and everything else to the
  frontend. Docker Compose stays local-dev only.
- **Database** — one Neon free Postgres project.
- **Daily score snapshot** — a `CRON_SECRET`-protected HTTP endpoint
  (`/api/v1/internal/daily-snapshot`) triggered by Vercel Cron, instead of a
  background worker (serverless functions can't run long-lived background
  processes).

Because frontend and backend now share one domain, browser calls to
`/api/v1/...` are **same-origin** — this removes CORS from the production
picture (it still matters for local dev, where the Vite dev server and
FastAPI run on different ports).

Full step-by-step instructions (Neon setup, every environment variable,
migrations, verifying the deploy) live in **[`docs/deploy.md`](docs/deploy.md)**.
Quick summary:

1. Create a free [Neon](https://neon.tech) Postgres project, grab the
   *pooled* connection string, and turn it into a `postgresql+psycopg2://...`
   `DATABASE_URL` (see `.env.example`).
2. Run Alembic migrations against Neon by hand from your own machine — never
   as part of the Vercel build:
   ```bash
   cd backend && DATABASE_URL="<neon-url>" alembic upgrade head
   ```
   (PowerShell: `$env:DATABASE_URL="<neon-url>"; alembic upgrade head`)
   **Never run the seed script against Neon.** It creates demo accounts with
   passwords that are public in this repo (SEC-014, see `docs/deploy.md` section 2).
3. Import the GitHub repo into Vercel as **one** project. The root
   `vercel.json` (Services config) tells Vercel how to build the two
   services — there's no separate `backend/vercel.json` or
   `frontend/vercel.json` anymore, those are gone.
4. Set every env var **once**, at the project level (Settings → Environment
   Variables), for **both Production and Preview**: `DATABASE_URL`,
   `JWT_SECRET`, `JWT_EXPIRES_MINUTES`, `CORS_ORIGINS`, `CRON_SECRET`, and
   `VITE_API_URL=/api/v1` (a **relative** path in production, since frontend
   and backend are same-origin — not an absolute URL like in local dev).
   `JWT_SECRET` must be 48+ random chars
   (`python -c "import secrets; print(secrets.token_urlsafe(48))"`), different
   from your local one. If a deploy crashes at startup with an error starting
   "JWT_SECRET is missing...", that variable is missing or weak in that
   environment.
5. Deploy, then verify `GET https://<your-domain>/api/v1/health` returns
   `{"status":"ok"}` and the frontend loads at `https://<your-domain>/`.
6. **Before inviting anyone**, add the Vercel Firewall rate-limit rule on
   `/api/v1/auth/` (dashboard only, not in the repo) — see "Security
   hardening" in `docs/deploy.md`.

See `docs/deploy.md` for the full walkthrough, including why each piece
works this way.
