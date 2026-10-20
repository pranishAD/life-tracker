# Life Tracker (Bihan) - Test Plan

Owner: qa-tester. Status: **partial**. This revision covers the **goal customisation increment** (API v1.1.0, branch `feature/goal-customisation`). The core-loop plan for US-01..US-18 (register, goals, check-ins, score, weekly review) is still owed; see "Gaps" at the bottom.

## 1. Scope

In scope (this revision):
- Goal creation from templates and from blank (screens 10, 11).
- Goal editing (screen 11b): type lock, emoji/colour/category, schedule, archive/restore/delete.
- Numeric goals with start/target/direction (increase and decrease).
- Habit schedules: Every day, Per week, Pick days.
- Settings > Categories (screen 12, 12b): add, edit, reorder, delete (with move), defaults, 12 limit.
- Per-user isolation of categories and goals.

Out of scope here: scoring maths (covered by `backend/tests/scoring`), journal, weekly review, deploy checks.

## 2. Approach

| Level | Tool | Owner | Where |
|---|---|---|---|
| Unit (scoring) | pytest | scoring-engine | `backend/tests/scoring` |
| API | pytest + TestClient | backend-dev | `backend/tests` |
| Component | Vitest + Testing Library | frontend-dev | `frontend/src/**/*.test.tsx` |
| End to end | Playwright (Chromium) | qa-tester | `e2e/tests` |
| Manual / exploratory | checklist below | qa-tester | n/a |

E2E rules: every test registers its own fresh user (unique email), so tests never depend on each other or on seed data. Selectors use roles, labels and visible text (what a user sees), not CSS classes. Desktop = 1280x800, mobile = 375x812.

## 3. Environments

| Env | Details |
|---|---|
| Local (used for QA) | `docker compose up` (frontend :5173, backend :8000, Postgres :5432). Local dev DB only. Never Neon/production. |
| Prerequisite | DB at head: `docker compose exec backend alembic upgrade head`. Frontend deps current: `docker compose exec frontend npm install` (see BUG-001, BUG-002). |
| Run | `cd e2e && npm install && npx playwright install chromium && npx playwright test` |

## 4. Entry / exit criteria

Entry: stack up, migrations at head (`0003_goal_customisation`), api-contract v1.1.0 frozen, backend and frontend unit tests green.
Exit: every row in the traceability table is Pass; no open critical or major bug; Playwright suite green on two consecutive runs (flakiness check).

## 5. Requirements source

User stories were not yet updated for goal customisation, so requirements are taken from `design/components.md` section "Create and edit goals" and `docs/api-contract.yaml` v1.1.0. They are given IDs **GC-R1..GC-R18** below. **Request to product-planner:** add matching user stories so this table can be re-keyed to US IDs.

| ID | Requirement |
|---|---|
| GC-R1 | New goal opens a template picker; Start blank is available; 12 templates in 4 category sections |
| GC-R2 | Picking a template pre-fills name, emoji, category, type and type fields |
| GC-R3 | "Create goal" disabled until name and required fields valid; on success goes to goal detail with a toast |
| GC-R4 | Created goal appears under Goals and on the dashboard after a check-in |
| GC-R5 | Type is locked once a goal has check-ins, with the lock note |
| GC-R6 | Emoji, colour and category can be changed and persist |
| GC-R7 | Archive moves goal out of Active into Archived; Restore returns it; history kept |
| GC-R8 | Numeric: direction auto-set from start vs target (target < start = Decrease), user may override; start must differ from target |
| GC-R9 | Numeric progress = (current - start) / (target - start); decreasing goals progress as value drops |
| GC-R10 | Habit "How often?": Every day / Per week (1-7) / Pick days; at least one day stays selected |
| GC-R11 | Habit schedule persists and shows on goal ("Habit - Mon, Wed, Fri") |
| GC-R12 | Settings > Categories lists categories in user order; 4 defaults seeded per user, marked Default |
| GC-R13 | New category: name required, max 24 chars, unique per user (case-insensitive) |
| GC-R14 | Drag/keyboard reorder persists and defines order everywhere |
| GC-R15 | Deleting a category with goals asks where to move them; empty category deletes with Undo |
| GC-R16 | Default categories can be renamed/recoloured but not deleted |
| GC-R17 | Max 12 categories; New category disabled (Settings and goal form) with explanation |
| GC-R18 | A user only ever sees their own categories and goals (list and by-id access) |
| GC-R19 | Mobile (375px): goal flow usable, fixed footer button, no preview, no horizontal page scroll; category dialog is a sheet |

