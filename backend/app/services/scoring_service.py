"""Bridge between the ORM models (backend/app/models/) and the pure scoring
engine (backend/scoring/) + helpers to persist a score_snapshots row.

Conversion logic mirrors backend/db/seed.py's `to_scoring_goal` /
`to_scoring_check_in` / `to_scoring_milestone` (that module is a dev script,
not an importable shared module -- see the Phase 3 brief -- so the same
conversions are reimplemented here as the one shared place the rest of
app/ should import from).
"""

from __future__ import annotations

import uuid
from datetime import date, timedelta
from decimal import Decimal
from typing import Optional, Sequence

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import CheckIn, Goal, GoalType, Milestone, ScoreSnapshot
from scoring import (
    CheckIn as SCheckIn,
    FrequencyType as SFrequencyType,
    Goal as SGoal,
    GoalScore as SGoalScore,
    GoalStatus as SGoalStatus,
    GoalType as SGoalType,
    Milestone as SMilestone,
    score_goal,
)


def to_scoring_goal(goal: Goal) -> SGoal:
    # Goal customisation (scoring README Interpretations 8-10): direction is
    # never passed (the engine reads it off start vs target), and the habit
    # schedule only for habits, as the README asks.
    frequency_type = (
        SFrequencyType(goal.frequency_type.value)
        if goal.type == GoalType.HABIT and goal.frequency_type is not None
        else None
    )
    weekdays = (
        tuple(sorted(goal.weekdays))
        if frequency_type == SFrequencyType.WEEKDAYS and goal.weekdays
        else None
    )
    return SGoal(
        type=SGoalType(goal.type.value),
        status=SGoalStatus(goal.status.value),
        start_date=goal.start_date,
        created_at=goal.created_at.date(),
        target_value=float(goal.target_value) if goal.target_value is not None else None,
        current_value=float(goal.current_value) if goal.current_value is not None else None,
        frequency_per_week=(
            float(goal.frequency_per_week) if goal.frequency_per_week is not None else None
        ),
        deadline=goal.deadline,
        weight=float(goal.weight),
        start_value=float(goal.start_value) if goal.start_value is not None else None,
        frequency_type=frequency_type,
        weekdays=weekdays,
    )


def to_scoring_check_in(check_in: CheckIn) -> SCheckIn:
    return SCheckIn(
        logged_for=check_in.logged_for,
        effort_rating=check_in.effort_rating,
        value=float(check_in.value) if check_in.value is not None else None,
    )


def to_scoring_milestone(milestone: Milestone, as_of: date) -> SMilestone:
    """A milestone "as of" a given day -- see backend/db/seed.py for why:
    `done_at` hasn't "happened yet" from `as_of`'s point of view if it's in
    the future relative to it.
    """
    done_at_date = milestone.done_at.date() if milestone.done_at else None
    is_done_as_of = bool(milestone.is_done and done_at_date is not None and done_at_date <= as_of)
    return SMilestone(is_done=is_done_as_of, done_at=done_at_date if is_done_as_of else None)


def load_check_ins(db: Session, goal_id: uuid.UUID) -> list[CheckIn]:
    return list(
        db.scalars(
            select(CheckIn).where(CheckIn.goal_id == goal_id).order_by(CheckIn.logged_for)
        ).all()
    )


def load_milestones(db: Session, goal_id: uuid.UUID) -> list[Milestone]:
    return list(db.scalars(select(Milestone).where(Milestone.goal_id == goal_id)).all())


def score_goal_as_of(
    goal: Goal,
    check_ins: Sequence[CheckIn],
    milestones: Sequence[Milestone],
    as_of: date,
) -> SGoalScore:
    """Score a goal using only the check-ins/milestones that existed "as of" a
    given day, with the engine's `today` set to that same day. Used for
    historical rollups (trend, weekly review, attention) so they don't depend
    on score_snapshots rows actually existing for every day.
    """
    s_goal = to_scoring_goal(goal)
    s_check_ins = [to_scoring_check_in(c) for c in check_ins if c.logged_for <= as_of]
    s_milestones = [to_scoring_milestone(m, as_of) for m in milestones]
    return score_goal(s_goal, s_check_ins, s_milestones, as_of)


