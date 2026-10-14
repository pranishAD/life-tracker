"""Pure functions implementing each piece of the scoring formula.

See docs/master-plan.md section 4 for the formula and backend/scoring/README.md
"Interpretations" for the rules chosen where that section was ambiguous.

No function in this module touches a database, the clock, or any other I/O.
`today: date` is always passed in by the caller.
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Sequence

from .types import CheckIn, Goal, GoalStatus, GoalType, Grade, Milestone

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
        actual = goal.current_value or 0.0
        total = goal.target_value or 0.0
        return actual, total

    if goal.type == GoalType.HABIT:
        actual = float(len(check_ins))
        weeks = 0.0
        if goal.deadline is not None:
            weeks = max(0.0, (goal.deadline - goal.start_date).days / 7.0)
        total = (goal.frequency_per_week or 0.0) * weeks
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

    active_days = (active_end - active_start).days + 1
    freq = goal.frequency_per_week if goal.frequency_per_week is not None else 1.0
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


def current_streak(check_ins: Sequence[CheckIn], today: date) -> int:
    """Consecutive days (ending today, or ending yesterday if today hasn't been
    logged yet) with at least one check-in.
    """
    days = _distinct_days(check_ins)
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


def best_streak(check_ins: Sequence[CheckIn]) -> int:
    """Longest run of consecutive calendar days with at least one check-in,
    ever (not limited to "current").
    """
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
    "current_streak",
    "best_streak",
]
