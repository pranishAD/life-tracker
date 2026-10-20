# Bihan security review

## Review 1 — 2026-10-20 (branch `security/review-1`)

**Scope:** whole app. That covers `backend/` (auth, every router, services, schemas, models, migrations 0001 + 0002), the Journal feature (`/journal`, `/journal/stats`, `/journal/export`, frontend Journal pages, editor and export modal), `frontend/`, `vercel.json`, `docs/deploy.md`, `.env.example`, `docker-compose.yml`, CI, and the full git history.

**Method:**
- Static review of all of the above.
- Dynamic tests against the **local Docker stack only** (`docker compose up -d db backend`, http://localhost:8000). Before starting it I checked that the local `.env` points at the local `db` container, not Neon.
- `pip-audit` was run inside the backend container and `npm audit --omit=dev` in `frontend/`.
- **No live-site check was done.** No confirmed production URL is documented anywhere (`bihan.vercel.app` only appears as an "e.g."), so the passive header fetch was skipped. The header findings come from reading `vercel.json`.

### Summary

| Severity | Count |
|---|---|
| Critical | 0 |
| High | 2 |
| Medium | 4 |
| Low | 9 |

**Verdict: fix first (the 2 highs) before inviting anyone beyond yourself. There is nothing critical.**

The most important thing, data isolation between users, is solid. All 37 dynamic checks passed:
- User B got 404 on every read, edit or delete of user A's goals, milestones, check-ins, scores and journal entries.
- B's list, search, tag filter, stats, export, dashboard and weekly review never contained any of A's data.
- Mass-assignment attempts were all ignored.
- JWT `alg=none` and garbage tokens were rejected.

The two highs are:
1. There is no brute-force protection on login.
2. The backend silently falls back to a public, hard-coded JWT secret if `JWT_SECRET` is ever missing in production.

---

## Findings

### SEC-001 — No brute-force / rate limiting on login and register
- **Severity:** high
- **Where:** `POST /api/v1/auth/login`, `POST /api/v1/auth/register` (`backend/app/routers/auth.py:33-58`). There is nothing in front of them in `vercel.json` either.
- **What's wrong:** Anyone can try passwords against an account as fast as they like. Locally, 15 wrong passwords in a row all returned `401`. None was slowed down or blocked (no `429`).
- **How it could be abused:** An attacker who knows (or guesses, see SEC-005) your email can run a password list against the login endpoint and eventually read your journal. Bcrypt (~350 ms per try) slows this down but doesn't stop a patient attacker using many parallel requests. Register can also be spammed to fill the database with junk accounts.
- **Fix:** On Vercel serverless, an in-memory limiter (e.g. `slowapi` with default storage) does **not** work. Each function instance has its own memory. Pick one of these:
  1. **Simplest, no code:** add a Vercel Firewall (WAF) rate-limit rule for `/api/v1/auth/login` and `/api/v1/auth/register`, e.g. 10 requests per minute per IP, action = deny with 429.
  2. **Per-account lockout in the app** (works even across IPs). Store failed attempts in Postgres, e.g. a `login_attempts(email_lower, attempted_at)` table or `failed_login_count` + `locked_until` columns on `users`. This is a schema change, so it needs Aayush's approval and a db-architect migration. Then in `login()`: if there were 5 or more failures in the last 15 minutes, return `429 TOO_MANY_ATTEMPTS`, and clear the counter on success.

  Doing both is ideal; (1) alone is acceptable for v1.
- **Owner:** devops (WAF rule); backend-dev + db-architect if (2) is chosen
- **Status:** open

### SEC-002 — App silently runs with a public default JWT secret if `JWT_SECRET` is missing
- **Severity:** high
- **Where:** `backend/app/config.py:25` (`jwt_secret: str = "dev-only-change-me"`), `docker-compose.yml:29`, `.env.example:22`. The same pattern applies to `database_url` (`config.py:24`, `db/session.py:25-28`).
- **What's wrong:** If `JWT_SECRET` is not set in the Vercel project, the backend doesn't fail. It quietly signs and accepts tokens with the string `dev-only-change-me`, which is public in this repo. Nothing checks the secret's length or that it isn't the default. Examples of how it could go missing: a typo, a new Preview/Production environment, or env vars recreated after a project move.
- **How it could be abused:** With the default secret, anyone can mint a valid token for any user ID (`{"sub": "<uuid>"}`) and read or edit that user's goals and journal. User UUIDs aren't shown to other users, which makes this harder but doesn't prevent it. This is an auth bypass that's one config mistake away. I could not verify the production env vars, so this is rated high rather than critical.
- **Fix:** Fail closed at startup. In `config.py`:
  ```python
  import os
  from pydantic import model_validator

  _INSECURE_SECRETS = {"", "dev-only-change-me", "changeme", "secret"}

  class Settings(BaseSettings):
      ...
      @model_validator(mode="after")
      def _refuse_weak_secrets_in_prod(self):
          on_vercel = os.environ.get("VERCEL") == "1"   # Vercel sets this at runtime
          if on_vercel and (self.jwt_secret in _INSECURE_SECRETS or len(self.jwt_secret) < 32):
              raise ValueError("JWT_SECRET is missing or too weak for production")
          return self
  ```
  Also call `get_settings()` once at import in `main.py` (it already does, via `create_app`), so a bad config crashes the deploy instead of serving requests. After deploying, confirm in Vercel → Settings → Environment Variables that `JWT_SECRET` (48+ random chars) and `CRON_SECRET` are set for **Production and Preview**.
- **Owner:** backend-dev (code); devops (confirm Vercel env vars)
- **Status:** open

### SEC-003 — Database errors write SQL parameters (password hashes, emails, journal text) into logs
- **Severity:** medium
- **Where:** `backend/db/session.py:52` (`create_engine(...)` without `hide_parameters=True`) combined with `backend/app/errors.py:105` (`logger.exception(...)`).
- **What's wrong:** When any database error escapes to the generic 500 handler, the full exception is logged, and SQLAlchemy includes the bound parameters in it. I triggered this locally by registering with a 500-character name (see SEC-006). The backend log then contained `[parameters: {'name': ..., 'email': ..., 'password_hash': ...}]`. The same thing would happen for a journal insert or update (the `title`/`body` would appear, truncated to a few hundred characters) on any DB error, including a Neon connection drop at commit time. On Vercel these logs live in the dashboard and in any log drain.
- **How it could be abused:** Anyone with access to the Vercel logs, or a log-drain provider, sees private journal text and password hashes they should never see. This also breaks the "journal content never appears in logs" rule.
- **Fix:** One line in `db/session.py`:
  ```python
  engine = create_engine(DATABASE_URL, poolclass=NullPool, future=True, hide_parameters=True)
  ```
  The SQL statement still appears in the log (useful for debugging), but the values don't. Fixing SEC-006 also removes the easy way to trigger these 500s.
- **Owner:** db-architect (owns `backend/db/`)
- **Status:** open

### SEC-004 — No HTTP security headers (CSP, frame-ancestors, nosniff, referrer policy)
- **Severity:** medium
- **Where:** `vercel.json` (no `headers` block). FastAPI doesn't set any either.
- **What's wrong:**
  - There is no Content-Security-Policy, so if any XSS ever sneaks in, nothing limits what injected script can do. That matters because the token lives in `localStorage` (SEC-009).
  - There is no `frame-ancestors` / `X-Frame-Options`, so the site can be framed (clickjacking).
  - There is no `X-Content-Type-Options: nosniff`, and no `Referrer-Policy`.
  - HSTS is probably added by Vercel on `*.vercel.app` by default, but this was not confirmed against a live response.
- **How it could be abused:** An attacker frames Bihan on their own page and tricks you into clicking "Delete" (clickjacking). Or a future XSS bug gets full freedom to send your token and journal to the attacker's server, because nothing restricts where scripts can connect.
- **Fix:** Add this to the root `vercel.json` (top level, next to `rewrites`). It allows the Google Fonts the app already uses. Roll out the CSP as `Content-Security-Policy-Report-Only` for a day first, check the browser console for violations, then switch to the enforcing header.
  ```json
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "Content-Security-Policy", "value": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'" },
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
        { "key": "Strict-Transport-Security", "value": "max-age=63072000; includeSubDomains" },
        { "key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=()" }
      ]
    }
  ]
  ```
  After deploying, verify with `curl -sI https://<your-domain>/ | grep -iE "content-security|x-frame|nosniff|referrer|strict-transport"` and repeat for `/api/v1/health`. Vercel Services is in beta, so confirm the top-level `headers` block applies to both services.
- **Owner:** devops
- **Status:** open

### SEC-005 — User enumeration: register says "email already registered", and login timing gives it away
- **Severity:** medium
- **Where:** `backend/app/routers/auth.py:35-36` (409 `EMAIL_ALREADY_REGISTERED`) and `auth.py:53-55`. When the email doesn't exist, `verify_password` is skipped, so the response is much faster.
- **What's wrong:**
  - The login error message is identical in both cases, which is good (verified).
  - But register openly says whether an email has an account.
  - Login timing also leaks it. Locally, the median response for an unknown email was **11 ms** versus **356 ms** for an existing email with a wrong password (10 tries each).
- **How it could be abused:** An attacker can check whether a specific person uses Bihan (itself private, since it's a journaling app), then focus password guessing (SEC-001) on accounts that exist.
- **Fix:**
  - Timing (easy): always run bcrypt once, even when the user doesn't exist.
    ```python
    _DUMMY_HASH = hash_password("dummy-password-for-timing")  # module level, computed once

    user = _get_user_by_email(db, payload.email)
    hash_to_check = user.password_hash if user else _DUMMY_HASH
    if not verify_password(payload.password, hash_to_check) or user is None:
        raise unauthorized("Incorrect email or password.")
    ```
  - Register: a fully enumeration-proof register needs email verification, which there is no infrastructure for yet. **Recommend accepting the 409 for v1** (it's good UX) and relying on SEC-001's rate limit to stop bulk checking. Log this as an accepted risk in `docs/decisions.md`.
- **Owner:** backend-dev
- **Status:** open

### SEC-006 — Missing max lengths and numeric bounds: unbounded storage and 500 errors
- **Severity:** medium
- **Where:**
  - `backend/app/schemas/auth.py:25` (`name`, no max; DB column is 120)
  - `schemas/goals.py:37-46, 63-72`: `title` (DB 200), `unit` (DB 32), `description` (Text, unbounded), and `target_value` / `weight` (DB `Numeric(12,2)` / `Numeric(5,2)`)
  - `schemas/milestones.py:24, 29`: `title` (DB 200)
  - `schemas/check_ins.py:25-26`: `note` (Text, unbounded) and `value` (`Numeric(12,2)`)
  - `schemas/settings.py:22`: `weight` (`Numeric(5,2)`)
  - Also `password` (no max)
- **What's wrong:** The journal schemas are done correctly: title ≤120, body ≤50,000, tags ≤10 × 32 chars, mood 1-5. These were all verified, and a 50,001-char body got a 422. The older endpoints don't have such limits. Results measured locally:
  - 500-char name → **500**
  - 300-char goal title → **500**
  - `target_value: 1e20` → **500**
  - 1 MB goal description → **201 (stored)**
  - 1 MB check-in note → **201 (stored)**
- **How it could be abused:** A user can fill the free-tier Neon database (0.5 GB) with megabytes of junk per request. Vercel caps request bodies at ~4.5 MB, but that's still a lot per call, and nothing limits the number of calls. Each 500 also triggers the parameter logging in SEC-003. Attackers can only fill their own account, so this is a cost and availability issue, not a data leak.
- **Fix:** Add limits that match the DB columns, so bad input gets a clean 422:
  ```python
  # auth.py
  name: str = Field(min_length=1, max_length=120)
  password: str = Field(min_length=8, max_length=128)
  # goals.py (create + update)
  title: str = Field(min_length=1, max_length=200)
  description: Optional[str] = Field(default=None, max_length=2000)
  unit: Optional[str] = Field(default=None, max_length=32)
  target_value: Optional[float] = Field(default=None, gt=0, lt=10**10, allow_inf_nan=False)
  weight: float = Field(default=1.0, gt=0, lt=1000, allow_inf_nan=False)
  frequency_per_week: Optional[int] = Field(default=None, ge=1, le=7)
  # milestones.py
  title: str = Field(min_length=1, max_length=200)
  # check_ins.py
  value: Optional[float] = Field(default=None, ge=-10**10, lt=10**10, allow_inf_nan=False)
  note: Optional[str] = Field(default=None, max_length=2000)
  # settings.py
  weight: float = Field(gt=0, lt=1000, allow_inf_nan=False)
  ```
  The exact text limits (2000) are a product choice. Check them against `docs/api-contract.yaml`, and if the contract needs `maxLength` added, route that through the orchestrator.
- **Owner:** backend-dev
- **Status:** open

### SEC-007 — CRON_SECRET compared with `!=` instead of a constant-time compare
- **Severity:** low
- **Where:** `backend/app/routers/internal.py:33`
- **What's wrong:** A plain string `!=` can in theory leak, through response timing, how many leading characters of a guess are correct. The rest of the check is good:
  - An empty or unset `CRON_SECRET` always rejects (fail-closed).
  - A missing header gives 401, and a wrong header gives 401 (both verified).
- **How it could be abused:** Remote timing attacks on a string compare are very hard over the internet, especially through Vercel's edge. A successful attacker could only trigger the daily snapshot job, which is harmless. This is hygiene.
- **Fix:**
  ```python
  import secrets
  expected = f"Bearer {settings.cron_secret}"
  if not settings.cron_secret or not secrets.compare_digest((authorization or "").encode(), expected.encode()):
      raise unauthorized("Missing or wrong CRON_SECRET.")
  ```
- **Owner:** backend-dev
- **Status:** open

### SEC-008 — Journal list/export crash with 500 on extreme dates
- **Severity:** low
- **Where:** `backend/app/services/journal_service.py:191-192` (list), `:493` (export, `resolved_to + timedelta(days=1)`), `:440` (`to_date + timedelta(days=6)` in `_weekly_lines`)
- **What's wrong:** `GET /journal/export?to=9999-12-31` and `?from=0001-01-01&to=9999-12-30` both return **500** (`OverflowError: date value out of range`). Isolation is not affected: user B's export over 2000-2030 returned 0 entries and none of A's text. Very wide but valid ranges are cheap: 0001-01-01 to 9999-12-20 ran in 0.75 s, so this is not a CPU denial-of-service.
- **How it could be abused:** Only to produce 500s and noisy logs (and, until SEC-003 is fixed, more log lines).
- **Fix:** Bound the dates in the router, e.g. reject `from`/`to` outside `1970-01-01 … 2100-12-31` with a 422:
  ```python
  MIN_D, MAX_D = date(1970, 1, 1), date(2100, 12, 31)
  for d in (from_, to):
      if d is not None and not (MIN_D <= d <= MAX_D):
          raise validation_error("Dates must be between 1970-01-01 and 2100-12-31.")
  ```
  Apply this to `/journal` and `/journal/export`. The same applies to `week_start` on `/reviews/weekly` and to goal `start_date`/`deadline`.
- **Owner:** backend-dev
- **Status:** open

### SEC-009 — Token kept in `localStorage`; logout is client-side only (accepted tradeoff, keep XSS at zero)
- **Severity:** low
- **Where:** `frontend/src/api/client.ts:10-22`, `frontend/src/context/AuthContext.tsx:98-103`
- **What's wrong:**
  - Any JavaScript running on the page can read `localStorage`, so one XSS bug means token theft.
  - Logout only deletes the token from the browser, so a stolen token stays valid until it expires (60 min, `JWT_EXPIRES_MINUTES`, enforced by PyJWT, and a 401 after expiry is handled correctly).
- **XSS assessment:** The current XSS risk is **low**. There is no `dangerouslySetInnerHTML`, `innerHTML`, `eval`, or Markdown/HTML renderer anywhere in `frontend/src`. Journal body, titles, tags and goal titles are all rendered as React text, which is auto-escaped. Search highlighting (`Highlight.tsx`) escapes the regex and renders `<mark>` with text children. The export preview renders lines as text. The download uses a `Blob`, not HTML.
- **How it could be abused:** Only in combination with a future XSS bug. The attacker's script would read `bihan_token` and use it from elsewhere for up to an hour.
- **Fix:** Accept this for v1 and keep the TTL at 60 min. Add the CSP from SEC-004, which is the main mitigation. Long-term options are an `HttpOnly; Secure; SameSite=Strict` cookie (production is same-origin, so this is straightforward) and a `token_version` column on `users` to allow "log out everywhere". Both are API/schema changes that need approval. **Rule for frontend-dev: never add `dangerouslySetInnerHTML` or a Markdown renderer for journal text without DOMPurify.**
- **Owner:** frontend-dev (keep no-HTML rule); backend-dev (future cookie/revocation)
- **Status:** open (accepted risk for v1)

### SEC-010 — API docs (`/docs`, `/openapi.json`) are public
- **Severity:** low
- **Where:** `backend/app/main.py:39` (`FastAPI(title=...)` with default docs URLs)
- **What's wrong:** Locally, `/docs` and `/openapi.json` return 200. In production the rewrite only routes `/api/*` to the backend, so these root paths probably hit the frontend instead. That is unverified, and the app would expose them if the routing ever changes. It's a free map of every endpoint for an attacker. The contract is in the public repo anyway, so the impact is minimal.
- **Fix:** `FastAPI(title="Life Tracker API", docs_url=None if os.environ.get("VERCEL") else "/docs", redoc_url=None, openapi_url=None if os.environ.get("VERCEL") else "/openapi.json")`
- **Owner:** backend-dev
- **Status:** open

### SEC-011 — Dependency advisories (none reachable)
- **Severity:** low
- **Where:** `backend/requirements.txt`, `frontend/package.json`
- **What's wrong:**
  - **Backend (`pip-audit -r requirements.txt`): 16 findings in 2 packages.**
    - `starlette 0.46.2` (pulled in by `fastapi==0.115.*`) has 8 unique advisories: CVE-2025-54121 (multipart rollover), CVE-2025-62727 (Range header DoS in `FileResponse`), CVE-2026-48710 / CVE-2026-54282 (`request.url` host/path reconstruction), CVE-2026-48817 (`HTTPEndpoint` method lookup), CVE-2026-48818 (Windows `StaticFiles` UNC paths) and CVE-2026-54283 (urlencoded form limits). **None are reachable here:** the app has no form or multipart parsing, `UploadFile`, `StaticFiles`, `FileResponse`, `HTTPEndpoint` or use of `request.url`.
    - `pytest 8.4.2` (CVE-2025-71176, local `/tmp` issue) is test-only.
    - The image's `pip 25.0.1` also has advisories (build-time only).
  - **Frontend (`npm audit --omit=dev`): 2 moderate** in `react-router` / `react-router-dom 6.30.6`.
    - The open redirect via a backslash in `<Link>`/`useNavigate` is **not reachable**: every `navigate()`/`<Navigate>` target is a hard-coded path or a server-issued UUID, never user input.
    - The SSR hydration issue doesn't apply to a client-only SPA.
  - **Frontend dev dependencies** (`npm audit`, all): 15 (2 critical, 6 high, 7 moderate) in vitest/tinypool, braces, esbuild and postcss-selector-parser. These are build and test tools only and not shipped to users. One note: the esbuild dev-server advisory matters a little because `npm run dev` binds `0.0.0.0`, so use it on trusted networks only.
- **How it could be abused:** Not with the current code. The risk is that a future change (e.g. adding file uploads) quietly makes one of these reachable.
- **Fix:**
  - Bump FastAPI to a release that allows Starlette ≥ 1.3.1 and re-run tests. Note that `fastapi==0.115.*` pins starlette < 0.47, so this is a FastAPI upgrade, not a starlette pin.
  - Plan `react-router-dom` 7.x when convenient (it's a breaking change).
  - Bump vitest/vite in a separate PR.
  - Upgrade pip in the Dockerfile (`pip install --upgrade pip`).
  - Add `pip-audit` and `npm audit --omit=dev --audit-level=high` steps to CI.
- **Owner:** devops (CI + Dockerfile); backend-dev (FastAPI bump); frontend-dev (router/vitest bumps)
- **Status:** open

### SEC-012 — Password policy: no upper bound, bcrypt silently truncates after 72 bytes
- **Severity:** low
- **Where:** `backend/app/schemas/auth.py:27, 32`; `requirements.txt:21` (`bcrypt==4.0.1` with unmaintained `passlib 1.7.4`)
- **What's wrong:**
  - The 8-character minimum is fine; it matches NIST's baseline.
  - There is no maximum. bcrypt only uses the first 72 bytes, so two long passwords that share their first 72 bytes are treated as equal.
  - There is no check against common passwords (e.g. `password1`).
  - passlib is unmaintained and is the reason bcrypt is pinned to an old version.
- **How it could be abused:** Marginal. Mostly users choosing `12345678`.
- **Fix:**
  - Add `max_length=128` (SEC-006) and reject passwords over 72 UTF-8 bytes with a clear message.
  - Optionally block a small list of the most common passwords.
  - Later, replace passlib with direct `bcrypt` calls (`bcrypt.hashpw` / `bcrypt.checkpw`). Existing `$2b$` hashes stay compatible.
- **Owner:** backend-dev
- **Status:** open

### SEC-013 — No way for a user to delete their account (and journal)
- **Severity:** low
- **Where:** `docs/api-contract.yaml` (no `DELETE /auth/me`); the DB side is ready (`journal_entries.user_id … ON DELETE CASCADE`, `0002_journal_entries.py:41`, and likewise goals → check-ins/milestones/snapshots, category_weights)
- **What's wrong:** The cascade is correct: deleting a user row removes all their journal entries and goals. But users have no endpoint or button to do it. For a journaling app, "delete everything about me" is an expected privacy right.
- **Fix:** Propose `DELETE /api/v1/auth/me`, requiring the current password in the body. It would `db.delete(current_user)` and let the cascade do the rest, plus add a Settings → "Delete account" danger zone. This is an API change, so it needs Aayush's approval.
- **Owner:** orchestrator (contract) → backend-dev + frontend-dev
- **Status:** open

### SEC-014 — Seed script creates demo accounts with known passwords; deploy doc suggests seeding Neon
- **Severity:** low
- **Where:** `backend/db/seed.py:219, 500` (well-known demo passwords), `docs/deploy.md` section 2 ("If you want starter data in the deployed database, run the seed script…")
- **What's wrong:** If the seed was, or ever is, run against Neon, the production database contains accounts whose email and password are public in this repo.
- **How it could be abused:** Anyone can log into those demo accounts on the live site. They only see demo data, but it's a foothold, and confusing if real data ever ends up there.
- **Fix:**
  - Check Neon now: `SELECT email FROM users WHERE email ILIKE '%@example.com' OR email ILIKE '%demo%';`. If any exist, delete them or change their passwords.
  - Change `deploy.md` to say "never seed production".
  - Make `seed.py` refuse to run when `DATABASE_URL` contains `neon.tech` unless `--force` is given.
- **Owner:** devops (doc + check Neon); db-architect (seed guard)
- **Status:** open

### SEC-015 — Local dev stack exposes Postgres on all interfaces with default credentials
- **Severity:** low
- **Where:** `docker-compose.yml:14-15` (`"5432:5432"`, `lifetracker/lifetracker`), `:35` (`"8000:8000"`)
- **What's wrong:** Docker publishes these ports on every network interface, so on café or college Wi-Fi other devices may reach your dev database with a password that is public in this repo. This affects dev only, not production.
- **Fix:** Bind to localhost: `"127.0.0.1:5432:5432"`, `"127.0.0.1:8000:8000"` (and `"127.0.0.1:5173:5173"` for the frontend).
- **Owner:** devops
- **Status:** open

---

## Journal privacy notes (checklist section 3)

- **Logs / errors / analytics / snapshot job:**
  - Journal content is never logged on purpose. There are no `console.log` calls in `frontend/src` and no logging in backend journal code.
  - Error messages never echo the body. Validation errors echo the *tag* value only.
  - There are no analytics scripts.
  - `/internal/daily-snapshot` only reads `goals` and doesn't touch `journal_entries`.
  - The one leak path is SEC-003 (SQL parameters in exception logs). Fix that.
- **Export:**
  - It is scoped by `JournalEntry.user_id == current_user.id` everywhere, including the goals and weekly-scores sections. User B's export over 2000-2030 had 0 entries and none of A's text (verified).
  - `from`/`to`/`tz_offset` can only narrow or shift *your own* range (`tz_offset` is bounded to −720…840). Extreme dates only cause a 500 (SEC-008).
  - The filename is built from dates only, so there is no header injection.
- **Search:** `q` is passed as a bound `ILIKE` parameter, with `%`, `_` and `\` escaped (`journal_service.py:149-179`). The probe `%' OR 1=1 --` returned 0 results with a 200, and a bare `%` matched nothing.
- **Encryption at rest:** Neon encrypts storage at rest (AES-256) and in transit (`sslmode=require`, `channel_binding=require` in the documented URL). **This is enough for v1.**
  - Field-level encryption of `journal_entries.body`/`title` (e.g. a Fernet key in env vars) would also protect against a leaked DB dump or Neon console access.
  - The cost is that server-side `ILIKE` search stops working: you'd need client-side search or a search index.
  - **Recommendation:** consider it once there are real users other than Aayush, or before adding any AI connector. Not required now.
- **Account deletion:** the DB cascade is correct (`ON DELETE CASCADE` from `users`), but there is no endpoint to trigger it (SEC-013).

## Future AI connector (MCP) requirements (checklist section 8)

No MCP or AI-connector code exists yet. The only "for AI" feature is the manual Markdown export, which the user downloads themselves, so that is fine. Any future connector must meet all of these:

1. **Per-user OAuth 2.1 (with PKCE)**, issuing tokens bound to one user. Never reuse the app's login JWT, and never use a shared server-wide API key.
2. **Read-only scopes by default**, split by data type, e.g. `goals:read`, `scores:read`, `journal:read`. Any write scope is a separate, explicit opt-in.
3. **Journal access is off by default.** The user must explicitly tick "allow AI to read my journal", and can narrow it to a date range or tags.
4. **Short-lived access tokens + revocable refresh tokens**, stored hashed in the DB, with a "Connected apps → revoke" page in Settings.
5. **Every tool query is filtered by the token's `user_id`** through the same `get_owned_*` helpers, with cross-user 404 tests just like today's.
6. **Audit log** of connector access (what was read, when, by which client). Log metadata only, never content.
7. **Rate limits** per token, and response size caps.
8. **Prompt-injection awareness:** treat journal text returned to the AI as untrusted data, and never let it trigger write tools without user confirmation.
9. A security review before it ships.

---

## Checklist

| # | Item | Result | Notes |
|---|---|---|---|
| 1 | Passwords hashed with bcrypt | pass | passlib bcrypt (`security.py:24`) |
| 1 | `password_hash` never returned | pass | `UserOut` excludes it; verified on register response |
| 1 | JWT secret from env, long & random | **fail** | from env, but falls back to public default (SEC-002) |
| 1 | JWT algorithm pinned, no `none` | pass | `algorithms=["HS256"]`; `alg=none` token → 401 (verified) |
| 1 | JWT expiry set and enforced | pass | `exp` set (60 min), PyJWT enforces it; expired → 401 → frontend logs out |
| 1 | Token storage / XSS risk | pass (accepted risk) | `localStorage`; no HTML sinks found (SEC-009) |
| 1 | Login error doesn't enumerate | pass | identical 401 body (verified) |
| 1 | Register / timing enumeration | **fail** | 409 on existing email; 11 ms vs 356 ms timing (SEC-005) |
| 1 | Password policy | pass (low note) | min 8 OK; no max / 72-byte truncation (SEC-012) |
| 1 | Brute-force protection | **fail** | none (SEC-001) |
| 1 | Logout / expired token | pass (low note) | client-side logout, 60-min TTL, no revocation (SEC-009) |
| 2 | Goals isolated (get/patch/delete/list) | pass | B → 404 on all; list empty (dynamic) |
| 2 | Milestones isolated | pass | create/patch/delete on A's → 404 (dynamic) |
| 2 | Check-ins isolated | pass | list/create/delete on A's → 404 (dynamic) |
| 2 | Score / score-history isolated | pass | 404 (dynamic) |
| 2 | Dashboard / weekly review isolated | pass | no A data (dynamic) |
| 2 | Settings isolated | pass | queries filter on `user_id`; existing test `test_settings.py:74` |
| 2 | Journal get/patch/delete isolated | pass | 404 and A's entry unchanged (dynamic) |
| 2 | Journal list/search/tag/stats/export isolated | pass | B sees 0 (dynamic) |
| 2 | Other users' resources return 404 (not 403) | pass | `resources.py`, `get_owned_entry` |
| 2 | Mass assignment | pass | `user_id`/`id`/`created_at`/`current_value`/`status`/`type`/`start_date`/`goal_id`/`email`/`password_hash` all ignored (dynamic) |
| 3 | Journal content not in logs/errors/analytics/snapshot | **fail** | only via SQL params in exception logs (SEC-003) |
| 3 | Export only caller's entries; date filters safe | pass (low note) | verified; extreme dates → 500 (SEC-008) |
| 3 | Encryption at rest | pass | Neon default is enough for v1; field-level is optional later |
| 3 | Account deletion cascades journal | pass (DB) / **fail** (feature) | cascade OK; no delete endpoint (SEC-013) |
| 4 | No raw SQL / f-string SQL | pass | ORM only; `text()` only in server defaults/index DDL |
| 4 | Journal search parameterised | pass | bound `ILIKE` with escaping; SQLi probe harmless (dynamic) |
| 4 | Max lengths on text fields | **fail** | journal OK; auth/goals/milestones/check-ins not (SEC-006) |
| 4 | Numeric ranges | **fail** | mood/effort/limit/tz OK; target_value/weight/value unbounded (SEC-006) |
| 4 | No `dangerouslySetInnerHTML` / unsafe Markdown | pass | none in `frontend/src` |
| 5 | `.env` gitignored, never committed | pass | only `.env.example` files in history |
| 5 | No secrets in repo / git history | pass | only placeholders and local dev creds (`lifetracker`, `ci-test-secret`, `dev-only-change-me`); nothing to rotate |
| 5 | CRON_SECRET constant-time + rejects missing/wrong | **fail** (low) | rejects correctly (verified) but uses `!=` (SEC-007) |
| 5 | CORS: no wildcard with credentials | pass | explicit origin list; evil-origin preflight got no ACAO (dynamic); prod is same-origin |
| 5 | Debug off / no stack traces to client | pass | generic 500 body; `/docs` public (SEC-010, low) |
| 6 | Backend `pip-audit` | pass (low note) | starlette advisories not reachable (SEC-011) |
| 6 | Frontend `npm audit --omit=dev` | pass (low note) | 2 moderate react-router, not reachable (SEC-011) |
| 7 | Content-Security-Policy | **fail** | SEC-004 |
| 7 | X-Content-Type-Options | **fail** | SEC-004 |
| 7 | Referrer-Policy | **fail** | SEC-004 |
| 7 | X-Frame-Options / frame-ancestors | **fail** | SEC-004 |
| 7 | Strict-Transport-Security | n/a (unverified) | Vercel likely adds it by default; set it explicitly (SEC-004) |
| 8 | MCP / AI connector | n/a | not built; requirements listed above |

## How the dynamic tests were run

- Stack: `docker compose up -d db backend`, then `docker compose exec -T backend alembic upgrade head`.
- Isolation, mass-assignment and auth checks: a throwaway Python script (httpx), piped into `docker compose exec -T backend python -`. It creates two fresh users (A and B) per run, and B attacks A's resources by ID. Result: **37/37 checks passed**.
- Dependencies: `docker compose exec backend sh -c "pip install pip-audit && pip-audit -r requirements.txt"` and `cd frontend && npm audit --omit=dev`.
- The live Vercel site and Neon were not touched.
