# Scoring engine (`backend/scoring/`)

Pure Python implementation of the formula in `docs/master-plan.md` section 4.
No database access, no FastAPI, no I/O, no `datetime.now()` — every function
takes the data (and `today: date`) it needs as plain arguments and returns a
plain value. This makes the whole module trivially unit-testable and safe to
call from anywhere (API request handler, a daily cron job, a script).

## Install / run tests

```bash
python -m pip install pytest
pytest backend/tests/scoring -q          # from the repo root
# or, inside the backend container (/app == backend/):
docker compose exec -T backend pytest tests/scoring -q
```

(No other dependency is required — the module only uses the standard
library.)

## Public API

All of the below are importable from `scoring` directly (with `backend/` as
the import root, same as `app` and `db`), e.g.
`from scoring import score_goal, Goal, CheckIn`.

### Types (`backend/scoring/types.py`)

```python
class GoalType(str, Enum):      # "numeric" | "habit" | "milestone"
class GoalStatus(str, Enum):    # "active" | "completed" | "archived"
class FrequencyType(str, Enum): # "daily" | "per_week" | "weekdays"  (habit schedule)

@dataclass(frozen=True)
class Goal:
    type: GoalType
    status: GoalStatus
    start_date: date
    created_at: date
    target_value: Optional[float] = None       # numeric
    current_value: Optional[float] = None      # numeric
    frequency_per_week: Optional[float] = None # habit (and a fallback for others, see Interpretations)
    deadline: Optional[date] = None
    weight: float = 1.0
    # Goal customisation. All optional; the defaults reproduce pre-customisation scores exactly.
    start_value: Optional[float] = None               # numeric; None = 0
    frequency_type: Optional[FrequencyType] = None    # habit; None = legacy = per_week
    weekdays: Optional[tuple[int, ...]] = None        # ISO 1=Mon..7=Sun; only used when frequency_type == WEEKDAYS

@dataclass(frozen=True)
class CheckIn:
    logged_for: date
    effort_rating: Optional[int] = None  # 1-5
    value: Optional[float] = None

@dataclass(frozen=True)
class Milestone:
    is_done: bool
    done_at: Optional[date] = None

@dataclass(frozen=True)
class ScoreBreakdown:
    pace: float          # 0.0-1.0
    consistency: float   # 0.0-1.0
    momentum: float       # 0.0-1.0
    effort: float         # 0.0-1.0

@dataclass(frozen=True)
class GoalScore:
    breakdown: ScoreBreakdown
    total: int            # 0-100
    grade: str             # "S" | "A" | "B" | "C" | "D" | "Calibrating"
    grade_label: str        # "Locked In" | "Strong" | "On Track" | "Slipping" | "Off Track" | "Calibrating"
    current_streak: int
    best_streak: int

@dataclass(frozen=True)
class Grade:
    letter: str
    label: str

@dataclass(frozen=True)
class WeightedScore:           # one goal's score, for folding into category_score
    score: int
    weight: float = 1.0

@dataclass(frozen=True)
class CategoryScoreInput:      # one category's score, for folding into overall_score
    category: str
    score: Optional[int]       # None => category has no eligible goals, excluded
    weight: float = 1.0
```

### Factor functions (`backend/scoring/formulas.py`)

```python
def pace(goal: Goal, check_ins: Sequence[CheckIn], milestones: Sequence[Milestone], today: date) -> float
def consistency(goal: Goal, check_ins: Sequence[CheckIn], today: date) -> float
def momentum(goal: Goal, check_ins: Sequence[CheckIn], milestones: Sequence[Milestone], today: date) -> float
def effort(check_ins: Sequence[CheckIn], today: date) -> float

def grade(score: int) -> Grade
def is_calibrating(created_at: date, today: date) -> bool
def is_scorable_status(status: GoalStatus) -> bool   # True for active/completed, False for archived
def scheduled_weekdays(goal: Goal) -> Optional[frozenset[int]]  # the weekdays schedule, or None for rate-based

def current_streak(check_ins: Sequence[CheckIn], today: date, weekdays: Optional[Iterable[int]] = None) -> int
def best_streak(check_ins: Sequence[CheckIn], weekdays: Optional[Iterable[int]] = None) -> int
```

`weekdays` on the streak functions is optional; without it they use the
calendar-day rule. `score_goal` passes `scheduled_weekdays(goal)` for habit
goals automatically, so the backend never needs to call these directly.

Every factor function returns a `float` clamped to `[0.0, 1.0]`.

