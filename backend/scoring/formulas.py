"""Pure functions implementing each piece of the scoring formula.

See docs/master-plan.md section 4 for the formula and backend/scoring/README.md
"Interpretations" for the rules chosen where that section was ambiguous.

No function in this module touches a database, the clock, or any other I/O.
`today: date` is always passed in by the caller.
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Iterable, Optional, Sequence

from .types import CheckIn, FrequencyType, Goal, GoalStatus, GoalType, Grade, Milestone

ONE_DAY = timedelta(days=1)

# score -> (letter, label), checked top-down, highest threshold first.
_GRADE_TABLE: list[tuple[int, str, str]] = [
    (90, "S", "Locked In"),
    (75, "A", "Strong"),
    (60, "B", "On Track"),
    (40, "C", "Slipping"),
    (0, "D", "Off Track"),
]


def _clamp01(x: float) -> float:
    return max(0.0, min(1.0, x))


def _distinct_days(check_ins: Sequence[CheckIn]) -> set[date]:
    return {c.logged_for for c in check_ins}


# --- check-in schedule (goal customisation) ---------------------------------


def _normalise_weekdays(weekdays: Optional[Iterable[int]]) -> Optional[frozenset[int]]:
    """Valid ISO weekdays (1..7) as a set, or None when nothing valid is given."""
    if weekdays is None:
        return None
    valid = frozenset(int(d) for d in weekdays if 1 <= int(d) <= 7)
    return valid or None


def scheduled_weekdays(goal: Goal) -> Optional[frozenset[int]]:
    """The goal's scheduled ISO weekdays when it runs on a specific-weekdays
    schedule, else None (meaning "a rate per week, any days").

    Only `frequency_type == WEEKDAYS` with at least one valid weekday counts;
    WEEKDAYS with an empty/missing list falls back to the per-week rate (see
    README "Interpretations" 9). `weekdays` is ignored for any other
    frequency_type.
    """
    if goal.frequency_type != FrequencyType.WEEKDAYS:
        return None
    return _normalise_weekdays(goal.weekdays)


def _weekly_rate(goal: Goal) -> Optional[float]:
    """Expected check-ins per week for rate-based schedules. DAILY is always 7;
    PER_WEEK / legacy (None) / WEEKDAYS-without-days use frequency_per_week
    (which may be None -- each caller applies its own legacy default).
    """
    if goal.frequency_type == FrequencyType.DAILY:
        return 7.0
    return goal.frequency_per_week


def _count_scheduled_days(weekdays: frozenset[int], start: date, end: date) -> int:
    """Number of days in [start, end] (inclusive) whose ISO weekday is scheduled."""
    n = (end - start).days + 1
    if n <= 0:
        return 0
    full_weeks, rest = divmod(n, 7)
    count = full_weeks * len(weekdays)
    for i in range(rest):
        if (start + timedelta(days=i)).isoweekday() in weekdays:
            count += 1
    return count


def _elapsed_fraction(start: date, deadline: date, today: date) -> float:
    """Fraction (0..1) of the start->deadline window that has elapsed as of today."""
    if deadline <= start:
        return 1.0
    if today <= start:
        return 0.0
    if today >= deadline:
        return 1.0
    return (today - start).days / (deadline - start).days


def _progress_amounts(
    goal: Goal, check_ins: Sequence[CheckIn], milestones: Sequence[Milestone]
) -> tuple[float, float]:
    """Return (actual_progress, total_expected_progress_at_deadline) in a
    type-specific unit. `total` is 0 when the goal has no meaningful target yet
    (e.g. a numeric goal missing target_value, or a milestone goal with no
    milestones) — callers should fall back to consistency-only pace in that case.
    """
    if goal.type == GoalType.NUMERIC:
        if goal.target_value is None:
            return 0.0, 0.0  # no target -> fallback (same as legacy `target or 0`)
        start = goal.start_value if goal.start_value is not None else 0.0
        current = goal.current_value if goal.current_value is not None else start
        # Signed progress: (current - start) / (target - start). An "increase"
        # goal has target > start; a "decrease" goal has target < start and is
        # flipped so `total` is positive and moving the wrong way gives a
        # negative `actual` (pace then clamps to 0). start == target gives
        # total == 0 -> consistency fallback. With start == 0 nothing is
        # flipped, so this is exactly the legacy `current / target` (including
        # the legacy fallback for target <= 0). README "Interpretations" 1.
        actual = current - start
        total = goal.target_value - start
        if total < 0 and start != 0:
            actual, total = -actual, -total
        return actual, total

    if goal.type == GoalType.HABIT:
        actual = float(len(check_ins))
        if goal.deadline is None:
            return actual, 0.0
        wd = scheduled_weekdays(goal)
        if wd is not None:
            # Scheduled days in [start_date, deadline): the same half-open
            # span the per-week rate uses below ((deadline - start).days days).
            last_day = goal.deadline - ONE_DAY
            return actual, float(_count_scheduled_days(wd, goal.start_date, last_day))
        weeks = max(0.0, (goal.deadline - goal.start_date).days / 7.0)
        total = (_weekly_rate(goal) or 0.0) * weeks
        return actual, total

    if goal.type == GoalType.MILESTONE:
        actual = float(sum(1 for m in milestones if m.is_done))
        total = float(len(milestones))
        return actual, total

    raise ValueError(f"Unknown goal type: {goal.type!r}")


def consistency(goal: Goal, check_ins: Sequence[CheckIn], today: date) -> float:
    """check-ins in the last 14 days / expected check-ins in the last 14 days,
    capped at 1.0.

    The 14-day window is clipped to the part of the goal's lifetime that
    actually overlaps it (it can't start before goal.start_date or run past
    goal.deadline), so a brand-new goal or a goal whose deadline already
    passed isn't unfairly penalised for days it wasn't "live".
    """
    window_start = today - timedelta(days=13)
    window_end = today

    active_start = max(window_start, goal.start_date)
    active_end = min(window_end, goal.deadline) if goal.deadline else window_end

    if active_end < active_start:
        # The goal wasn't active at all during this window (hasn't started yet,
        # or its deadline passed before the window began) -> nothing was
        # expected, so don't penalise it.
        return 1.0

    wd = scheduled_weekdays(goal)
    if wd is not None:
        # Only scheduled weekdays are expected; a window with none of them
        # expects nothing (-> 1.0 below). Check-ins on unscheduled days still
        # count as actual check-ins.
        expected = float(_count_scheduled_days(wd, active_start, active_end))
    else:
        active_days = (active_end - active_start).days + 1
        rate = _weekly_rate(goal)
        freq = rate if rate is not None else 1.0
        expected = freq / 7.0 * active_days

    if expected <= 0:
        return 1.0

    actual = sum(1 for c in check_ins if window_start <= c.logged_for <= window_end)
    return _clamp01(actual / expected)


def pace(
    goal: Goal,
    check_ins: Sequence[CheckIn],
    milestones: Sequence[Milestone],
    today: date,
) -> float:
    """actual_progress / expected_progress_by_today, capped at 1.0.

    Expected progress is linear from start_date to deadline. Goals with no
    deadline (or no meaningful target to measure progress against) fall back
    to consistency-only pace.
    """
    if goal.deadline is None:
        return consistency(goal, check_ins, today)

    actual, total = _progress_amounts(goal, check_ins, milestones)
    if total <= 0:
        return consistency(goal, check_ins, today)

    elapsed_fraction = _elapsed_fraction(goal.start_date, goal.deadline, today)
    if elapsed_fraction <= 0:
        # Goal hasn't started yet (or starts today) -> nothing is expected yet.
        return 1.0

    wd = scheduled_weekdays(goal) if goal.type == GoalType.HABIT else None
    if wd is not None:
        # Scheduled days in [start_date, min(today, deadline)): today itself
        # isn't expected yet, matching the linear rule's (today - start) days.
        end_exclusive = min(today, goal.deadline)
        expected = float(_count_scheduled_days(wd, goal.start_date, end_exclusive - ONE_DAY))
        if expected <= 0:
            return 1.0  # no scheduled day has passed yet -> nothing expected
    else:
        expected = total * elapsed_fraction
    return _clamp01(actual / expected)


def _window_activity(
    goal_type: GoalType,
    check_ins: Sequence[CheckIn],
    milestones: Sequence[Milestone],
    window_start: date,
    window_end: date,
) -> float:
    """"Progress gained" in a window: completed milestones for milestone goals,
    number of check-ins logged for numeric/habit goals. See README
    "Interpretations" for why.
    """
    if goal_type == GoalType.MILESTONE:
        return float(
            sum(
                1
                for m in milestones
                if m.is_done and m.done_at is not None and window_start <= m.done_at <= window_end
            )
        )
    return float(sum(1 for c in check_ins if window_start <= c.logged_for <= window_end))


def momentum(
    goal: Goal,
    check_ins: Sequence[CheckIn],
    milestones: Sequence[Milestone],
    today: date,
) -> float:
    """Compare progress gained in the last 7 days vs the previous 7 days.

    0.5 = same, 1.0 = clearly better (>= double), 0.0 = stopped (had activity,
    now none). Both windows empty (no activity in either) is treated as
    neutral (0.5): pace/consistency already penalise sustained inactivity, so
    momentum doesn't need to double-penalise it.
    """
    last_start, last_end = today - timedelta(days=6), today
    prev_start, prev_end = today - timedelta(days=13), today - timedelta(days=7)

    last_gain = _window_activity(goal.type, check_ins, milestones, last_start, last_end)
    prev_gain = _window_activity(goal.type, check_ins, milestones, prev_start, prev_end)

    if prev_gain <= 0 and last_gain <= 0:
        return 0.5
    if prev_gain <= 0:  # last_gain > 0: went from nothing to something
        return 1.0

    ratio = last_gain / prev_gain
    if ratio <= 1:
        return _clamp01(0.5 * ratio)
    return _clamp01(0.5 + 0.5 * (ratio - 1))  # reaches 1.0 at ratio == 2 (double)


def effort(check_ins: Sequence[CheckIn], today: date) -> float:
    """Average effort rating over the last 14 days / 5. 0.0 when there were no
    rated check-ins in that window (no effort recorded -> treated as none given).
    """
    window_start = today - timedelta(days=13)
    ratings = [
        c.effort_rating
        for c in check_ins
        if c.effort_rating is not None and window_start <= c.logged_for <= today
    ]
    if not ratings:
        return 0.0
    avg = sum(ratings) / len(ratings)
    return _clamp01(avg / 5.0)


def _prev_scheduled(day: date, weekdays: frozenset[int]) -> date:
    """The latest scheduled day strictly before `day` (weekdays is non-empty)."""
    cursor = day - ONE_DAY
    while cursor.isoweekday() not in weekdays:
        cursor -= ONE_DAY
    return cursor


def _current_streak_weekdays(days: set[date], today: date, weekdays: frozenset[int]) -> int:
    # Most recent scheduled day on or before today.
    last = today if today.isoweekday() in weekdays else _prev_scheduled(today, weekdays)
    if last not in days:
        if last != today:
            return 0  # that scheduled day is already over and was missed
        last = _prev_scheduled(today, weekdays)  # today is scheduled but not over yet
        if last not in days:
            return 0
    count = 0
    cursor = last
    while cursor in days:
        count += 1
        cursor = _prev_scheduled(cursor, weekdays)
    return count


def _best_streak_weekdays(days: set[date], weekdays: frozenset[int]) -> int:
    hits = sorted(d for d in days if d.isoweekday() in weekdays)
    if not hits:
        return 0
    best = run = 1
    for prev_day, cur_day in zip(hits, hits[1:]):
        run = run + 1 if _prev_scheduled(cur_day, weekdays) == prev_day else 1
        best = max(best, run)
    return best


def current_streak(
    check_ins: Sequence[CheckIn],
    today: date,
    weekdays: Optional[Iterable[int]] = None,
) -> int:
    """Consecutive days (ending today, or ending yesterday if today hasn't been
    logged yet) with at least one check-in.

    With `weekdays` (ISO 1..7; pass `scheduled_weekdays(goal)` for habits on a
    specific-weekdays schedule) only scheduled days count: unscheduled days
    neither break nor extend the streak, and check-ins logged on them are
    ignored for streaks. The streak ends at the most recent scheduled day on
    or before today; if that day IS today and isn't logged yet, the previous
    scheduled day is used instead (today isn't over). See README
    "Interpretations" 4.
    """
    days = _distinct_days(check_ins)
    wd = _normalise_weekdays(weekdays)
    if wd is not None:
        return _current_streak_weekdays(days, today, wd)
    if today in days:
        cursor = today
    elif (today - ONE_DAY) in days:
        cursor = today - ONE_DAY
    else:
        return 0

    count = 0
    while cursor in days:
        count += 1
        cursor -= ONE_DAY
    return count


def best_streak(
    check_ins: Sequence[CheckIn],
    weekdays: Optional[Iterable[int]] = None,
) -> int:
    """Longest run of consecutive calendar days with at least one check-in,
    ever (not limited to "current").

    With `weekdays`, the run is over consecutive *scheduled* days instead
    (unscheduled days are skipped, see `current_streak`).
    """
    wd = _normalise_weekdays(weekdays)
    if wd is not None:
        return _best_streak_weekdays(_distinct_days(check_ins), wd)
    days = sorted(_distinct_days(check_ins))
    if not days:
        return 0

    best = 1
    run = 1
    for prev_day, cur_day in zip(days, days[1:]):
        if cur_day == prev_day + ONE_DAY:
            run += 1
        else:
            run = 1
        best = max(best, run)
    return best


def grade(score: int) -> Grade:
    """Map a 0-100 score to its letter grade + label. Does not know about
    "Calibrating" -- that's a goal-age concern handled by `is_calibrating` /
    `score_goal`, not a property of the numeric score itself.
    """
    for threshold, letter, label in _GRADE_TABLE:
        if score >= threshold:
            return Grade(letter, label)
    return Grade("D", "Off Track")  # unreachable for score >= 0, safety net


def is_calibrating(created_at: date, today: date) -> bool:
    """True when the goal is under 3 days old as of today."""
    return (today - created_at).days < 3


def is_scorable_status(status: GoalStatus) -> bool:
    """Which goal statuses count towards category_score / overall_score.

    Kept here (not hardcoded in the backend) so the rule lives in one place.
    See README "Interpretations".
    """
    return status in (GoalStatus.ACTIVE, GoalStatus.COMPLETED)


__all__ = [
    "pace",
    "consistency",
    "momentum",
    "effort",
    "grade",
    "is_calibrating",
    "is_scorable_status",
    "scheduled_weekdays",
    "current_streak",
    "best_streak",
]
