"""GET /dashboard (docs/api-contract.yaml `dashboard` tag, US-15, EC-09/EC-10)."""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.deps import get_current_user
from app.errors import validation_error
from app.models import User
from app.schemas.dashboard import DashboardOut
from app.services.dashboard_service import build_dashboard
from db.session import get_session

router = APIRouter(tags=["dashboard"])

_ALLOWED_TREND_DAYS = {7, 30}


@router.get("/dashboard", response_model=DashboardOut)
def get_dashboard(
    trend_days: int = Query(default=7),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
) -> DashboardOut:
    if trend_days not in _ALLOWED_TREND_DAYS:
        raise validation_error("trend_days must be 7 or 30.")

    data = build_dashboard(db, current_user, trend_days, date.today())
    return DashboardOut(
        overall_score=data.overall_score,
        overall_grade=data.overall_grade,
        category_scores=data.category_scores,
        current_streak_days=data.current_streak_days,
        best_streak_days=data.best_streak_days,
        trend=data.trend,
        attention=data.attention,
    )
