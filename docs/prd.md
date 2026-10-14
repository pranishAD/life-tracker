# Life Tracker — PRD (v1 / MVP)

## 1. Problem

People who are trying to improve across several life areas at once — gym, study, career — track each area in a different place, or not at all. Notes apps and spreadsheets show raw numbers but don't tell you if you are actually improving, staying consistent, or slipping. There is no single, honest score that says "this is how you are doing right now, across everything."

## 2. Target user

A student or young professional juggling multiple goals at the same time — for example: going to the gym, finishing assignments, and building a career (job search, skills, side projects). They already track some of this in notes or spreadsheets, but want one place that scores their effort and consistency, not just raw numbers.

## 3. Goals of v1

- Let a user create goals in four categories (Fitness, Study, Career, Custom) using three goal types (Numeric, Habit, Milestone).
- Let a user log progress ("check-in") against a goal with a value, note, effort rating, and date.
- Score every goal 0-100 using a fixed formula (pace, consistency, momentum, effort), roll scores up to category and overall scores, and show a letter grade.
- Show the user a dashboard with their overall score, category scores, streaks, a 7/30-day trend, and which goals need attention.
- Show a goal detail page with progress, score breakdown, and check-in history.
- Show a weekly review comparing this week's score to last week's, and calling out the best and the most slipping goal.
- Let the user log in securely and set their own category weights.

## 4. Feature list (must match master-plan section 2 exactly)

1. Auth: sign up, log in, log out (email + password).
2. Goals CRUD with categories: Fitness, Study, Career, Custom.
3. Three goal types:
   - Numeric: has target value + unit (e.g. Bench press 80 kg). Progress = current / target.
   - Habit: has frequency (e.g. 5 times per week). Progress = check-ins vs expected.
   - Milestone: has subtasks + deadline (e.g. Finish ITAP3010 assignment). Progress = done subtasks / total.
4. Check-ins: value (optional for habit), note, effort rating 1-5, date.
5. Scoring engine (see section 5 below).
6. Dashboard: overall score, category scores, streaks, 7/30-day trend chart, goals needing attention.
7. Goal detail page: progress bar, score breakdown, check-in history, chart.
8. Weekly review page: score change vs last week, best goal, slipping goal.
9. Settings: category weights, profile.

## 5. Scoring rules (locked, from master-plan section 4 — do not redesign)

Each goal gets a score 0-100, recalculated on every check-in and once daily.

| Factor | Weight | Definition |
|---|---|---|
| Pace | 40% | actual_progress / expected_progress_by_today, capped at 1.0. Expected progress is linear from start_date to deadline. Goals with no deadline use consistency-only pace (pace = consistency). |
| Consistency | 30% | check-ins in last 14 days / expected check-ins in last 14 days, capped at 1.0. |
| Momentum | 20% | Compare progress gained in last 7 days vs previous 7 days. Maps to 0-1: 0.5 = same, 1.0 = clearly better, 0 = stopped. |
| Effort | 10% | average effort rating over last 14 days / 5. |

`goal_score = round(100 * (0.4*pace + 0.3*consistency + 0.2*momentum + 0.1*effort))`

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

## 6. Success metrics (v1)

- A new user can sign up, create a goal, log a check-in, and see a score with no help text needed (self-explanatory flow).
- Dashboard load returns overall score, category scores, and trend chart in one request.
- Every acceptance criterion in docs/user-stories.md has a matching e2e or unit test, and the core loop (register -> create goal -> check-in -> score updates -> weekly review) passes end to end.
- Scoring formula output matches hand-calculated examples exactly (unit-tested, no drift from section 4).
- Zero critical bugs open at launch (phase 6 gate).

## 7. Non-goals (explicitly out of v1)

- No AI coaching or feedback text.
- No push or email reminders/notifications.
- No calendar sync (Google Calendar or otherwise).
- No social features: no sharing, following, leaderboards, or public profiles.
- No native mobile app (web app only, installable as PWA).
- No dark mode (nice-to-have only if time allows; not required for v1 scope).
- No changing the scoring formula's weights or factors per-user (fixed formula for all users in v1; only category weights are user-configurable).
- No multi-user/team goals, no goal templates marketplace.

## 8. v2 ideas (explicitly out of scope for v1 — backlog only)

- AI coach: personalized feedback and suggestions based on score trends.
- Push and/or email reminders/nudges to check in.
- Google Calendar sync (auto-create check-in reminders, see deadlines).
- Social/sharing: share progress, compare with friends, leaderboards.
- Native mobile app (iOS/Android).
- Dark mode as a fully supported theme.
- Custom/per-user scoring weight tuning (beyond category weights).
- Goal templates or community-shared goals.
- Export data (CSV/PDF reports).
- Integrations with fitness trackers (Strava, Apple Health, etc.) or study tools.
