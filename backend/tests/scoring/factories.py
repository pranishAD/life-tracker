"""Small builders to keep the scoring tests readable. Test-only, not imported
by backend/scoring itself.
"""

from __future__ import annotations

from datetime import date
from typing import Optional

from scoring.types import CheckIn, Goal, GoalStatus, GoalType, Milestone


def make_goal(
    *,
    type: GoalType = GoalType.NUMERIC,
    status: GoalStatus = GoalStatus.ACTIVE,
    start_date: date = date(2024, 1, 1),
    created_at: date = date(2024, 1, 1),
    target_value: Optional[float] = 100.0,
    current_value: Optional[float] = 0.0,
    frequency_per_week: Optional[float] = None,
    deadline: Optional[date] = None,
    weight: float = 1.0,
) -> Goal:
    return Goal(
        type=type,
        status=status,
        start_date=start_date,
        created_at=created_at,
        target_value=target_value,
        current_value=current_value,
        frequency_per_week=frequency_per_week,
        deadline=deadline,
        weight=weight,
    )


def make_check_in(
    *, logged_for: date, effort_rating: Optional[int] = 3, value: Optional[float] = None
) -> CheckIn:
    return CheckIn(logged_for=logged_for, effort_rating=effort_rating, value=value)


def make_milestone(*, is_done: bool, done_at: Optional[date] = None) -> Milestone:
    return Milestone(is_done=is_done, done_at=done_at)


def daily_check_ins(start: date, end: date, effort_rating: Optional[int] = 3) -> list[CheckIn]:
    """One check-in per day from start to end, inclusive."""
    out: list[CheckIn] = []
    cursor = start
    while cursor <= end:
        out.append(make_check_in(logged_for=cursor, effort_rating=effort_rating))
        cursor += date.resolution
    return out
