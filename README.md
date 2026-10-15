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
| `DATABASE_URL` | backend | SQLAlchemy connection string for Postgres. Local dev: the Docker Postgres URL. Production: a Neon pooled connection string with `sslmode=require` — see "Deployment" below. |
| `JWT_SECRET` | backend | Secret used to sign auth tokens — use a long random value outside local dev |
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

- **Frontend** — one Vercel Hobby project, root directory `frontend/`.
- **Backend** — a **second, separate** Vercel Hobby project, root directory
  `backend/`, running the FastAPI app as Vercel serverless functions
  (Vercel's Python runtime — not the Docker container; Docker Compose stays
  local-dev only).
- **Database** — one Neon free Postgres project.
- **Daily score snapshot** — a `CRON_SECRET`-protected HTTP endpoint
  (`/api/v1/internal/daily-snapshot`) triggered by Vercel Cron on the backend
  project, instead of a background worker (Vercel serverless functions can't
  run long-lived background processes).

This section documents every click-step and env var so Phase 6 (Launch) is
"flip the switches", not a scramble. `backend/vercel.json` and
`frontend/vercel.json` already carry the config described below; they're
checked into the repo now so they're reviewed ahead of time, but nothing
deploys until someone connects the Vercel projects.

### 1. Create the Neon database

1. Sign up at [neon.tech](https://neon.tech) (free tier) and create a new
   project, e.g. `life-tracker`.
2. In the Neon console, open **Connect to your database**, pick the default
   branch/database/role, and make sure **pooled connection** is selected
   (adds a `-pooler` hostname — required, since the backend runs as many
   short-lived serverless function instances and Neon's pooled endpoint is
   backed by PgBouncer; see `backend/db/session.py` for why we also use
   `NullPool` on the SQLAlchemy side).
3. Copy the connection string. It looks like:
   ```
   postgresql://<user>:<password>@<project>-pooler.<region>.aws.neon.tech/<dbname>?sslmode=require&channel_binding=require
   ```
4. Turn it into the `DATABASE_URL` the backend expects by changing the
   scheme from `postgresql://` to `postgresql+psycopg2://` (so SQLAlchemy
   picks the psycopg2 driver) and leaving everything else — host, `-pooler`,
   `sslmode=require`, `channel_binding=require` — unchanged. See
   `.env.example` for the exact shape.
5. **Don't commit this value anywhere.** It only goes into the backend
   Vercel project's environment variables (step 3 below) and your own local
   shell/`.env` when running migrations.

### 2. Run migrations against Neon (manual, from a dev machine)

Alembic migrations are **never** run as part of the Vercel build — Vercel's
Python runtime only deploys the app, it doesn't run arbitrary build-time
commands against your database, and we don't want a bad migration to block
or corrupt a live deploy. Instead, run them by hand whenever the schema
changes:

```bash
cd backend
DATABASE_URL="<neon-connection-string-above>" alembic upgrade head
```

(PowerShell: `$env:DATABASE_URL="<...>"; alembic upgrade head`, run from
inside `backend/` with the same Python env used for local dev, e.g. inside
`docker compose exec backend sh` with `DATABASE_URL` overridden, or a local
virtualenv with `pip install -r requirements.txt`.)

Run the seed script (`python db/seed.py`) the same way if you want starter
data in the Neon database — same `DATABASE_URL` override, same caution:
only run it against a database you're fine seeding.

### 3. Deploy the backend to Vercel

1. In Vercel, **Add New Project**, import the `life-tracker` GitHub repo,
   and set **Root Directory** to `backend/`.
2. Vercel auto-detects the FastAPI/Python framework from
   `backend/requirements.txt` and the entrypoint at `backend/app/main.py`
   (which defines the top-level `app` FastAPI instance) — no build command
   needed. `backend/vercel.json` adds the one thing Vercel can't infer: the
   cron job (see step 5).
3. Set these **Environment Variables** on this Vercel project (Project →
   Settings → Environment Variables), for the Production environment at
   least:
   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | the Neon pooled connection string from step 1, with `+psycopg2` |
   | `JWT_SECRET` | a long random string (`python -c "import secrets; print(secrets.token_urlsafe(48))"`) — different from any dev value |
   | `JWT_EXPIRES_MINUTES` | `60` (or your preference) |
   | `CORS_ORIGINS` | the frontend's production Vercel URL, e.g. `https://life-tracker.vercel.app` (comma-separate if you also want to allow a preview URL) |
   | `CRON_SECRET` | a long random string (`python -c "import secrets; print(secrets.token_urlsafe(32))"`) |
4. Deploy. Verify with `GET https://<backend-project>.vercel.app/api/v1/health`
   → `{"status":"ok"}`.
5. **Cron job**: `backend/vercel.json` declares
   ```json
   {
     "crons": [
       { "path": "/api/v1/internal/daily-snapshot", "schedule": "0 16 * * *" }
     ]
   }
   ```
   Vercel Hobby allows cron jobs that run **once per day** and does not
   guarantee the exact minute they fire — both fine for a daily snapshot.
   Vercel invokes the path with an HTTP **GET** request (not POST), and when
   `CRON_SECRET` is set on the project, automatically adds an
   `Authorization: Bearer <CRON_SECRET>` header to that request — the
   endpoint just needs to compare it against the `CRON_SECRET` env var.
   **Note:** `docs/master-plan.md` section 3 currently describes this as a
   `POST` endpoint; since Vercel Cron can only call it with `GET`, the
   endpoint needs to accept `GET` (either instead of or in addition to
   `POST`) for the cron trigger to work. This is a small API-contract detail
   for the orchestrator/backend-dev to confirm before Phase 3 — flagged, not
   decided, here. **This endpoint doesn't exist yet** — backend-dev builds
   it in Phase 3.

### 4. Deploy the frontend to Vercel

1. **Add New Project** again, same repo, **Root Directory** `frontend/`.
   Vercel auto-detects Vite; no build command override needed
   (`npm run build` / output `dist/`).
2. Set this **Environment Variable**:
   | Variable | Value |
   |---|---|
   | `VITE_API_URL` | the backend project's URL + `/api/v1`, e.g. `https://life-tracker-api.vercel.app/api/v1` |
3. `frontend/vercel.json` adds a catch-all rewrite to `index.html` — without
   it, a hard refresh or direct link to a client-side route like
   `/dashboard` (React Router) would 404, since there's no `dashboard.html`
   file; Vite's static build only has one.
4. Deploy. Visit the frontend's Vercel URL and confirm it can reach the
   backend (e.g. register/login once backend-dev has built those routes).
5. Once both URLs are known, go back to the backend project's `CORS_ORIGINS`
   and make sure it includes the frontend's actual Vercel URL, then
   redeploy the backend if you changed it.

### Updating env vars later

Environment variables are set per-project in the Vercel dashboard (or via
`vercel env add`), **not** committed to `vercel.json` or the repo. After
changing one, redeploy (Vercel dashboard → Deployments → Redeploy, or push a
commit) for it to take effect.
