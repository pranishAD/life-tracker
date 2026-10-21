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

### Never seed the production (Neon) database (security review SEC-014)

**Do not run `python -m db.seed` against Neon.** The seed script creates demo
accounts (`demo@lifetracker.dev`, `priya@lifetracker.dev`) whose passwords are
published in this repo, so anyone could log into them on the live site. The
seed is for your local Docker database only.

`seed.py` now guards against this: if `DATABASE_URL` contains `neon.tech`
(or `VERCEL=1` is set) it refuses to run and exits with an error, and it only
proceeds if you pass `--force`. Don't pass `--force` against production. If
you want sample data to try the live app, register a normal account through
the UI instead.

#### Check Neon for demo users (do this once now)

In the Neon dashboard open **SQL Editor** (on your production branch) and run:

```sql
SELECT email FROM users
WHERE email ILIKE '%@example.com'
   OR email ILIKE '%demo%'
   OR email ILIKE '%@lifetracker.dev';
```

(The last line is there because the second seed user,
`priya@lifetracker.dev`, doesn't match the first two patterns.)

- **No rows:** nothing to do.
- **Any rows:** these are seed or test accounts with public passwords.
  Delete them. `ON DELETE CASCADE` also removes their goals, check-ins,
  milestones, snapshots, category weights and journal entries:
  ```sql
  DELETE FROM users WHERE email IN ('demo@lifetracker.dev', 'priya@lifetracker.dev');
  ```
  List the exact emails the SELECT returned. Don't run a broad `ILIKE`
  delete, in case a real user's email happens to contain "demo". If a row
  is a real person's account, leave it alone and ask them to change their
  password instead.

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
Variables**. Set them for **both the Production and Preview** environments
(tick both boxes when adding each variable). Preview deployments (every
branch / PR push) run the same backend code against real secrets, so a
missing Preview value is just as bad as a missing Production one.

| Variable | Value | Notes |
|---|---|---|
| `DATABASE_URL` | the Neon pooled connection string from step 1, with `postgresql+psycopg2://` | never commit the real value |
| `JWT_SECRET` | **48+ random characters** (required, Production **and** Preview) | generate with `python -c "import secrets; print(secrets.token_urlsafe(48))"`. Must be a **different** value from your local `.env` — never reuse the local/dev one. The backend refuses to start on Vercel if this is missing, still the dev default (`dev-only-change-me`), or shorter than 32 characters (see "If a deploy crashes at startup" below). |
| `JWT_EXPIRES_MINUTES` | `60` (or your preference) | matches `.env.example`'s local default |
| `CORS_ORIGINS` | `http://localhost:5173` (or leave minimal) | production traffic is same-origin and never triggers CORS at all now, so this var has nothing meaningful to do in production — it's kept around for local dev and so the backend's CORS middleware has a harmless, defined value rather than being unset |
| `CRON_SECRET` | a long random string (required, Production **and** Preview) | generate with `python -c "import secrets; print(secrets.token_urlsafe(32))"` — Vercel sends this back as `Authorization: Bearer <CRON_SECRET>` when it calls the cron endpoint; the endpoint compares it to this value |
| `VITE_API_URL` | `/api/v1` | **must be a relative path, not an absolute URL**, in production — frontend and backend are same-origin now, so the frontend should call its own domain's `/api/v1`, not hardcode a separate backend domain. This is a Vite **build-time** variable (baked into the static JS bundle), so it must be set before/at build time, not just at runtime. |

Local dev (`docker compose up`) is unaffected by any of this — it keeps
using `.env` with `VITE_API_URL=http://localhost:8000/api/v1` (absolute,
since the dev server and backend are genuinely different origins/ports) and
`CORS_ORIGINS=http://localhost:5173`. See `.env.example` for the full local
set with comments.

### Double-check the two secrets (security review SEC-002)

After the first deploy, open **Project → Settings → Environment Variables**
and confirm that `JWT_SECRET` and `CRON_SECRET` both exist and both show
**Production** and **Preview** in their environment list. If either one
only shows Production, edit it and tick Preview too, then redeploy.

### If a deploy crashes at startup

If a deployment's function logs (Vercel → Deployments → the deployment →
Logs / Runtime Logs) show a settings validation error starting with
`JWT_SECRET is missing`, for example:

```
JWT_SECRET is missing, a known placeholder, or shorter than 32 characters; refusing to start on Vercel.
```