## 6. Test cases and traceability

Status: Pass = automated and green on last run (10/10, 2026-10-21). Gap = not yet covered.

| Requirement | Test case | Type | Description | Status |
|---|---|---|---|---|
| GC-R1, GC-R2, GC-R3, GC-R4 | TC-GC-01 | e2e | Register, Goals, New goal, pick "Gym 4x a week", details pre-filled, create, toast, check-in, goal on dashboard | Pass |
| GC-R5, GC-R6 | TC-GC-02 | e2e | After 1 check-in: type control disabled + lock note; change category to Study, colour Violet, emoji; save; persists after reload | Pass |
| GC-R7 | TC-GC-03 | e2e | Archive: leaves Active (empty state), appears under Archived, detail shows Archived banner; Restore returns it; Archived empty again | Pass |
| GC-R8, GC-R9 | TC-GC-04 | e2e | Numeric 90 to 80 kg: Decrease auto-selected with hint; check-in 85 shows 50% fill; 82 shows 80% | Pass |
| GC-R10, GC-R11 | TC-GC-05 | e2e | Pick days: last selected day cannot be deselected; Mon/Wed/Fri saved and restored in edit; Every day hides the day picker and shows "Every day" | Pass |
| GC-R12, GC-R13, GC-R14, GC-R15, GC-R16 | TC-GC-06 | e2e | 4 defaults; add "Side projects"; duplicate "side projects" rejected; keyboard reorder persists after reload; default Delete disabled with note; delete category with 1 goal moves it to Study | Pass |
| GC-R17 | TC-GC-07 | e2e | Add up to 12; New category disabled in Settings and goal form with message; deleting an empty one (Undo toast) re-enables | Pass |
| GC-R18 | TC-GC-08 | e2e | User B sees only 4 default categories, none of A's goals; A's goal URL and edit URL show nothing to B; A still sees own data after logout/login | Pass |
| GC-R19 | TC-GC-09 | e2e (375px) | Template list as rows, no sideways scroll, details form without preview, create from footer | Pass |
| GC-R19, GC-R12 | TC-GC-10 | e2e (375px) | Categories settings and New category sheet at 375px, no sideways scroll | Pass |
| GC-R8 (validation) | TC-GC-11 | component | start = target rejected; name required; why <= 140 | Covered by `GoalFormPage.test.tsx` (frontend-dev), not re-run here |
| GC-R13 (limits) | TC-GC-12 | API | 13th category returns CATEGORY_LIMIT_REACHED; duplicate returns CATEGORY_NAME_TAKEN; name > 24 rejected | Gap: confirm in `backend/tests`, not run by QA this pass |
| GC-R15 | TC-GC-13 | API | DELETE category with goals without `move_to` returns an error; with `move_to` of another user's category is rejected | Gap |
| GC-R9 | TC-GC-14 | unit | Scoring with decrease direction and with weekday schedules | Gap: owned by scoring-engine, QA to review tests |
| GC-R1 | TC-GC-15 | manual | Other 11 templates each fill correct fields (only 2 exercised by e2e) | Gap |
| GC-R6 | TC-GC-16 | manual | Emoji search, "Suggested for" section, colour fallback to category colour when none picked | Gap |
| GC-R7 | TC-GC-17 | manual | Delete goal confirm dialog names the goal; leave-with-unsaved-changes asks to discard | Gap |

## 7. Edge cases to run manually / add next

- Goal name 60 chars and 61 chars; why text 140 and 141.
- Start date after target date blocked; milestone requires target date and at least 1 subtask.
- Category name with emoji, spaces only, 24 vs 25 characters.
- Deleting a category whose goals are all archived (count includes archived).
- Reorder on a touch device (long-press).
- Session expiry during edit.

## 8. Gaps (not covered by this revision)

- Core-loop plan for US-01..US-18 and EC-01..EC-10 (register, check-ins, score, weekly review, log out) and the 375px dashboard/check-in modal run. Tests for these are not in `e2e/` yet.
- This file and `docs/bugs.md` did not exist before this pass; both are created here.
