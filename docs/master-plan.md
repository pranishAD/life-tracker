# Life Tracker — Master Plan (Source of Truth)

Every agent reads this file first. If something here conflicts with an agent's own idea, THIS FILE WINS. Only the orchestrator changes it, and only with Aayush's approval.

Owner / Product decision-maker: Aayush
Working name: Life Tracker (final name TBD)
Platform: Web app first (responsive, installable as PWA on phone). Native mobile app is out of scope for v1.

---

## 1. Vision

A website that tracks your progress across life areas (fitness, assignments/study, career, custom goals) and RATES it with a clear score, so you can see if you're improving, consistent, or slipping.

Core loop: Create goal -> Log progress (check-in) -> App scores you -> See trends -> Stay consistent.

## 2. MVP Scope (v1)

IN scope:
1. Auth: sign up, log in, log out (email + password).
2. Goals CRUD with categories: per-user, 4 defaults (Fitness, Study, Career, Custom) plus up to 12 total custom ones; goal emoji/colour; templates (added 2026-10-20, goal customisation).
3. Three goal types:
   - Numeric: has target value + unit (e.g. Bench press 80 kg). Progress = current / target.
   - Habit: has frequency (e.g. 5 times per week). Progress = check-ins vs expected.
   - Milestone: has subtasks + deadline (e.g. Finish ITAP3010 assignment). Progress = done subtasks / total.
4. Check-ins: value (optional for habit), note, effort rating 1-5, date.
5. Scoring engine (see section 4).
6. Dashboard: overall score, category scores, streaks, 7/30-day trend chart, goals needing attention.
7. Goal detail page: progress bar, score breakdown, check-in history, chart.
8. Weekly review page: score change vs last week, best goal, slipping goal.
9. Settings: category weights, profile.

OUT of scope for v1 (v2 backlog): AI coach feedback, push/email reminders, Google Calendar sync, social/sharing, native mobile app, dark mode (nice-to-have if time).

## 3. Tech Stack (locked)

| Layer | Choice |
|---|---|
| Frontend | React 18 + Vite + TypeScript + Tailwind CSS + React Router + TanStack Query |
| Charts | Recharts |
| Backend | Python 3.12 + FastAPI + SQLAlchemy 2 + Alembic + Pydantic v2 |
| Database | PostgreSQL 16 |
| Auth | JWT (access token) + bcrypt password hashing |
| Testing | pytest (backend), Vitest (frontend units), Playwright (end-to-end) |
| Dev env | Docker Compose (db + backend + frontend) — local development only |
| Deploy | 100% free, personal hobby use: frontend on Vercel Hobby (root dir `frontend/`), FastAPI backend on Vercel Hobby as a second project (root dir `backend/`, serverless functions), database on Neon free Postgres |
| Code home | One GitHub repo: life-tracker |

