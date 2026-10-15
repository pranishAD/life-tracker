# Decisions Log

Format: date — decision — why — who approved.

- 2026-10-14 — Web app first (responsive + PWA); native mobile out of scope for v1 — faster, matches React learning — Aayush
- 2026-10-14 — Stack locked: React + Vite + TS + Tailwind / FastAPI / PostgreSQL — matches Aayush's Python + SQL strengths — Aayush
- 2026-10-14 — Code agents run as Claude Code subagents under one orchestrator; Designer runs in a separate claude.ai chat — agents share the repo instead of copy-paste — Aayush
- 2026-10-14 — docs/api-contract.yaml (OpenAPI 3.1) written by orchestrator from master-plan section 6 + user-stories.md — 15 paths, 24 schemas, Bearer JWT auth, {error:{code,message}} error shape — pending Aayush review
- 2026-10-14 — Scoring engine resolves 7 ambiguities in master-plan section 4 (per-type pace progress, non-habit consistency defaults to 1/week, momentum uses check-in/milestone count not value deltas, streak definition, frozen-score mechanics, archived goals excluded not zeroed, date vs datetime) — documented in backend/scoring/README.md — pending Aayush thumbs-up, does not change formula weights or schema
- 2026-10-15 — App name: Bihan (replaces working name "Life Tracker") — Aayush
- 2026-10-15 — Phase 0 (spec) approved as delivered — Aayush
- 2026-10-15 — Scoring engine's 7 interpretations (backend/scoring/README.md § Interpretations) approved as written, no changes — Aayush
- 2026-10-15 — `docker compose up --build` confirmed working on Aayush's own machine; Phase 2 foundation work can proceed — Aayush
- 2026-10-15 — DB schema finalised by db-architect: `updated_at`/`created_at` audit columns added beyond the section-5 draft (users, goals, milestones, category_weights), email uniqueness enforced via a case-insensitive functional index (`lower(email)`) rather than plain `UNIQUE`, and `frequency_per_week` allowed on any goal type (not just habit) per scoring engine's documented pace/consistency fallback — additive only, no API or scope change — orchestrator (no Aayush input needed, logged per CLAUDE.md)
- 2026-10-15 — Pinned `bcrypt==4.0.1` in backend/requirements.txt alongside `passlib[bcrypt]==1.7.*` — passlib 1.7.4 is unmaintained and breaks against bcrypt>=4.1 (crashes on first `hash()` call), which would have silently broken register/login in Phase 2 — found and fixed by db-architect, verified independently (71/71 scoring tests still pass, seed script runs clean)
- 2026-10-15 — Deploy target changed to 100% free / personal hobby use: frontend on Vercel Hobby, FastAPI backend as a *second* Vercel Hobby project (serverless functions), database on Neon free Postgres. Replaces the earlier "Render or Railway" plan in master-plan section 3. Docker Compose stays local-dev only. Implies serverless constraints on backend/db code from Phase 2 onward: small-pool/NullPool DB connections with Neon's `sslmode=require` pooled URL, no background processes (daily snapshot becomes a `CRON_SECRET`-protected endpoint hit by Vercel Cron, not an in-process job), and Alembic migrations run manually from a dev machine against Neon rather than on deploy — Aayush
- 2026-10-15 — Daily snapshot endpoint will be `GET /api/v1/internal/daily-snapshot`, not `POST` — Vercel Cron only ever sends GET requests (confirmed from current Vercel docs by devops), so POST would get a 405 in production. Technical correction to the Vercel/Neon decision above, not a scope change — orchestrator, no separate Aayush approval needed
- 2026-10-15 — Phase 2 (Foundation) approved, merged to main — Aayush
