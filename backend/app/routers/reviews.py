"""GET /reviews/weekly (docs/api-contract.yaml `reviews` tag, US-17)."""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.deps import get_current_user
from app.models import User
from app.schemas.reviews import WeeklyReviewOut
from app.services.dashboard_service import build_weekly_review
from db.session import get_session

router = APIRouter(tags=["reviews"])


@router.get("/reviews/weekly", response_model=WeeklyReviewOut)
def get_weekly_review(
    week_start: date = Query(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
) -> WeeklyReviewOut:
    data = build_weekly_review(db, current_user, week_start, date.today())
    return WeeklyReviewOut(
        week_start=data.week_start,
        has_enough_history=data.has_enough_history,
        overall_score=data.overall_score,
        previous_week_score=data.previous_week_score,
        score_change=data.score_change,
        best_goal=data.best_goal,
        slipping_goal=data.slipping_goal,
    )
