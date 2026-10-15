"""POST /goals/{goalId}/milestones, PATCH/DELETE /milestones/{milestoneId}
(docs/api-contract.yaml `milestones` tag, US-10).
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.deps import get_current_user
from app.errors import validation_error
from app.models import Milestone, User
from app.schemas.milestones import MilestoneCreateRequest, MilestoneOut, MilestoneUpdateRequest
from app.services.resources import get_owned_goal, get_owned_milestone
from app.services.scoring_service import recalc_goal
from db.session import get_session

router = APIRouter(tags=["milestones"])


@router.post("/goals/{goalId}/milestones", response_model=MilestoneOut, status_code=201)
def create_milestone(
    goalId: uuid.UUID,
    payload: MilestoneCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
) -> Milestone:
    goal = get_owned_goal(db, current_user.id, goalId)

    milestone = Milestone(goal_id=goal.id, title=payload.title, due_date=payload.due_date)
    db.add(milestone)
    db.commit()
    db.refresh(milestone)

    recalc_goal(db, goal)
    db.commit()
    db.refresh(milestone)
    return milestone


@router.patch("/milestones/{milestoneId}", response_model=MilestoneOut)
def update_milestone(
    milestoneId: uuid.UUID,
    payload: MilestoneUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
) -> Milestone:
    milestone = get_owned_milestone(db, current_user.id, milestoneId)

    provided = payload.model_dump(exclude_unset=True)
    if not provided:
        raise validation_error("At least one field is required.")

    if "title" in provided:
        milestone.title = payload.title
    if "due_date" in provided:
        milestone.due_date = payload.due_date
    if "is_done" in provided:
        going_done = bool(payload.is_done)
        milestone.is_done = going_done
        # One-directional (see app/models/milestone.py): completing sets
        # done_at; un-completing deliberately leaves done_at as history.
        if going_done and milestone.done_at is None:
            milestone.done_at = datetime.now(timezone.utc)

    db.add(milestone)
    db.commit()
    db.refresh(milestone)

    goal = get_owned_goal(db, current_user.id, milestone.goal_id)
    recalc_goal(db, goal)
    db.commit()
    db.refresh(milestone)
    return milestone


@router.delete("/milestones/{milestoneId}", status_code=204)
def delete_milestone(
    milestoneId: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
) -> Response:
    milestone = get_owned_milestone(db, current_user.id, milestoneId)
    goal_id = milestone.goal_id
    db.delete(milestone)
    db.commit()

    goal = get_owned_goal(db, current_user.id, goal_id)
    recalc_goal(db, goal)
    db.commit()
    return Response(status_code=204)
