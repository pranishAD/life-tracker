"""GET/POST /goals/{goalId}/check-ins, DELETE /check-ins/{checkInId}
(docs/api-contract.yaml `check-ins` tag, US-11/12, EC-02/EC-03).
"""

from __future__ import annotations

import uuid
from decimal import Decimal

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.deps import get_current_user
from app.models import CheckIn, User
from app.schemas.check_ins import CheckInCreateRequest, CheckInOut
from app.services.resources import get_owned_check_in, get_owned_goal
from app.services.scoring_service import recalc_goal
from db.session import get_session

router = APIRouter(tags=["check-ins"])


@router.get("/goals/{goalId}/check-ins", response_model=list[CheckInOut])
def list_check_ins(
    goalId: uuid.UUID,
    limit: int = Query(default=50, ge=1, le=200),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
) -> list[CheckIn]:
    goal = get_owned_goal(db, current_user.id, goalId)
    stmt = (
        select(CheckIn)
        .where(CheckIn.goal_id == goal.id)
        .order_by(CheckIn.logged_for.desc(), CheckIn.created_at.desc())
        .limit(limit)
    )
    return list(db.scalars(stmt).all())


@router.post("/goals/{goalId}/check-ins", response_model=CheckInOut, status_code=201)
def create_check_in(
    goalId: uuid.UUID,
    payload: CheckInCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
) -> CheckIn:
    goal = get_owned_goal(db, current_user.id, goalId)

    check_in = CheckIn(
        goal_id=goal.id,
        value=Decimal(str(payload.value)) if payload.value is not None else None,
        note=payload.note,
        effort_rating=payload.effort_rating,
        logged_for=payload.logged_for,
    )
    db.add(check_in)
    db.commit()
    db.refresh(check_in)

    recalc_goal(db, goal)
    db.commit()
    db.refresh(check_in)
    return check_in


@router.delete("/check-ins/{checkInId}", status_code=204)
def delete_check_in(
    checkInId: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
) -> Response:
    check_in = get_owned_check_in(db, current_user.id, checkInId)
    goal_id = check_in.goal_id
    db.delete(check_in)
    db.commit()

    goal = get_owned_goal(db, current_user.id, goal_id)
    recalc_goal(db, goal)
    db.commit()
    return Response(status_code=204)
