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
| Run backend tests | `docker compose exec backend pytest` |
| Run frontend tests | `docker compose exec frontend npm run test -- --run` |

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
| `DATABASE_URL` | backend | SQLAlchemy connection string for Postgres |
| `JWT_SECRET` | backend | Secret used to sign auth tokens — use a long random value outside local dev |
| `JWT_EXPIRES_MINUTES` | backend | How long an access token stays valid |
| `CORS_ORIGINS` | backend | Comma-separated list of origins allowed to call the API |
| `VITE_API_URL` | frontend | Base URL the frontend uses to call the backend |

## CI

`.github/workflows/ci.yml` runs on every pull request:
- Backend: spins up a throwaway Postgres service container and runs `pytest` (skips with a message if no tests exist yet).
- Frontend: `npm ci && npm run test -- --run` (skips with a message if no tests exist yet).

## Deployment (Phase 6)

Planned: frontend on **Vercel**, backend + Postgres on **Render** (or
Railway). This section will be filled in with exact click-steps and the
required environment variables once we reach the Launch phase — see
`docs/master-plan.md` section 8.
