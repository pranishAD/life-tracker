# Bihan security review

## Re-check 2026-10-20 (branch `security/review-1`, commit 84ceec1 + uncommitted fixes)

**Scope:** every change in `git diff main`: backend config/auth/routers/schemas, `db/session.py`, `db/migrations/env.py`, `db/seed.py`, the new `schemas/common.py`, both new test files, `vercel.json`, `docker-compose.yml`, `Dockerfile`, CI, `.env.example`, `docs/deploy.md`, `docs/api-contract.yaml`, and the frontend client, forms and `lib/limits.ts`.

**Method:**
- Static review of the diff.
- Dynamic tests against the **local Docker stack only** (http://localhost:8000). I confirmed that `DATABASE_URL` points at `@db`, not Neon, and that `VERCEL` is unset in the container.
- Backend `pytest` was run against `life_tracker_test`, plus frontend `vitest`, `pip-audit` (with the CI ignore flags, and without them) and `npm audit --omit=dev`.
- The live site and Neon were **not** touched.

### Summary after re-check

| Severity | Total | Fixed (verified locally) | Fixed in code, needs live verification | Accepted risk | Open |
|---|---|---|---|---|---|
| Critical | 0 | 0 | 0 | 0 | 0 |
| High | 2 | 1 (SEC-002) | 1 (SEC-001, WAF rule) | 0 | 0 |
| Medium | 4 | 2 (SEC-003, SEC-006) + SEC-005 login timing | 1 (SEC-004 headers) | SEC-005 register 409 | 0 |
| Low | 10 (9 + 1 new) | 6 (SEC-007, 008, 010, 012, 015, 016) | 1 (SEC-014: guard verified, Neon check pending) | 1 (SEC-009) | 2 (SEC-011 and SEC-013, both deferred) |

**Verdict: OK to ship.** There are no open critical, high or medium findings in the code. Before inviting anyone beyond yourself, finish the four post-deploy steps below. Those are what turn "fixed in code" into "verified":
1. **SEC-001:** publish the Vercel WAF rule (deploy.md 6a) and run its 12-request check. Expect 429 from around request 11.
2. **SEC-002:** confirm `JWT_SECRET` and `CRON_SECRET` exist for Production **and** Preview (deploy.md 6b). If the secret is weak, the deploy now crashes loudly instead of running insecurely.
3. **SEC-004:** run the two `curl -sI` checks in deploy.md 6c (`/` and `/api/v1/health`), then do a day of Report-Only console watching.
4. **SEC-014:** run the demo-user SELECT once in the Neon SQL editor.

**Follow-up (same day):** SEC-016 (API's own security and cache headers) and the milestone `due_date` bound are both **fixed and verified locally**; see SEC-016 and SEC-008.

**No regressions:** the isolation script again passed **37/37**. User B gets 404 on every read, edit or delete of user A's goals, milestones, check-ins, scores and journal; B's lists, search, stats, export, dashboard and weekly review contain none of A's data; mass assignment is ignored; and `alg=none` and garbage tokens are rejected.

### Old 500 cases: all 422 now (dynamic)

| Probe | Before | Now |
|---|---|---|
| register name 500 chars / PATCH /auth/me name 500 | 500 | 422 |
| goal title 300 / milestone title 300 | 500 | 422 |
| goal `target_value` 1e20 / goal `weight` 1e20 / check-in `value` 1e20 / category weight 1e20 | 500 | 422 |
| `target_value: NaN` (raw JSON) | not tested | 422 |
| goal description 1 MB / check-in note 1 MB | 201 (stored) | 422 |
| `/journal` and `/journal/export` `to=9999-12-31`, export `from=0001-01-01` | 500 | 422 |
| `/reviews/weekly?week_start=9999-12-27`, goal `deadline`, check-in `logged_for` 9999-12-31 | not tested | 422 |
| register password 73 bytes / login password 129 chars | 201 / 401 | 422 / 422 |

The login timing gap has closed: median **366 ms** for an unknown email vs **399 ms** for a known email with a wrong password (was 11 vs 356 ms). Both return an identical 401 body. The cron endpoint gives 401 with no header and 401 with a wrong header.

### Notes on the new code

- **CSP without `'unsafe-inline'` in `style-src`: low Report-Only noise expected.**
  - The app does use many React `style={{...}}` props (AppShell, ScoreRing, ProgressBar, Card, recharts). But React applies them through the CSSOM (`element.style`), and CSP does **not** govern that. CSP only checks `style="..."` attributes parsed from HTML, `setAttribute('style', ...)`, and `<style>` elements.
  - I checked the production build (`frontend/dist`): `index.html` has no inline `<style>`, `style=` or `<script>`; the bundle has no `setAttribute("style"...)`, `cssText` writes, `eval` or `new Function`; the CSS has no `url(data:...)`; and nothing uses `data:` image URIs.
  - Dropping `data: blob:` from `img-src` is fine too. lucide icons are inline SVG elements, and the journal export downloads a `blob:` URL via `<a download>`, which is a navigation, not an image load.
  - Expected noise is limited to the Vercel toolbar on Preview deployments and browser extensions, as deploy.md 6c already says. One real violation would appear if `VITE_API_URL` were accidentally left at its `http://localhost:8000` fallback in a production build (`connect-src 'self'`). That would be a useful catch.
- **Top-level `headers` under Vercel Services: unverified, can't be settled statically.**
  - Vercel's Services docs show per-service `headers`, but they don't say whether the project-level block applies to every service's responses.
  - The backend sets no security headers of its own. Local `/api/v1/health` returns only `date`, `server`, `content-length` and `content-type`. So if the top-level block doesn't reach the backend service, API responses would have none.
  - deploy.md 6c already has the right post-deploy `curl` check and fallback. SEC-016 (now fixed) adds a backend middleware, so the API has `nosniff`, `Referrer-Policy` and `Cache-Control: no-store` either way. The frontend-only headers (CSP, XFO, HSTS) still depend on the Vercel block.
- **Frontend client changes: good.**
  - `readErrorBody` only trusts a body if it matches the contract shape with string `code`/`message`. Otherwise it uses a fixed message, so firewall HTML is never shown.
  - A 429 doesn't fire the logout event.
  - Server messages are rendered as React text (toasts and banners), which is auto-escaped.
  - The new `maxLength`, number and 72-byte checks mirror the backend. They're UX only; the backend is the real control, and I verified it.
- **CI `pip-audit` ignores** are by advisory ID, so any *new* advisory still fails the build. The comment block explains each ID and says to remove them on the FastAPI bump. That's acceptable. Re-check reachability whenever form or file-upload handling is added (`python-multipart` is already installed).
- **Config validator** also rejects whitespace-only and case-variant placeholders, and `hide_input_in_errors=True` keeps the secret out of the error. The seed guard reads the same `os.environ["DATABASE_URL"]` that `db/session.py` uses, so the two can't disagree.
- **No secrets** in the branch diff (no Neon URLs, `npg_` passwords or real-looking `JWT_SECRET`/`CRON_SECRET` values). `.env` is still gitignored.

---

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

**(Superseded by the re-check above.)** **Original verdict: fix first (the 2 highs) before inviting anyone beyond yourself. There is nothing critical.**

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
- **Status:** **fixed in code — needs live verification after deploy.** The WAF rule lives only in the Vercel dashboard. Per-account lockout is an **accepted risk** (Aayush, 2026-10-20: the WAF rule is enough for v1).
- **Re-check 2026-10-20:**
  - `docs/deploy.md` section 6a documents one rule: path starts with `/api/v1/auth/` AND method `POST`, fixed window 60 s, 10 requests, keyed by IP, action 429. That covers both login and register, and it fits the Hobby plan's one-rule limit.
  - The frontend now handles a bare firewall 429 (HTML, plain-text or empty body). It shows "Too many attempts…", never renders the raw body, and does **not** log the user out (`client.ts` `readErrorBody`/`throwApiError`, plus tests in `client.test.ts` and `AuthPage.test.tsx`; all 115 frontend tests pass).
  - Locally there is still no limit (15 bad logins → all 401). That is expected, because the WAF sits in front of Vercel only.
  - **Still to do after deploy (Aayush/devops):** publish the rule (not just save it), then run the 12-request check in deploy.md 6a against your own account. Expect 429 from around request 11.

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
- **Status:** **fixed (verified locally).**
- **Re-check 2026-10-20:**
  - `config.py` now has a `model_validator`. When `VERCEL=1`, it refuses an empty secret, the dev default, a list of known placeholders (compared case- and whitespace-insensitively), or anything under 32 characters.
  - `hide_input_in_errors=True` means the error never echoes the secret.
  - `tests/test_config.py` checks all of this, including a fresh-interpreter `import app.main` that crashes with `VERCEL=1` and no secret, and whose stderr doesn't contain the default. All pass.
  - Remaining one-time action (devops/Aayush): confirm `JWT_SECRET` and `CRON_SECRET` exist for **Production and Preview** in Vercel (deploy.md 6b).

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
- **Status:** **fixed (verified locally).**
- **Re-check 2026-10-20:**
  - `db/session.py` and `db/migrations/env.py` now pass `hide_parameters=True`, and there is no other `create_engine` in the app.
  - I forced a `DataError` through the app engine (500-char journal-like value inserted into `users.name` on the local DB, rolled back) and logged it with `logger.exception` exactly like `errors.py` does. The logged text contained neither the value nor the fake hash, only `[SQL parameters hidden due to hide_parameters=True]`. A control engine with default settings did leak both.
  - After all the re-check probes, the backend container log has 0 `parameters:` / `Traceback` lines, because every former 500 is now a 422.

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
- **Status:** **fixed in code — needs live verification after deploy.**
- **Re-check 2026-10-20:** see the CSP and Vercel Services notes under "Re-check 2026-10-20" at the top.
  - The block in `vercel.json` matches the recommendation, with three changes: the CSP is `Content-Security-Policy-Report-Only` (Aayush's decision), `'unsafe-inline'` was dropped from `style-src`, and `data: blob:` were dropped from `img-src`. I checked the built bundle and none of these should cause Report-Only noise.
  - `X-Frame-Options: DENY` is what actually blocks framing while the CSP is report-only, because browsers ignore `frame-ancestors` in Report-Only. deploy.md 6c says this correctly.
  - Still unverified: whether the **top-level** `headers` block reaches responses from **both** services under Vercel Services. Run the two `curl -sI` commands in deploy.md 6c after deploy. If `/api/v1/health` lacks the headers, add a `headers` block to the backend service config or apply SEC-016.
  - No reporting endpoint is configured (`report-to`/`report-uri`), so violations only appear in the console of whoever is browsing. That's fine for a one-person rollout; just follow the deploy.md 6c checklist yourself before switching to enforcing.

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
- **Status:** **login timing: fixed (verified locally). Register 409: accepted risk** (Aayush, 2026-10-20: good UX, and bulk checking is slowed by the WAF rule).
- **Re-check 2026-10-20:**
  - `verify_password_or_dummy` now runs bcrypt against a cached dummy hash when the email is unknown.
  - Locally, the median of 10 tries was **366 ms** for an unknown email and **399 ms** for an existing email with a wrong password (before: 11 ms vs 356 ms). Both return the identical 401 body.
  - Tiny residual: the dummy hash is computed lazily, so the *first* unknown-email login on each cold instance costs one extra bcrypt. That's noise-level, and acceptable.

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
- **Status:** **fixed (verified locally).**
- **Re-check 2026-10-20:**
  - Every old 500/stored case now returns a clean 422 in the contract error shape: 500-char name (register and PATCH /auth/me), 300-char goal and milestone titles, `target_value` 1e20, goal `weight` 1e20, check-in `value` 1e20, category weight 1e20, `NaN`/`Infinity`, and 1 MB description and note.
  - Limits match the DB columns, and there's a rounding guard for `Numeric(12,2)`/`Numeric(5,2)`.
  - The contract (`api-contract.yaml`) and the frontend forms (`lib/limits.ts`) carry the same numbers.
  - `tests/test_security_limits.py`: 44 tests including config, all pass. The full backend suite: 306 passed.

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
- **Status:** **fixed (verified locally).**
- **Re-check 2026-10-20:**
  - `internal.py` now fails closed on an empty `CRON_SECRET` and compares with `secrets.compare_digest` on bytes.
  - Dynamic check: no header → 401, wrong bearer → 401.
  - The unit test sets a real secret and confirms that wrong and missing headers get 401, the correct one gets 200, and `compare_digest` is called each time.

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
- **Status:** **fixed (verified locally).**
- **Re-check 2026-10-20:**
  - These now all return 422 with "Dates must be between 1970-01-01 and 2100-12-31.": `/journal` and `/journal/export` with `to=9999-12-31` or `from=0001-01-01`, `/reviews/weekly?week_start=9999-12-27`, goal `start_date`/`deadline`, and check-in `logged_for`.
  - Milestone `due_date` now uses `BoundedDate` too (follow-up). Dynamic check: create with `9999-12-31` → 422, `1969-12-31` → 422, `2100-12-31` → 201, and PATCH with `9999-12-31` → 422. The `test_milestone_due_date_bounds` test passes.

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
- **Status:** **accepted risk** (v1). Re-check: still no `dangerouslySetInnerHTML`, `innerHTML` or `eval` in `frontend/src`. The only `innerHTML` in the built bundle is React DOM's own internals. Keep the CSP moving towards enforcing.

### SEC-010 — API docs (`/docs`, `/openapi.json`) are public
- **Severity:** low
- **Where:** `backend/app/main.py:39` (`FastAPI(title=...)` with default docs URLs)
- **What's wrong:** Locally, `/docs` and `/openapi.json` return 200. In production the rewrite only routes `/api/*` to the backend, so these root paths probably hit the frontend instead. That is unverified, and the app would expose them if the routing ever changes. It's a free map of every endpoint for an attacker. The contract is in the public repo anyway, so the impact is minimal.
- **Fix:** `FastAPI(title="Life Tracker API", docs_url=None if os.environ.get("VERCEL") else "/docs", redoc_url=None, openapi_url=None if os.environ.get("VERCEL") else "/openapi.json")`
- **Owner:** backend-dev
- **Status:** **fixed (verified locally).** Re-check: `create_app()` sets `docs_url`, `redoc_url` and `openapi_url` to `None` when `VERCEL=1`. `test_docs_disabled_when_vercel` confirms 404 on `/docs`, `/redoc` and `/openapi.json` with a 200 on `/api/v1/health`. Locally (no `VERCEL`) they stay on, by design.

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
- **Status:** **open (deferred).** The partial fixes are done; the remaining bumps are deferred on purpose (breaking-change upgrades, none of the advisories reachable).
- **Re-check 2026-10-20:**
  - The backend image now has `pip 26.2.1`.
  - CI runs `pip-audit` with 8 documented `--ignore-vuln` IDs (7 starlette, 1 pytest). Locally with those flags: "No known vulnerabilities found, 16 ignored", exit 0. Without the flags it's the same 16 findings as before, in starlette 0.46.2 and pytest 8.4.2. Re-checked reachability: there is still no `UploadFile`, `Form(`, `FileResponse`, `StaticFiles`, `request.url` or `HTTPEndpoint` in `backend/app`. `python-multipart` is installed but unused.
  - CI runs `npm audit --omit=dev --audit-level=high`, which exits 0. The 2 moderate react-router advisories are still not reachable: every `navigate`/`<Navigate>` target is a constant or a server UUID, and `?tag=`/`?q=` are only used as filter text.
  - Deferred: the FastAPI bump (to clear the starlette ignores), react-router 7, and vitest/vite.

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
- **Status:** **fixed (verified locally).** Re-check: register enforces 8-128 characters **and** at most 72 UTF-8 bytes (a 73-byte password gets 422 with a clear message). Login caps at 128 (129 → 422). The frontend blocks over-72-byte passwords before calling the API. Deferred, nice-to-have: a common-password blocklist, and replacing passlib with direct `bcrypt`.

### SEC-013 — No way for a user to delete their account (and journal)
- **Severity:** low
- **Where:** `docs/api-contract.yaml` (no `DELETE /auth/me`); the DB side is ready (`journal_entries.user_id … ON DELETE CASCADE`, `0002_journal_entries.py:41`, and likewise goals → check-ins/milestones/snapshots, category_weights)
- **What's wrong:** The cascade is correct: deleting a user row removes all their journal entries and goals. But users have no endpoint or button to do it. For a journaling app, "delete everything about me" is an expected privacy right.
- **Fix:** Propose `DELETE /api/v1/auth/me`, requiring the current password in the body. It would `db.delete(current_user)` and let the cascade do the rest, plus add a Settings → "Delete account" danger zone. This is an API change, so it needs Aayush's approval.
- **Owner:** orchestrator (contract) → backend-dev + frontend-dev
- **Status:** **open (deferred).** This is an API change and needs Aayush's approval of `DELETE /api/v1/auth/me`. The DB cascade is ready.

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
- **Status:** **fixed in code — needs live verification** (one manual Neon check).
- **Re-check 2026-10-20:**
  - `seed.py` now refuses to run when `DATABASE_URL` contains `neon.tech` or `VERCEL=1`, unless `--force` is passed. Verified with a fake `*.neon.tech.invalid` URL: it printed the refusal and exited 2 without connecting.
  - `deploy.md` now says "never seed production" and gives the SELECT/DELETE for the demo users.
  - **Still to do (Aayush):** run that SELECT once in the Neon SQL editor.

### SEC-015 — Local dev stack exposes Postgres on all interfaces with default credentials
- **Severity:** low
- **Where:** `docker-compose.yml:14-15` (`"5432:5432"`, `lifetracker/lifetracker`), `:35` (`"8000:8000"`)
- **What's wrong:** Docker publishes these ports on every network interface, so on café or college Wi-Fi other devices may reach your dev database with a password that is public in this repo. This affects dev only, not production.
- **Fix:** Bind to localhost: `"127.0.0.1:5432:5432"`, `"127.0.0.1:8000:8000"` (and `"127.0.0.1:5173:5173"` for the frontend).
- **Owner:** devops
- **Status:** **fixed (verified locally).** Re-check: `docker compose ps` shows `127.0.0.1:5432`, `127.0.0.1:8000` and `127.0.0.1:5173`.

### SEC-016 — The API sets no security or cache headers of its own (new, re-check 2026-10-20)
- **Severity:** low
- **Where:** `backend/app/main.py` (`create_app`). Local `GET /api/v1/health` response headers: only `date`, `server`, `content-length` and `content-type`.
- **What's wrong:**
  - All security headers come from the top-level `vercel.json` block. It's unconfirmed whether that block reaches the backend service under Vercel Services (see SEC-004).
  - Separately, responses carrying private data (journal entries, the export download, goals) have no `Cache-Control: no-store`, so the browser is allowed to keep copies in its disk cache. Today that's mostly theoretical: FastAPI sends no `Last-Modified`/`ETag` and Vercel doesn't edge-cache function responses without explicit cache headers. But nothing forbids it.
- **How it could be abused:** On a shared or borrowed computer, someone could read cached journal JSON or the exported Markdown from the browser cache after you log out. And if the top-level headers don't apply to `/api`, API responses would be missing `nosniff` (which matters for the export download).
- **Fix:** A small middleware in `create_app()` (about 8 lines), applied to every API response:
  ```python
  @app.middleware("http")
  async def _security_headers(request, call_next):
      response = await call_next(request)
      response.headers.setdefault("Cache-Control", "no-store")
      response.headers.setdefault("X-Content-Type-Options", "nosniff")
      response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
      return response
  ```
  `setdefault` lets the Vercel block or a route override these. Add a test that `/api/v1/health` and `/api/v1/journal` carry them.
- **Owner:** backend-dev
- **Status:** **fixed (verified locally).**
- **Follow-up re-check 2026-10-20:**
  - `main.py` has an `@app.middleware("http")` that applies `SECURITY_HEADERS` (from `errors.py`) with `setdefault`. The 500 handler sets the same dict, because it runs outside the middleware.
  - Dynamic check: `Cache-Control: no-store`, `X-Content-Type-Options: nosniff` and `Referrer-Policy: strict-origin-when-cross-origin` were present on every response I tried: `/health` (GET and HEAD), the authenticated `/journal` JSON, `/journal/export` (its `Content-Disposition` is kept), a 401, a 422, and the CORS preflight.
  - The 500 path and "a header set by a route is not overwritten" are covered by `tests/test_security_headers.py`, and they pass.

---

## Journal privacy notes (checklist section 3)

- **Logs / errors / analytics / snapshot job:**
  - Journal content is never logged on purpose. There are no `console.log` calls in `frontend/src` and no logging in backend journal code.
  - Error messages never echo the body. Validation errors echo the *tag* value only.
  - There are no analytics scripts.
  - `/internal/daily-snapshot` only reads `goals` and doesn't touch `journal_entries`.
  - The one leak path was SEC-003 (SQL parameters in exception logs). It is **fixed** (re-check 2026-10-20).
- **Export:**
  - It is scoped by `JournalEntry.user_id == current_user.id` everywhere, including the goals and weekly-scores sections. User B's export over 2000-2030 had 0 entries and none of A's text (verified).
  - `from`/`to`/`tz_offset` can only narrow or shift *your own* range (`tz_offset` is bounded to −720…840). Out-of-range dates now get a 422 (SEC-008, fixed).
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

## Checklist (updated at re-check 2026-10-20)

| # | Item | Result | Notes |
|---|---|---|---|
| 1 | Passwords hashed with bcrypt | pass | passlib bcrypt (`security.py`) |
| 1 | `password_hash` never returned | pass | `UserOut` excludes it; re-verified on register response |
| 1 | JWT secret from env, long & random | pass (needs live confirmation) | fails closed on Vercel if missing/placeholder/<32 chars (SEC-002, tests pass); confirm Vercel env vars after deploy |
| 1 | JWT algorithm pinned, no `none` | pass | `algorithms=["HS256"]`; `alg=none` → 401 (re-verified) |
| 1 | JWT expiry set and enforced | pass | `exp` 60 min, enforced by PyJWT |
| 1 | Token storage / XSS risk | pass (accepted risk) | `localStorage`; still no HTML sinks (SEC-009) |
| 1 | Login error doesn't enumerate | pass | identical 401 body (re-verified) |
| 1 | Register / timing enumeration | pass (accepted risk) | timing fixed: 366 vs 399 ms; register 409 accepted by Aayush (SEC-005) |
| 1 | Password policy | pass | 8-128 chars, ≤72 UTF-8 bytes (SEC-012) |
| 1 | Brute-force protection | pass (needs live verification) | Vercel WAF rule 10/min/IP on `POST /api/v1/auth/*` (dashboard only); frontend handles 429 (SEC-001) |
| 1 | Logout / expired token | pass (low note) | client-side logout, 60-min TTL (SEC-009) |
| 2 | Goals isolated (get/patch/delete/list) | pass | B → 404 on all (re-run, dynamic) |
| 2 | Milestones isolated | pass | 404 (re-run, dynamic) |
| 2 | Check-ins isolated | pass | 404 (re-run, dynamic) |
| 2 | Score / score-history isolated | pass | 404 (re-run, dynamic) |
| 2 | Dashboard / weekly review isolated | pass | no A data (re-run, dynamic) |
| 2 | Settings isolated | pass | filters on `user_id`; `test_settings.py` passes |
| 2 | Journal get/patch/delete isolated | pass | 404, A's entry unchanged (re-run, dynamic) |
| 2 | Journal list/search/tag/stats/export isolated | pass | B sees 0 (re-run, dynamic) |
| 2 | Other users' resources return 404 (not 403) | pass | unchanged |
| 2 | Mass assignment | pass | all ignored (re-run, dynamic) |
| 3 | Journal content not in logs/errors/analytics/snapshot | pass | `hide_parameters=True` verified with a forced DB error (SEC-003) |
| 3 | Export only caller's entries; date filters safe | pass | out-of-range dates → 422, including milestone `due_date` (SEC-008) |
| 3 | Encryption at rest | pass | Neon default enough for v1 |
| 3 | Account deletion cascades journal | pass (DB) / open (feature) | cascade OK; endpoint deferred pending approval (SEC-013) |
| 4 | No raw SQL / f-string SQL | pass | ORM only |
| 4 | Journal search parameterised | pass | SQLi probe harmless (re-run) |
| 4 | Max lengths on text fields | pass | all text fields bounded and match DB columns (SEC-006) |
| 4 | Numeric ranges | pass | bounded, no NaN/Inf, rounding-safe (SEC-006) |
| 4 | No `dangerouslySetInnerHTML` / unsafe Markdown | pass | none in `frontend/src` |
| 5 | `.env` gitignored, never committed | pass | `git check-ignore .env` → `.gitignore:2` |
| 5 | No secrets in repo / git history | pass | branch diff scanned, nothing found |
| 5 | CRON_SECRET constant-time + rejects missing/wrong | pass | `secrets.compare_digest`, fail-closed (SEC-007) |
| 5 | CORS: no wildcard with credentials | pass | unchanged; evil-origin preflight → no ACAO (re-run) |
| 5 | Debug off / no stack traces to client | pass | `/docs`, `/redoc`, `/openapi.json` off on Vercel (SEC-010) |
| 6 | Backend `pip-audit` | pass (low note) | 0 with CI ignores; 16 known starlette/pytest, not reachable (SEC-011 deferred) |
| 6 | Frontend `npm audit --omit=dev` | pass (low note) | 2 moderate react-router, not reachable; `--audit-level=high` exits 0 |
| 7 | Content-Security-Policy | pass (Report-Only, needs live verification) | SEC-004; switch to enforcing after a clean day |
| 7 | X-Content-Type-Options | pass | API: set by the backend (SEC-016, verified); frontend: `vercel.json` (needs live verification) |
| 7 | Referrer-Policy | pass (needs live verification) | `vercel.json` |
| 7 | X-Frame-Options / frame-ancestors | pass (needs live verification) | `X-Frame-Options: DENY` enforces even while CSP is report-only |
| 7 | Strict-Transport-Security | pass (needs live verification) | set explicitly, 2 years + subdomains |
| 7 | Cache-Control on private API responses | pass | `no-store` on every API response, including errors (SEC-016, verified) |
| 8 | MCP / AI connector | n/a | not built; requirements listed above |
| – | Dev stack ports bound to localhost | pass | `127.0.0.1:` on 5432/8000/5173 (SEC-015) |
| – | Seed can't hit production by accident | pass (Neon check pending) | guard verified; run the SELECT in Neon once (SEC-014) |

## How the dynamic tests were run

- Stack: `docker compose up -d db backend`, then `docker compose exec -T backend alembic upgrade head`.
- Isolation, mass-assignment and auth checks: a throwaway Python script (httpx), piped into `docker compose exec -T backend python -`. It creates two fresh users (A and B) per run, and B attacks A's resources by ID. Result: **37/37 checks passed**.
- Dependencies: `docker compose exec backend sh -c "pip install pip-audit && pip-audit -r requirements.txt"` and `cd frontend && npm audit --omit=dev`.
- The live Vercel site and Neon were not touched.

### Re-check 2026-10-20 commands (local only)

- `docker compose ps`: all three ports are on `127.0.0.1`. The container's `DATABASE_URL` host is `db`, and `VERCEL` is unset.
- `docker compose exec -T backend python - < isolation_test.py` → **37/37 passed**, plus the INFO lines showing the old 500s are now 422.
- `docker compose exec -T backend python - < recheck.py`: timing (366 vs 399 ms), the 422 probes in the table at the top, and cron 401s.
- `docker compose exec -T backend python - < sec003b.py`: the app engine log shows `[SQL parameters hidden due to hide_parameters=True]` and no value/hash. The control engine leaks both.
- `docker compose exec -T -e TEST_DATABASE_URL=postgresql+psycopg2://lifetracker:lifetracker@db:5432/life_tracker_test backend python -m pytest -q` → **306 passed** (`tests/test_security_limits.py` + `tests/test_config.py`: 44 passed).
- `cd frontend && npx vitest run` → **115 passed** (14 files).
- `docker compose exec -T -e DATABASE_URL=postgresql+psycopg2://x:y@fake-host.neon.tech.invalid:5432/none backend python -m db.seed` → refusal message, exit 2.
- `pip-audit -r requirements.txt` with the 8 CI `--ignore-vuln` flags → "No known vulnerabilities found, 16 ignored". Without them, 16 findings (starlette 0.46.2, pytest 8.4.2).
- `cd frontend && npm audit --omit=dev` → 2 moderate (react-router). `--audit-level=high` exits 0.
- Follow-up: `curl -sI http://localhost:8000/api/v1/health` shows the 3 headers. `docker compose exec -T backend python - < sec016.py` shows the headers on auth JSON, the export, 401, 422 and the preflight, and returns 422 for milestone `due_date` 9999-12-31 / 1969-12-31 (201 for 2100-12-31). Full backend pytest: **316 passed**.
