"""GET/POST /goals, GET/PATCH/DELETE /goals/{goalId}
(docs/api-contract.yaml 1.1.0 `goals` tag, US-04/05/06/07, EC-04/EC-05,
screens 10-11b).

Type rules shared by create and PATCH live in app/services/goal_rules.py.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.deps import get_current_user
from app.errors import conflict, validation_error
from app.models import CheckIn, Goal, GoalStatus, GoalType, Milestone, User
from app.schemas.goals import (
    NON_NULLABLE_UPDATE_FIELDS,
    GoalCreateRequest,
    GoalOut,
    GoalUpdateRequest,
    build_goal_out,
)
from app.services.categories import require_owned_category_for_goal
from app.services.goal_rules import GoalTypeFields, clear_for_type_change, resolve, to_decimal
from app.services.resources import get_owned_goal
from app.services.scoring_service import recalc_goal
from db.session import get_session

router = APIRouter(tags=["goals"])

_TYPE_FIELDS = (
    "start_value",
    "target_value",
    "unit",
    "direction",
    "frequency_type",
    "frequency_per_week",
    "weekdays",
)


def check_in_counts(db: Session, goal_ids: list[uuid.UUID]) -> dict[uuid.UUID, int]:
    if not goal_ids:
        return {}
    rows = db.execute(
        select(CheckIn.goal_id, func.count(CheckIn.id))
        .where(CheckIn.goal_id.in_(goal_ids))
        .group_by(CheckIn.goal_id)
    ).all()
    return {goal_id: count for goal_id, count in rows}


def goal_out(db: Session, goal: Goal) -> GoalOut:
    return build_goal_out(goal, check_in_counts(db, [goal.id]).get(goal.id, 0))


def _sent(provided: dict) -> set[str]:
    return {name for name, value in provided.items() if value is not None}


def _apply_type_fields(goal: Goal, fields: GoalTypeFields) -> None:
    goal.type = fields.type
    goal.start_value = fields.start_value
    goal.target_value = fields.target_value
    goal.current_value = fields.current_value
    goal.unit = fields.unit
    goal.direction = fields.direction
    goal.frequency_type = fields.frequency_type
    goal.frequency_per_week = fields.frequency_per_week
    goal.weekdays = fields.weekdays
    goal.start_date = fields.start_date
    goal.deadline = fields.deadline


@router.get("/goals", response_model=list[GoalOut])
def list_goals(
    category_id: Optional[uuid.UUID] = Query(default=None),
    status: Optional[GoalStatus] = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
) -> list[GoalOut]:
    # Filtering on user_id too means an unknown / other user's category_id
    # simply matches nothing -> empty list (contract), never a leak.
    stmt = select(Goal).where(Goal.user_id == current_user.id)
    if category_id is not None:
        stmt = stmt.where(Goal.category_id == category_id)
    if status is not None:
        stmt = stmt.where(Goal.status == status)
    stmt = stmt.order_by(Goal.created_at.desc(), Goal.id)
    goals = list(db.scalars(stmt).all())
    counts = check_in_counts(db, [g.id for g in goals])
    return [build_goal_out(g, counts.get(g.id, 0)) for g in goals]


@router.post("/goals", response_model=GoalOut, status_code=201)
def create_goal(
    payload: GoalCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
) -> GoalOut:
    provided = payload.model_dump(exclude_unset=True)
    sent = _sent(provided)

    category = require_owned_category_for_goal(db, current_user.id, payload.category_id)

    if payload.type == GoalType.MILESTONE and payload.deadline is None:
        raise validation_error("deadline is required for milestone goals.")
    if payload.milestones and payload.type != GoalType.MILESTONE:
        raise validation_error("milestones are only allowed on milestone goals.")

    fields = GoalTypeFields(
        type=payload.type,
        start_value=to_decimal(payload.start_value),
        target_value=to_decimal(payload.target_value),
        current_value=None,
        unit=payload.unit,
        direction=payload.direction,
        frequency_type=payload.frequency_type,
        frequency_per_week=payload.frequency_per_week,
        weekdays=list(payload.weekdays) if payload.weekdays is not None else None,
        start_date=payload.start_date,
        deadline=payload.deadline,
    )
    resolve(fields, sent)
    # New numeric goals start at their start value (contract Goal.current_value).
    if fields.type == GoalType.NUMERIC:
        fields.current_value = fields.start_value

    goal = Goal(
        user_id=current_user.id,
        title=payload.title,
        description=payload.description,
        category_id=category.id,
        emoji=payload.emoji,
        color=payload.color,
        why=payload.why,
        weight=Decimal(str(payload.weight)),
        status=GoalStatus.ACTIVE,
    )
    _apply_type_fields(goal, fields)
    db.add(goal)
    db.flush()

    # Starter subtasks keep request order: Goal.milestones orders by
    # (due_date, created_at, id), and now() is constant within a
    # transaction, so each gets clock_timestamp() in its own INSERT.
    for item in payload.milestones:
        db.add(
            Milestone(
                goal_id=goal.id,
                title=item.title,
                due_date=item.due_date,
                created_at=func.clock_timestamp(),
            )
        )
        db.flush()

    db.commit()
    db.refresh(goal)

    recalc_goal(db, goal)
    db.commit()
    db.refresh(goal)
    return goal_out(db, goal)


@router.get("/goals/{goalId}", response_model=GoalOut)
def get_goal(
    goalId: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
) -> GoalOut:
    return goal_out(db, get_owned_goal(db, current_user.id, goalId))


@router.patch("/goals/{goalId}", response_model=GoalOut)
def update_goal(
    goalId: uuid.UUID,
    payload: GoalUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
) -> GoalOut:
    goal = get_owned_goal(db, current_user.id, goalId)

    provided = payload.model_dump(exclude_unset=True)
    if not provided:
        raise validation_error("At least one field is required.")
    for name in NON_NULLABLE_UPDATE_FIELDS:
        if name in provided and provided[name] is None:
            raise validation_error(f"{name} cannot be null.")
    sent = _sent(provided)

    if "type" in provided and payload.type != goal.type:
        if check_in_counts(db, [goal.id]).get(goal.id, 0) > 0:
            raise conflict(
                "TYPE_LOCKED", "Type can't change once a goal has check-ins."
            )

    category_id = goal.category_id
    if "category_id" in provided:
        category_id = require_owned_category_for_goal(
            db, current_user.id, payload.category_id
        ).id

    # Merge: stored values, then the old type's fields cleared on a type
    # change, then whatever the request sent (null included) on top.
    old_type = goal.type
    fields = GoalTypeFields(
        type=payload.type if "type" in provided else goal.type,
        start_value=goal.start_value,
        target_value=goal.target_value,
        current_value=goal.current_value,
        unit=goal.unit,
        direction=goal.direction,
        frequency_type=goal.frequency_type,
        frequency_per_week=goal.frequency_per_week,
        weekdays=list(goal.weekdays) if goal.weekdays is not None else None,
        start_date=goal.start_date,
        deadline=goal.deadline,
    )
    clear_for_type_change(fields, old_type, sent)
    for name in _TYPE_FIELDS + ("start_date", "deadline"):
        if name in provided:
            value = provided[name]
            if name in ("start_value", "target_value"):
                value = to_decimal(value)
            elif name == "weekdays" and value is not None:
                value = list(value)
            setattr(fields, name, value)
    # A stored direction is never "sent": re-derive unless the request has one.
    if "direction" not in sent:
        fields.direction = None
    resolve(fields, sent)

    _apply_type_fields(goal, fields)
    goal.category_id = category_id
    for name in ("title", "description", "emoji", "color", "why"):
        if name in provided:
            setattr(goal, name, provided[name])
    if "weight" in provided:
        goal.weight = Decimal(str(payload.weight))
    if "status" in provided:
        if payload.status == GoalStatus.ARCHIVED:
            if goal.status != GoalStatus.ARCHIVED or goal.archived_at is None:
                goal.archived_at = datetime.now(timezone.utc)
        else:
            goal.archived_at = None
        goal.status = payload.status

    db.add(goal)
    db.commit()
    db.refresh(goal)

    # Also resets current_value to start_value when a numeric goal has no
    # valued check-ins (e.g. start_value edited, or type changed to numeric).
    recalc_goal(db, goal)
    db.commit()
    db.refresh(goal)
    return goal_out(db, goal)


@router.delete("/goals/{goalId}", status_code=204)
def delete_goal(
    goalId: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
) -> Response:
    goal = get_owned_goal(db, current_user.id, goalId)
    db.delete(goal)
    db.commit()
    return Response(status_code=204)