### Entry points (`backend/scoring/engine.py`)

```python
def score_goal(goal: Goal, check_ins: Sequence[CheckIn], milestones: Sequence[Milestone], today: date) -> GoalScore
goal_score = score_goal  # same function, kept under both names (see agent brief)

def category_score(scores: Sequence[WeightedScore]) -> Optional[int]
def overall_score(categories: Sequence[CategoryScoreInput]) -> Optional[int]
```

`score_goal` is **the** public entry point the backend should call per goal.
`category_score`/`overall_score` are pure aggregators: the caller (backend
service layer) is responsible for pre-filtering goals to the ones that should
count (see `is_scorable_status`) before building the `WeightedScore` /
`CategoryScoreInput` lists.

## Worked example

A numeric goal, "Bench press 80 kg":

```python
goal = Goal(
    type=GoalType.NUMERIC,
    status=GoalStatus.ACTIVE,
    start_date=date(2026, 9, 1),
    created_at=date(2026, 9, 1),
    target_value=80.0,
    current_value=50.0,
    frequency_per_week=3,       # intends to log 3x/week
    deadline=date(2026, 11, 1),
)

check_ins = [
    CheckIn(logged_for=date(2026, 10, 2),  effort_rating=4),
    CheckIn(logged_for=date(2026, 10, 3),  effort_rating=3),
    CheckIn(logged_for=date(2026, 10, 10), effort_rating=5),
    CheckIn(logged_for=date(2026, 10, 13), effort_rating=4),
    CheckIn(logged_for=date(2026, 10, 14), effort_rating=5),
]

today = date(2026, 10, 14)
result = score_goal(goal, check_ins, [], today)
```

Step by step:

- **Pace**: elapsed = (Oct 14 − Sep 1) = 43 days of (Nov 1 − Sep 1) = 61 days
  → elapsed_fraction ≈ 0.70492. Expected progress = 80 × 0.70492 ≈ 56.39 kg.
  Actual = 50 kg. pace = 50 / 56.39 ≈ **0.8866**.
- **Consistency**: 14-day window = Oct 1–14. Expected = 3/7 × 14 = 6
  check-ins. Actual = 5 check-ins in that window. consistency = 5/6 ≈
  **0.8333**.
- **Momentum**: last 7 days (Oct 8–14) has 3 check-ins (Oct 10, 13, 14);
  previous 7 days (Oct 1–7) has 2 (Oct 2, 3). ratio = 3/2 = 1.5 →
  momentum = 0.5 + 0.5×(1.5−1) = **0.75**.
- **Effort**: ratings in the Oct 1–14 window = [4, 3, 5, 4, 5], average =
  4.2 → effort = 4.2/5 = **0.84**.
- **Total** = round(100 × (0.4×0.8866 + 0.3×0.8333 + 0.2×0.75 + 0.1×0.84))
  = round(83.87) = **84** → grade **A "Strong"**.
- **current_streak** = 2 (Oct 13, 14 back-to-back). **best_streak** = 2
  (either Oct 2–3 or Oct 13–14, both length 2).

This exact scenario is reproducible (and asserted) in
`backend/tests/scoring/test_score_goal.py` and, after goal customisation, also
in `test_backward_compat.py` (with `start_value` unset and with
`start_value=0`; both still give 84). Running it prints:

```
pace 0.8866279069767442
consistency 0.8333333333333334
momentum 0.75
effort 0.8400000000000001
total 84
grade A Strong
current_streak 2
best_streak 2
```

## Interpretations

Section 4 of the master plan leaves a few rules under-specified for the three
different goal types. Where that happened we picked the simplest sensible
rule and documented it here, as instructed by the scoring-engine agent brief.
**These are implementation choices, not approved product decisions — flagged
for Aayush's review in the handoff note.**