(an earlier draft of this check said "JWT_SECRET is missing or too weak for
production"; it means the same thing), it means exactly this: in the
environment that deployment belongs to (Production or Preview), `JWT_SECRET`
is either not set, still the public dev default `dev-only-change-me` or
another known placeholder, or shorter than 32 characters. The error never
prints the secret itself. The backend
crashes on purpose instead of signing tokens with a guessable secret. Fix:

1. Generate a new value:
   `python -c "import secrets; print(secrets.token_urlsafe(48))"`
2. Set it as `JWT_SECRET` in **Settings → Environment Variables** for that
   environment (Production and Preview).
3. Redeploy (Deployments → … → Redeploy). Env var changes only take effect
   on a new deployment.

Changing `JWT_SECRET` logs everyone out (existing tokens stop validating).
That's expected and harmless; people just log in again.

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

## 6. Security hardening (do this before inviting anyone)

### 6a. Rate-limit login and register (security review SEC-001)

Without this, anyone can try passwords against `/api/v1/auth/login` as fast
as they like, and spam `/api/v1/auth/register` with junk accounts. An
in-app, in-memory limiter doesn't work on Vercel (every function instance
has its own memory), so we use the **Vercel Firewall (WAF)** instead.

Things to know first:
- Rate limiting is available on the free **Hobby** plan, but Hobby allows
  only **1 rate-limit rule per project** (and 3 custom rules in total). So
  we use **one** rule that covers both auth endpoints.
- This rule lives **only in the Vercel dashboard**. It can't be put in
  `vercel.json` with our Services/rewrites setup, so it is not in the repo.
  If you ever recreate the Vercel project, redo these steps.
- Counters are tracked **per region**, so the limit is "10 per minute per IP
  per Vercel region". That's fine for us.

The rule:

| Setting | Value |
|---|---|
| Condition 1 | **Request Path** · **starts with** · `/api/v1/auth/` |
| Condition 2 (AND) | **Method** · **equals** · `POST` |
| Action | **Rate Limit** |
| Algorithm / window | Fixed window, **60 s** |
| Limit | **10** requests |
| Key | **IP** |
| When exceeded | **429** (the default) |

10 per minute is plenty for a real person (even a few typos), and far too
slow for a password-guessing script.

Click steps:

1. Open the project in the Vercel dashboard → **Firewall** tab →
   **Configure**.
2. Click **+ New Rule**. Name it something like `auth-rate-limit`.
3. Under **If**, add the first condition: **Request Path** → **starts with**
   → `/api/v1/auth/`.
4. Click to add another condition, make sure it's joined with **AND**:
   **Method** → **equals** → `POST`.
5. Under **Then**, choose **Rate Limit**.
6. Set the window to **Fixed window, 60 seconds**, the limit to **10
   requests**, and the key to **IP**. Leave the action as **429** (default).
7. Click **Save Rule**.
8. Click **Review Changes**, check the diff shows just this one new rule,
   then click **Publish**. (Nothing takes effect until you publish.)

Optional, cautious rollout: in step 6, set the action to **Log** instead of
429 and leave it for a day. Requests are never blocked in Log mode; you just
see in the Firewall view how often the rule *would* have fired. If it never
fires for normal use (it shouldn't), edit the rule, switch the action to
**429**, then Review Changes → Publish again. Note that while it's in Log mode
the check below will show `401` every time, not `429`.

#### How to verify the rate limit

This is a light, one-off check, **not a load test**. Run it only against
your own deployment, using **your own account's email** with a wrong
password. It sends 12 quick bad-login requests; expect `401` for the first
~10 and `429` from around the 11th.

**Mac / Linux / Git Bash:**
```bash
for i in $(seq 1 12); do
  curl -s -o /dev/null -w "%{http_code}\n" \
    -X POST "https://<your-domain>/api/v1/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"email":"<your-email>","password":"definitely-wrong"}'
done
```

**Windows PowerShell:**
```powershell
1..12 | ForEach-Object {
  try {
    (Invoke-WebRequest -Method Post -UseBasicParsing `
      -Uri "https://<your-domain>/api/v1/auth/login" `
      -ContentType "application/json" `
      -Body '{"email":"<your-email>","password":"definitely-wrong"}').StatusCode
  } catch { [int]$_.Exception.Response.StatusCode }
}
```

Expected output: about ten `401`s, then `429`. Afterwards:
- You (from that IP) are blocked from logging in until the 60-second window
  resets. Wait a minute before logging in for real.
- If you never see a `429`: check the rule is **published** (not just
  saved), that the action is 429 and not Log, and that the path condition
  is exactly `/api/v1/auth/` (with the trailing slash, no typo).
- Because the window is fixed (not sliding), a run that happens to straddle
  a window boundary may see the `429` a bit later than the 11th request. If
  so, wait a minute and run it once more.

### 6b. Confirm the secrets (security review SEC-002)

Do the check in "Double-check the two secrets" (section 4): `JWT_SECRET`
(48+ random chars, different from local) and `CRON_SECRET` set for **both
Production and Preview**.

### 6c. Security headers (security review SEC-004)

The root [`vercel.json`](../vercel.json) has a top-level `headers` block that
applies to every path (`/(.*)`), so it should cover both the frontend and the
`/api/...` backend responses:

| Header | Value / purpose |
|---|---|
| `Content-Security-Policy-Report-Only` | The CSP, in **report-only** mode for now (Aayush's decision). The browser logs violations but blocks nothing. |
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY`, so the site can't be framed (clickjacking). This is the header that actually stops framing while the CSP is report-only, because browsers ignore `frame-ancestors` in a Report-Only policy. |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` |

