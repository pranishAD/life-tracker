"""GET /goals/{goalId}/score, GET /goals/{goalId}/score-history
(docs/api-contract.yaml `scoring` tag, US-13, EC-07/EC-08).
"""

from __future__ import annotations

import uuid
from datetime import date, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.deps import get_current_user
from app.errors import validation_error
from app.models import GoalStatus, ScoreSnapshot, User
from app.schemas.scoring import GoalScoreOut, ScoreSnapshotOut
from app.services.resources import get_owned_goal
from app.services.scoring_service import compute_live_score
from db.session import get_session

_ALLOWED_DAYS = {7, 30}

router = APIRouter(tags=["scoring"])


@router.get("/goals/{goalId}/score", response_model=GoalScoreOut)
def get_goal_score(
    goalId: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
) -> GoalScoreOut:
    goal = get_owned_goal(db, current_user.id, goalId)
    result = compute_live_score(db, goal, date.today())

    total = None if result.grade == "Calibrating" else result.total
    return GoalScoreOut(
        goal_id=goal.id,
        pace=result.breakdown.pace,
        consistency=result.breakdown.consistency,
        momentum=result.breakdown.momentum,
        effort=result.breakdown.effort,
        total=total,
        grade=result.grade,
        is_frozen=goal.status == GoalStatus.COMPLETED,
    )


@router.get("/goals/{goalId}/score-history", response_model=list[ScoreSnapshotOut])
def get_goal_score_history(
    goalId: uuid.UUID,
    days: int = Query(default=30),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
) -> list[ScoreSnapshot]:
    if days not in _ALLOWED_DAYS:
        raise validation_error("days must be 7 or 30.")

    goal = get_owned_goal(db, current_user.id, goalId)
    window_start = date.today() - timedelta(days=days - 1)

    stmt = (
        select(ScoreSnapshot)
        .where(ScoreSnapshot.goal_id == goal.id, ScoreSnapshot.snapshot_date >= window_start)
        .order_by(ScoreSnapshot.snapshot_date.asc())
    )
    return list(db.scalars(stmt).all())