1. **"Progress" per goal type, for `pace`.** `pace` needs an
   `actual_progress` and a type-specific `total_expected_progress`:
   - *numeric*: `actual = current_value − start_value`, `total =
     target_value − start_value` (`start_value` None = 0, so legacy goals
     are exactly `current / target`). A *decrease* goal (target below start)
     is handled by sign: both are negated so `total` is positive, e.g. start
     32, target 28, current 30 → 2/4 = 50 % done. Moving the wrong way gives
     a negative `actual` and pace clamps to 0. Details in #8. *(amended for
     goal customisation, pending Aayush's review)*
   - *habit*: `actual = count of check-ins` (any day, scheduled or not),
     `total` = the check-ins the schedule expects over the goal's whole life,
     i.e. not just the last 14 days (that's `consistency`'s job):
     - `per_week` / legacy (`frequency_type` None): `frequency_per_week ×
       weeks between start_date and deadline`.
     - `daily`: same with 7 per week (identical to `per_week` with 7).
     - `weekdays`: the number of scheduled weekdays in `[start_date,
       deadline)`. That is the same half-open span the per-week rule uses,
       which counts `(deadline − start_date).days` days. *(amended, pending
       review)*

     Expected-by-today for `weekdays` habits is the number of scheduled
     weekdays in `[start_date, min(today, deadline))`, not `total ×
     elapsed_fraction`. Today itself is not expected yet, which matches the
     linear rule's `(today − start_date)` days. If no scheduled day has passed
     yet, nothing is expected and pace = 1.0 (same as the "goal hasn't
     started" rule). With all 7 weekdays selected this equals `daily`.
   - *milestone*: `actual = count of milestones with is_done = True`,
     `total = total milestone count`.
   If `total <= 0` (numeric goal with no/zero target, or milestone goal with
   no milestones yet), `pace` falls back to `consistency` — there's no
   meaningful linear target to measure against, same as the explicit "no
   deadline" rule.

2. **Expected check-ins for `consistency`.** The formula says "check-ins
   in last 14 days / expected check-ins in last 14 days". Expected check-ins
   in the (clipped, see below) window come from `frequency_type` *(amended
   for goal customisation, pending Aayush's review)*:
   - `daily`: 1 per day (= `frequency_per_week` 7; any stored
     `frequency_per_week` is ignored).
   - `per_week` or None (legacy): `frequency_per_week / 7 × days`.
   - `weekdays`: the number of *scheduled* weekdays in the window. Missing an
     unscheduled day costs nothing. Check-ins logged on unscheduled days
     still count as actual check-ins (consistency is still capped at 1.0). A
     window with zero scheduled days expects nothing, so consistency = 1.0.

   Only habit goals have a natural `frequency_per_week`. If a numeric or
   milestone goal doesn't set `frequency_per_week`, we default the expected
   frequency to **1 check-in per week**. The 14-day window is also clipped to
   the portion of it that overlaps `[start_date, deadline]`, so a goal that's
   under 14 days old, or whose deadline has already passed, isn't penalised
   for days it wasn't "live" (if the window doesn't overlap the goal's active
   lifetime at all, `consistency = 1.0` — nothing was expected).

3. **"Progress gained" for `momentum`.** Rather than reconstructing a
   historical value time-series for numeric goals (check-in `value` isn't
   guaranteed to be an incremental delta vs. an absolute reading, and the
   schema doesn't clarify which), momentum uses **check-in count** as the
   activity proxy for numeric and habit goals, and **count of milestones
   completed** (by `done_at`) for milestone goals, in each 7-day window. The
   ratio of last-7-days activity to the previous 7 days is mapped onto
   `[0, 1]` linearly: ratio 0 → 0.0 ("stopped"), ratio 1 → 0.5 ("same"), ratio
   ≥ 2 → 1.0 ("clearly better", capped). Going from zero activity to any
   activity → 1.0; staying at zero activity in both windows → 0.5 (treated as
   neutral, not "stopped" — sustained inactivity is already penalised by
   `pace`/`consistency`, momentum doesn't need to double-penalise it).

4. **Streaks.** `current_streak`/`best_streak` are defined as consecutive
   **calendar days** with at least one check-in (multiple check-ins on the
   same day count once). `current_streak` doesn't break the instant "today"
   passes without a check-in — if yesterday has one, the streak still counts
   through yesterday (the day isn't over yet); if neither today nor
   yesterday has a check-in, the streak is 0. This is unchanged for
   `daily`, `per_week` and legacy goals.

   *Habits with `frequency_type = weekdays` (amended, pending Aayush's
   review):* streaks run over consecutive **scheduled** days only.
   Unscheduled days neither break nor extend a streak, and check-ins logged
   on them are ignored for streaks (they still count for pace/consistency).
   So a Mon/Wed/Fri habit checked in Mon, Wed, Fri, Mon has a streak of 4.
   "Doesn't break until the day is over" maps to: look at the most recent
   scheduled day on or before today.
   - If it is logged, the streak counts back from it. This covers an
     unscheduled today, e.g. on Tuesday the Monday check-in keeps the streak
     alive.
   - If it is today and not logged yet, today isn't over, so count back from
     the previous scheduled day instead.
   - If it is an earlier day (today is unscheduled) and wasn't logged, that
     day is over and was missed, so the streak is 0.

   `best_streak` is the longest run of logged scheduled days with no logged
   gap between them.

5. **Frozen score for completed goals.** The brief doesn't say *how* to keep
   a completed goal's score constant when `score_goal` is still a pure
   function of `today` (which keeps moving). We define: once
   `status == "completed"`, `pace = consistency = momentum = 1.0` (the goal
   was achieved), and `effort` is the average `effort_rating` across **all**
   of the goal's check-ins ever (not the usual rolling 14-day window — a
   window relative to `today` would eventually run empty and silently decay
   the "frozen" score the further in the future it's recomputed). A
   completed goal's `grade` is also never `"Calibrating"`, even if it was
   completed within 3 days of creation.

6. **Which goal statuses count towards scoring.** `category_score` and
   `overall_score` are pure aggregators that don't know about goal status at
   all — they just fold whatever `WeightedScore`/`CategoryScoreInput` list
   they're given. The decision of *which* goals feed into that list is
   `is_scorable_status`: **active and completed** goals count,
   **archived** goals are excluded entirely (not scored as 0). A category
   whose only goals are archived (or that has no goals at all) should be
   built with `score=None` in its `CategoryScoreInput`, and `overall_score`
   skips it rather than treating it as a 0 — this is how "category with no
   active goals excluded from overall" is satisfied (asserted in
   `test_goal_customisation.py::TestArchivedExclusion`). If `score_goal` is
   called directly on an archived goal it does **not** filter: it scores the
   goal exactly as if it were active, including the "Calibrating" rule. That
   is unchanged from before goal customisation. Excluding archived goals is
   purely the caller's job via `is_scorable_status`.

7. **`created_at`/`start_date` are `date`, not `datetime`.** The DB schema
   (`docs/master-plan.md` section 5) stores `created_at` as a timestamp. The
   scoring engine only ever compares whole days (`today: date`), so the
   caller (backend-dev) should convert any `datetime` to a `date` (e.g.
   `created_at.date()`) before building a `Goal`.

8. **Numeric `start_value` details** *(new, pending Aayush's review)*.
   No `direction` input is needed: the sign of `target − start` decides it.
   - `start_value` None is treated as 0.
   - `current_value` None is treated as "no progress yet", i.e. equal to
     `start_value`. For legacy goals (start 0) that is the old `current or 0`.
   - `target_value` None means no target, so pace falls back to consistency
     (unchanged).
   - `start == target` gives `total == 0`, which falls back to consistency,
     the same as the existing `total <= 0` rule.
   - Over-achievement on a decrease goal (e.g. 26 min against a target of 28)
     caps at 1.0, the same as an increase goal.
   - To keep pre-customisation scores byte-for-byte identical, the decrease
     flip only applies when `start_value != 0`. A goal with start 0 and a
     negative target therefore keeps the legacy behaviour (consistency
     fallback) rather than being read as "decrease from 0". In practice this
     doesn't matter, because a negative target from 0 isn't a real use case.

9. **Resolving `frequency_type` vs `frequency_per_week`** *(new, pending
   Aayush's review)*. The backend sets `frequency_per_week` to 7 for daily
   and to `len(weekdays)` for weekdays, but scoring doesn't rely on that:
   - `daily` always means 7 per week. A stale or mismatched
     `frequency_per_week` is ignored.
   - `weekdays` with at least one valid ISO day (1..7) uses the schedule, and
     `frequency_per_week` is ignored.
   - `weekdays` with an empty, missing or all-invalid list falls back to
     `frequency_per_week` as a per-week rate (defensive; the API shouldn't
     allow it).
   - `weekdays` values are ignored unless `frequency_type == weekdays`.
   - `per_week` and None behave identically (legacy).
   - In `consistency`, `frequency_type` is honoured for any goal type,
     because it is simply "the check-in schedule". Pace totals and the
     weekday streak rule only use it for habit goals. The backend should send
     `frequency_type`/`weekdays` as None for numeric/milestone goals.
   - Plain strings ("daily", ...) work as well as the enum, since
     `FrequencyType` is a `str` enum.

10. **Weekdays are taken from the dates the caller passes in** *(new,
    pending Aayush's review)*. The engine only sees `date` values, so
    "Monday" means the ISO weekday of `logged_for` / `today` exactly as the
    caller passes them. The backend should keep passing the same
    (user-local) `today` and `logged_for` dates it already uses.
