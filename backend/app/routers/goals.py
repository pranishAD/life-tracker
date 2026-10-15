"""GET/POST /goals, GET/PATCH/DELETE /goals/{goalId}
(docs/api-contract.yaml `goals` tag, US-04/05/06/07, EC-04/EC-05).
"""

from __future__ import annotations

import uuid
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.deps import get_current_user
from app.errors import validation_error
from app.models import Category, Goal, GoalStatus, GoalType, User
from app.schemas.goals import GoalCreateRequest, GoalOut, GoalUpdateRequest
from app.services.resources import get_owned_goal
from app.services.scoring_service import recalc_goal
from db.session import get_session

router = APIRouter(tags=["goals"])


@router.get("/goals", response_model=list[GoalOut])
def list_goals(
    category: Optional[Category] = Query(default=None),
    status: Optional[GoalStatus] = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
) -> list[Goal]:
    stmt = select(Goal).where(Goal.user_id == current_user.id)
    if category is not None:
        stmt = stmt.where(Goal.category == category)
    if status is not None:
        stmt = stmt.where(Goal.status == status)
    stmt = stmt.order_by(Goal.created_at.desc())
    return list(db.scalars(stmt).all())


@router.post("/goals", response_model=GoalOut, status_code=201)
def create_goal(
    payload: GoalCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
) -> Goal:
    goal = Goal(
        user_id=current_user.id,
        title=payload.title,
        description=payload.description,
        category=payload.category,
        type=payload.type,
        target_value=Decimal(str(payload.target_value)) if payload.target_value is not None else None,
        # 0 until first check-in (api-contract.yaml Goal.current_value) --
        # only meaningful for numeric goals.
        current_value=Decimal("0") if payload.type == GoalType.NUMERIC else None,
        unit=payload.unit,
        frequency_per_week=payload.frequency_per_week,
        start_date=payload.start_date,
        deadline=payload.deadline,
        weight=Decimal(str(payload.weight)),
        status=GoalStatus.ACTIVE,
    )
    db.add(goal)
    db.commit()
    db.refresh(goal)

    recalc_goal(db, goal)
    db.commit()
    db.refresh(goal)
    return goal


@router.get("/goals/{goalId}", response_model=GoalOut)
def get_goal(
    goalId: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
) -> Goal:
    return get_owned_goal(db, current_user.id, goalId)


@router.patch("/goals/{goalId}", response_model=GoalOut)
def update_goal(
    goalId: uuid.UUID,
    payload: GoalUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
) -> Goal:
    goal = get_owned_goal(db, current_user.id, goalId)

    provided = payload.model_dump(exclude_unset=True)
    if not provided:
        raise validation_error("At least one field is required.")

    if "target_value" in provided and provided["target_value"] is None and goal.type == GoalType.NUMERIC:
        raise validation_error("target_value is required for numeric goals.")
    if (
        "frequency_per_week" in provided
        and provided["frequency_per_week"] is None
        and goal.type == GoalType.HABIT
    ):
        raise validation_error("frequency_per_week is required for habit goals.")

    if "title" in provided:
        goal.title = payload.title
    if "description" in provided:
        goal.description = payload.description
    if "category" in provided:
        goal.category = payload.category
    if "target_value" in provided:
        goal.target_value = Decimal(str(payload.target_value)) if payload.target_value is not None else None
    if "unit" in provided:
        goal.unit = payload.unit
    if "frequency_per_week" in provided:
        goal.frequency_per_week = payload.frequency_per_week
    if "deadline" in provided:
        goal.deadline = payload.deadline
    if "weight" in provided:
        goal.weight = Decimal(str(payload.weight))
    if "status" in provided:
        goal.status = payload.status

    db.add(goal)
    db.commit()
    db.refresh(goal)

    recalc_goal(db, goal)
    db.commit()
    db.refresh(goal)
    return goal


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