Serverless constraints this implies for backend/db code (applies from Phase 2 onward):
- DB connections: read `DATABASE_URL` from env; support Neon's pooled connection string with `sslmode=require`; use a small pool or `NullPool` suitable for short-lived serverless function instances.
- No background processes or in-process schedulers. Any recurring job (e.g. the daily score-snapshot job) must be a regular HTTP endpoint (e.g. `GET /api/v1/internal/daily-snapshot`) protected by a `CRON_SECRET` env var, invoked by Vercel Cron. Vercel Cron only ever sends `GET` requests, so this endpoint must accept `GET` (confirmed from Vercel's current docs — not `POST`, despite that being the more RESTful-looking verb for a side-effecting action).
- Alembic migrations are run manually from a developer machine against Neon — never as part of the Vercel deploy/build step.
- CORS must allow the frontend's deployed Vercel URL via the existing `CORS_ORIGINS` env var.

## 4. Scoring Engine (v1 formula)

Each goal gets a score 0-100, recalculated on every check-in and once daily.

| Factor | Weight | Definition |
|---|---|---|
| Pace | 40% | actual_progress / expected_progress_by_today, capped at 1.0. Expected progress is linear from start_date to deadline. Goals with no deadline use consistency-only pace (pace = consistency). |
| Consistency | 30% | check-ins in last 14 days / expected check-ins in last 14 days, capped at 1.0. |
| Momentum | 20% | Compare progress gained in last 7 days vs previous 7 days. Maps to 0-1: 0.5 = same, 1.0 = clearly better, 0 = stopped. |
| Effort | 10% | average effort rating over last 14 days / 5. |

goal_score = round(100 * (0.4*pace + 0.3*consistency + 0.2*momentum + 0.1*effort))

Category score = weighted average of goal scores in that category (goal.weight, default 1).
Overall score = weighted average of category scores (user category_weights, default equal). Categories with no active goals are excluded.

Grades:
- 90-100 = S "Locked In"
- 75-89 = A "Strong"
- 60-74 = B "On Track"
- 40-59 = C "Slipping"
- 0-39 = D "Off Track"

Rules:
- New goals (under 3 days old) show "Calibrating" instead of a grade.
- Completed goals freeze their final score.
- Scoring code is PURE functions (no DB access) in backend/scoring so it can be unit-tested.
- A daily snapshot is stored in score_snapshots for trend charts.

## 5. Database Schema (v1 draft — db-architect finalises)

- users: id (uuid), name, email (unique), password_hash, created_at
- goals: id, user_id (fk), title, description, category_id (fk → categories, same user), type (enum: numeric, habit, milestone), target_value (nullable), current_value (nullable), unit (nullable), frequency_per_week (nullable), start_date, deadline (nullable), weight (default 1), status (enum: active, completed, archived), created_at. Added in 0003: emoji, color (null = category's), start_value + direction (numeric: increase/decrease), frequency_type (habit: daily/per_week/weekdays) + weekdays (1=Mon..7=Sun), why (≤140), archived_at
- milestones: id, goal_id (fk), title, due_date (nullable), is_done, done_at
- check_ins: id, goal_id (fk), value (nullable), note (nullable), effort_rating (1-5), logged_for (date), created_at
- score_snapshots: id, goal_id (fk), snapshot_date, pace, consistency, momentum, effort, total. Unique (goal_id, snapshot_date)
- category_weights: user_id (fk), category_id (fk), weight. PK (user_id, category_id). (Was keyed by the category enum until migration 0003.)
- categories: id (uuid), user_id (fk, cascade), name (≤24, unique per user case-insensitive), emoji, color (one of 10 identity colours), sort_order, default_key (fitness/study/career/custom for the 4 defaults seeded on register, else null), created_at, updated_at. Max 12 per user; defaults can't be deleted. Added by migration 0003 (goal customisation), which replaced goals.category (enum) with goals.category_id.
- journal_entries: id (uuid), user_id (fk, on delete cascade), title (varchar 120, nullable), body (text), mood (1-5, nullable), tags (text[], default '{}'), created_at, updated_at. Added after v1 (migration 0002); journal entries never affect scoring.

Indexes: check_ins (goal_id, logged_for), score_snapshots (goal_id, snapshot_date), goals (user_id, status), journal_entries (user_id, created_at).

## 6. API Contract (summary — full spec lives in docs/api-contract.yaml)

All routes prefixed /api/v1. Auth via Bearer token except /auth.

- POST /auth/register, POST /auth/login, GET /auth/me
- GET /categories, POST /categories, PATCH /categories/{id}, DELETE /categories/{id}?move_to=, PATCH /categories/order
- GET /goals, POST /goals, GET /goals/{id}, PATCH /goals/{id}, DELETE /goals/{id}
- POST /goals/{id}/milestones, PATCH /milestones/{id}, DELETE /milestones/{id}
- GET /goals/{id}/check-ins, POST /goals/{id}/check-ins, DELETE /check-ins/{id}
- GET /goals/{id}/score (current breakdown), GET /goals/{id}/score-history?days=30
- GET /dashboard (overall score, category scores, streaks, attention list, trend)
- GET /reviews/weekly?week_start=YYYY-MM-DD
- GET /settings/category-weights, PUT /settings/category-weights
- GET /journal (search, tag, dates, paging), POST /journal, GET /journal/stats, GET /journal/export (Markdown for AI), GET /journal/{id}, PATCH /journal/{id}, DELETE /journal/{id}

Error format: { "error": { "code": "STRING", "message": "human readable" } }

docs/api-contract.yaml (OpenAPI 3.1) is the contract between backend and frontend. Only the orchestrator changes it.

## 7. Repo Structure

```
life-tracker/
├── CLAUDE.md        orchestrator rules (read by Claude Code automatically)
├── .claude/agents/  one file per subagent
├── docs/            master-plan, status, decisions, prd, user-stories, api-contract.yaml, test-plan, bugs
├── design/          approved design output (tokens.json, tailwind snippet, screens) — from the Designer chat
├── backend/
│   ├── app/         FastAPI routes, schemas, auth, services
│   │   └── models/  SQLAlchemy models (db-architect)
│   ├── db/          Alembic migrations, seed script
│   ├── scoring/     pure scoring functions
│   └── tests/
├── frontend/
│   └── src/         pages, components, hooks, api client
├── e2e/             Playwright tests
└── docker-compose.yml
```

## 8. Build Phases

| Phase | What | Agents | Done when |
|---|---|---|---|
| 0. Spec | PRD + user stories + api-contract.yaml + repo skeleton + scoring engine | product-planner, devops, scoring-engine, orchestrator | Aayush approves scope |
| 1. Design | Design system + 6 screens: Login, Dashboard, Goals list, Goal detail, Check-in modal, Weekly review | Designer (separate chat) | Aayush approves visuals; design/tokens.json in repo |
| 2. Foundation | Docker running, DB schema + migrations + seed, auth endpoints | devops, db-architect, backend-dev | docker compose up works, can register/login |
| 3. Core backend | Goals, milestones, check-ins, dashboard, weekly review APIs wired to scoring | backend-dev | All endpoints pass pytest |
| 4. Frontend | All pages built against the API | frontend-dev | Full loop works in browser |
| 5. QA + polish | Test plan, e2e tests, bug fixes, responsive check | qa-tester, then owners fix | No critical bugs |
| 6. Launch | Deploy: frontend to Vercel Hobby, backend to Vercel Hobby (second project, serverless functions), DB to Neon free Postgres; wire Vercel Cron -> `GET /api/v1/internal/daily-snapshot` | devops | Live URL works, daily snapshot cron fires |

Phases 0 and 1 run in parallel: the Designer chat works while Claude Code does the spec + skeleton + scoring.

## 9. How the agents work together

- Code agents run as **Claude Code subagents** (defined in .claude/agents/) under one **orchestrator** (the main Claude Code session, rules in CLAUDE.md).
- Everyone works in the same repo, so agents share work through files, not copy-paste. The orchestrator delegates, reviews and stitches it together.
- The **Designer** runs in a separate claude.ai chat (inside the "Life trackker" Project) because design needs visual back-and-forth with Aayush. Approved output gets dropped into design/.
- Aayush approves at the end of every phase. Nothing moves to the next phase without "approved".
- Decisions that change scope, stack, schema or API are logged in docs/decisions.md.