def compute_live_score(db: Session, goal: Goal, today: Optional[date] = None) -> SGoalScore:
    """The goal's score right now (all of its check-ins/milestones, as of
    today). Does not write a snapshot -- used by GET /goals/{id}/score.
    """
    today = today or date.today()
    check_ins = load_check_ins(db, goal.id)
    milestones = load_milestones(db, goal.id)
    return score_goal_as_of(goal, check_ins, milestones, today)


def _snapshot_total(result: SGoalScore) -> Optional[int]:
    """Convention (matching backend/db/seed.py): store NULL total on
    Calibrating days -- api-contract.yaml's ScoreSnapshot.total is "null
    while grade is Calibrating", even though score_goal() always returns a
    numeric total.
    """
    return None if result.grade == "Calibrating" else result.total


def recalc_and_upsert_snapshot(
    db: Session, goal: Goal, today: Optional[date] = None
) -> SGoalScore:
    """Recompute a goal's live score and upsert today's score_snapshots row.
    Call this after any check-in or milestone create/update/delete (and from
    the daily cron) -- see docs/master-plan.md section 4 "recalculated on
    every check-in and once daily".
    """
    today = today or date.today()
    result = compute_live_score(db, goal, today)

    existing = db.scalar(
        select(ScoreSnapshot).where(
            ScoreSnapshot.goal_id == goal.id, ScoreSnapshot.snapshot_date == today
        )
    )
    total = _snapshot_total(result)
    if existing is None:
        existing = ScoreSnapshot(goal_id=goal.id, snapshot_date=today)
        db.add(existing)

    existing.pace = Decimal(str(round(result.breakdown.pace, 4)))
    existing.consistency = Decimal(str(round(result.breakdown.consistency, 4)))
    existing.momentum = Decimal(str(round(result.breakdown.momentum, 4)))
    existing.effort = Decimal(str(round(result.breakdown.effort, 4)))
    existing.total = total

    db.flush()
    return result


def update_numeric_current_value(db: Session, goal: Goal) -> None:
    """Keep `current_value` as "the latest absolute reading" (see
    app/models/goal.py's docstring): whichever check-in has the most recent
    `logged_for` (ties broken by `created_at`, i.e. whichever was logged
    last) wins, regardless of insert/delete order. With no valued check-ins
    it is the goal's start_value (0 for a goal without one), i.e. "no
    progress yet" -- not 0, which on a decrease goal (start 32, target 28)
    would read as over-achieved. Only meaningful for numeric goals; a no-op
    otherwise.
    """
    if goal.type != GoalType.NUMERIC:
        return

    rows = [c for c in load_check_ins(db, goal.id) if c.value is not None]
    if not rows:
        goal.current_value = goal.start_value if goal.start_value is not None else Decimal("0")
        return

    latest = max(rows, key=lambda c: (c.logged_for, c.created_at))
    goal.current_value = latest.value


def recalc_goal(db: Session, goal: Goal, today: Optional[date] = None) -> SGoalScore:
    """Convenience: update numeric current_value (if applicable) then
    recalc + upsert the snapshot. The one function routers should call after
    any check-in or milestone mutation.
    """
    update_numeric_current_value(db, goal)
    return recalc_and_upsert_snapshot(db, goal, today)


__all__ = [
    "to_scoring_goal",
    "to_scoring_check_in",
    "to_scoring_milestone",
    "load_check_ins",
    "load_milestones",
    "score_goal_as_of",
    "compute_live_score",
    "recalc_and_upsert_snapshot",
    "update_numeric_current_value",
    "recalc_goal",
]
