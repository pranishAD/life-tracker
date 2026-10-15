# Deploying Bihan (Phase 6)

This is the step-by-step reference for taking Bihan from `docker compose up`
on your laptop to a live URL. It assumes you've never used Vercel or Neon
before — a little more explanation than a pure command list, since you know
SQL/Python well but this is newer ground.

**Architecture in one sentence:** one Vercel project, using a (beta) Vercel
feature called **Services**, hosts both the React frontend and the FastAPI
backend behind a single domain; a separate free Neon Postgres project is the
database. There used to be a plan for *two* separate Vercel projects
(`backend/vercel.json` + `frontend/vercel.json`) — that's gone. **Those two
files no longer exist.** The only Vercel config now is the root
[`vercel.json`](../vercel.json).

Why this matters practically: because the frontend and backend now share one
domain (e.g. `https://bihan.vercel.app`), a browser request from the React
app to `/api/v1/...` is **same-origin**, not cross-origin. That removes CORS
from the production picture entirely (CORS only ever mattered for local dev,
where the Vite dev server on port 5173 and FastAPI on port 8000 are
different origins).

## 1. Create the Neon database

1. Sign up at [neon.tech](https://neon.tech) (free tier) and create a new
   project, e.g. `bihan`.
2. In the Neon console, open **Connect to your database** and make sure the
   **pooled connection** is selected (this adds a `-pooler` hostname to the
   connection string). This matters because the backend will run many
   short-lived instances rather than one long-lived process, and Neon's
   pooled endpoint is backed by PgBouncer, which absorbs that connection
   churn cheaply.
3. Copy the connection string. It looks like:
   ```
   postgresql://<user>:<password>@<project>-pooler.<region>.aws.neon.tech/<dbname>?sslmode=require&channel_binding=require
   ```
4. Turn it into the `DATABASE_URL` our backend expects by changing only the
   scheme, from `postgresql://` to `postgresql+psycopg2://` (so SQLAlchemy
   picks the psycopg2 driver) — leave the host (including `-pooler`),
   `sslmode=require` and `channel_binding=require` untouched.
5. No code change is needed for this. `backend/db/session.py` already uses
   `NullPool` and accepts the URL (including `sslmode=require` and the
   `-pooler` host) as-is — it was built with exactly this deploy target in
   mind. See the comment block at the top of that file if you want the full
   "why."
6. **Never commit this connection string.** It only goes into the Vercel
   project's environment variables (section 3 below) and your own shell when
   running migrations (section 2 below).

## 2. Run migrations against Neon (manual, from your own machine)

Alembic migrations are **never** run as part of the Vercel build — Vercel
just deploys the app, it has no step for running arbitrary commands against
a database on every deploy, and we don't want a bad migration silently
blocking or corrupting a live deploy. Run them by hand instead, whenever the
schema changes:

**Mac / Linux / Git Bash:**
```bash
cd backend
DATABASE_URL="<neon-connection-string-from-step-1>" alembic upgrade head
```

**Windows PowerShell:**
```powershell
cd backend
$env:DATABASE_URL="<neon-connection-string-from-step-1>"
alembic upgrade head
```

Run this from an environment that has the backend's Python dependencies
installed — either a local virtualenv (`pip install -r requirements.txt`) or
by overriding `DATABASE_URL` inside the `backend` container:
`docker compose exec -e DATABASE_URL="<neon-url>" backend alembic upgrade head`.

If you want starter data in the deployed database, run the seed script the
same way (same caution — only run it against a database you're fine
seeding):

```bash
# Mac / Linux / Git Bash
DATABASE_URL="<neon-connection-string>" python -m db.seed

# Windows PowerShell
$env:DATABASE_URL="<neon-connection-string>"
python -m db.seed
```

## 3. Create the Vercel project

1. In Vercel, **Add New Project** and import the `bihan` (life-tracker)
   GitHub repo — **once**, as a single project. Do not create a second
   project for the backend; that was the old (now abandoned) plan.
2. Because the repo has a root [`vercel.json`](../vercel.json) defining a
   `services` object, Vercel should detect this as a **Services** project
   rather than a single-framework project and build `frontend/` and
   `backend/` as two independent services from that one config. (The exact
   wording Vercel's import UI uses for this — e.g. whether it still shows a
   single "Framework Preset" dropdown or something else for a Services
   repo — may have changed since this doc was written; if the dashboard
   doesn't obviously show a Services option, Vercel's current docs at
   vercel.com/docs/services are the source of truth, not this paragraph.)
   The structural facts that matter, regardless of the exact UI:
   - `vercel.json` lives only at the repo root now (no per-folder config).
   - It declares two services, `frontend` (root `frontend/`, framework
     `vite`) and `backend` (root `backend/`, framework `fastapi`, entrypoint
     `app.main:app`).
   - Top-level `rewrites` route `/api/(.*)` to the `backend` service and
     everything else (`/(.*)`, must be last) to the `frontend` service.
   - The `backend` service's FastAPI app receives the full original path
     unchanged (e.g. a browser request to `/api/v1/goals` arrives at FastAPI
     as `/api/v1/goals`), so none of our existing `/api/v1/...` routes need
     to change for this to work.
   - The frontend service has its own `rewrites` entry
     (`/(.*) -> /index.html`) — this is the client-side-routing fallback so
     a hard refresh or direct link to something like `/goals/123` loads the
     React app (which then does its own routing) instead of 404ing. It only
     kicks in after Vercel's static file server has already failed to find a
     matching built asset, so real files like `/assets/index-abc123.js` are
     served normally and never hit this fallback.
3. There is no `"public": true` field anywhere in this config, and you don't
   need to add one. A service becomes publicly reachable purely by being the
   `destination` of a top-level rewrite — both `frontend` and `backend` are,
   via the two rewrites above, so both are reachable.

## 4. Set every environment variable (once, for the whole project)

Because this is **one** Vercel project now (not two), all env vars are set
**once**, at the project level: **Project → Settings → Environment
Variables**, for at least the **Production** environment.

| Variable | Value | Notes |
|---|---|---|
| `DATABASE_URL` | the Neon pooled connection string from step 1, with `postgresql+psycopg2://` | never commit the real value |
| `JWT_SECRET` | a long random string | generate with `python -c "import secrets; print(secrets.token_urlsafe(48))"` — use a different value than your local `.env` |
| `JWT_EXPIRES_MINUTES` | `60` (or your preference) | matches `.env.example`'s local default |
| `CORS_ORIGINS` | `http://localhost:5173` (or leave minimal) | production traffic is same-origin and never triggers CORS at all now, so this var has nothing meaningful to do in production — it's kept around for local dev and so the backend's CORS middleware has a harmless, defined value rather than being unset |
| `CRON_SECRET` | a long random string | generate with `python -c "import secrets; print(secrets.token_urlsafe(32))"` — Vercel sends this back as `Authorization: Bearer <CRON_SECRET>` when it calls the cron endpoint; the endpoint compares it to this value |
| `VITE_API_URL` | `/api/v1` | **must be a relative path, not an absolute URL**, in production — frontend and backend are same-origin now, so the frontend should call its own domain's `/api/v1`, not hardcode a separate backend domain. This is a Vite **build-time** variable (baked into the static JS bundle), so it must be set before/at build time, not just at runtime. |

Local dev (`docker compose up`) is unaffected by any of this — it keeps
using `.env` with `VITE_API_URL=http://localhost:8000/api/v1` (absolute,
since the dev server and backend are genuinely different origins/ports) and
`CORS_ORIGINS=http://localhost:5173`. See `.env.example` for the full local
set with comments.

## 5. Deploy and verify

1. Deploy (first push/import triggers it automatically).
2. Check the backend service directly: `GET https://<your-domain>/api/v1/health`
   → `{"status":"ok"}`.
3. Check the frontend: visit `https://<your-domain>/` and confirm the app
   loads and can register/log in (i.e. it's actually reaching
   `/api/v1/auth/...` on the same domain).
4. Check SPA routing: visit a deep link like
   `https://<your-domain>/goals/<some-id>` directly (not by clicking through
   the app) and confirm it loads the React app instead of a 404 — this
   exercises the frontend service's `index.html` rewrite.
5. **Cron job**: the root `vercel.json` declares
   ```json
   { "path": "/api/v1/internal/daily-snapshot", "schedule": "0 16 * * *" }
   ```
   Vercel Hobby allows cron jobs that run once per day and doesn't guarantee
   the exact minute — fine for a daily snapshot. Vercel always calls cron
   paths with `GET` (not `POST`) and, when `CRON_SECRET` is set on the
   project, automatically adds an `Authorization: Bearer <CRON_SECRET>`
   header — the endpoint just compares it against the `CRON_SECRET` env var
   from step 4.

## Updating env vars later

Environment variables are set in the Vercel dashboard (or via
`vercel env add`), never committed to `vercel.json` or the repo. After
changing one, redeploy (Vercel dashboard → Deployments → Redeploy, or push a
commit) for it to take effect — and remember `VITE_API_URL` is baked in at
build time, so changing it always requires a fresh build, not just a
restart.

## What changed from the old two-project plan

- `backend/vercel.json` and `frontend/vercel.json` are **deleted**. The root
  [`vercel.json`](../vercel.json) is the only Vercel config in the repo now.
- One Vercel project instead of two — one set of env vars, one domain.
- `VITE_API_URL` in production is now a relative path (`/api/v1`) instead of
  an absolute cross-origin backend URL.
- `CORS_ORIGINS` no longer needs the frontend's production URL added —
  same-origin requests don't trigger CORS at all. It still matters locally.
- Neon setup, the migration workflow, and `backend/db/session.py`'s
  `NullPool`/pooled-connection approach are unchanged from the original plan.
