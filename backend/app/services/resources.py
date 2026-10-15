"""Ownership-scoped fetch helpers shared by routers.

Every route that operates on a goal/milestone/check-in must behave as if
other users' rows don't exist: `app.errors.not_found` (404), never
`forbidden` (403) -- see api-contract.yaml's NotFound response description.
"""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.errors import not_found
from app.models import CheckIn, Goal, Milestone


def get_owned_goal(db: Session, user_id: uuid.UUID, goal_id: uuid.UUID) -> Goal:
    goal = db.scalar(select(Goal).where(Goal.id == goal_id, Goal.user_id == user_id))
    if goal is None:
        raise not_found("Goal not found.")
    return goal


def get_owned_milestone(db: Session, user_id: uuid.UUID, milestone_id: uuid.UUID) -> Milestone:
    milestone = db.scalar(
        select(Milestone).join(Goal, Milestone.goal_id == Goal.id).where(
            Milestone.id == milestone_id, Goal.user_id == user_id
        )
    )
    if milestone is None:
        raise not_found("Milestone not found.")
    return milestone


def get_owned_check_in(db: Session, user_id: uuid.UUID, check_in_id: uuid.UUID) -> CheckIn:
    check_in = db.scalar(
        select(CheckIn).join(Goal, CheckIn.goal_id == Goal.id).where(
            CheckIn.id == check_in_id, Goal.user_id == user_id
        )
    )
    if check_in is None:
        raise not_found("Check-in not found.")
    return check_in


__all__ = ["get_owned_goal", "get_owned_milestone", "get_owned_check_in"]