The CSP allows `'self'` plus only the external origins the app loads today:
- `https://fonts.googleapis.com`: the Google Fonts stylesheet in
  `frontend/index.html` (`style-src`)
- `https://fonts.gstatic.com`: the font files that stylesheet pulls in
  (`font-src`)

Everything else (scripts, images, the manifest, API calls to `/api/v1`) is
same-origin. There is no `'unsafe-inline'`. If you add a new external
resource later (an image CDN, analytics, another font), add its origin to
the right directive first, or it will show up as a violation.

**Not verified yet:** Vercel Services is in beta. It hasn't been confirmed
that a top-level `headers` block applies to responses from both services.
The check below is how you confirm it.

#### Verify the headers after deploying

**Mac / Linux / Git Bash:**
```bash
curl -sI https://<your-domain>/ | grep -iE "content-security|x-frame|nosniff|referrer|strict-transport"
curl -sI https://<your-domain>/api/v1/health | grep -iE "content-security|x-frame|nosniff|referrer|strict-transport"
```

**Windows PowerShell** (use `curl.exe`, not the `curl` alias):
```powershell
curl.exe -sI https://<your-domain>/ | Select-String -Pattern "content-security|x-frame|nosniff|referrer|strict-transport"
curl.exe -sI https://<your-domain>/api/v1/health | Select-String -Pattern "content-security|x-frame|nosniff|referrer|strict-transport"
```

Both commands should print five lines: `content-security-policy-report-only`,
`x-frame-options`, `x-content-type-options`, `referrer-policy` and
`strict-transport-security`. (`permissions-policy` is set too, but the grep
doesn't look for it.) If the frontend shows them but `/api/v1/health`
doesn't, or the other way round, the top-level block isn't reaching that
service. In that case tell devops so they can move the headers into the
service config or set them in FastAPI.

#### Read Report-Only violations

1. Open the live site in Chrome or Edge, press **F12**, and go to the
   **Console** tab. Tick **Preserve log** so messages survive page changes.
2. Use the app normally: log in, open the dashboard (charts), goals, a goal
   detail page, check in, the weekly review, the journal (including export)
   and settings. Hard-refresh (Ctrl+Shift+R / Cmd+Shift+R) once too.
3. Violations look like
   `[Report Only] Refused to load ... because it violates the following
   Content Security Policy directive: "..."`. Filter the console by
   `Report Only` to find them. The **Issues** tab (Chrome) groups them too.
4. For each one, decide whether it's something the app really needs. If so,
   add that origin to the matching directive in `vercel.json`. If not, find
   out why it's being loaded.
   - Expected noise: on **Preview** deployments the Vercel toolbar
     (`vercel.live`) can trigger violations. Judge the policy on the
     **Production** URL. Browser extensions can also cause violations; check
     in a private window with extensions off.

Leave it on Report-Only for a day or two of normal use.

#### Switch to enforcing (once there are no violations)

In `vercel.json`, change the header **key** only (keep the value the same):

```diff
- { "key": "Content-Security-Policy-Report-Only", "value": "default-src 'self'; ..." },
+ { "key": "Content-Security-Policy", "value": "default-src 'self'; ..." },
```

Commit, deploy, run the `curl` check again (it should now show
`content-security-policy`), and click through the app once more with the
console open. Real violations now block the resource and say `Refused to
...` without the `[Report Only]` prefix.

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
