"""GET /internal/daily-snapshot (docs/api-contract.yaml `internal` tag).

Not user-facing: triggered once a day by Vercel Cron (GET only -- Vercel
Cron never sends POST, see docs/master-plan.md section 3 and
docs/decisions.md). Protected by comparing `Authorization: Bearer <token>`
against the server's CRON_SECRET env var -- a *separate* check from
`get_current_user` / user JWTs (see api-contract.yaml `cronAuth` security
scheme).

Serverless-safe by construction: a single request handler, no background
thread, no in-process scheduler (docs/master-plan.md section 3).
"""

from __future__ import annotations

import secrets
from datetime import date

from fastapi import APIRouter, Depends, Header
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.errors import unauthorized
from app.models import Goal, GoalStatus
from app.services.scoring_service import recalc_goal
from db.session import get_session

router = APIRouter(tags=["internal"])


def verify_cron_secret(authorization: str | None = Header(default=None)) -> None:
    settings = get_settings()
    # Fail closed when CRON_SECRET is empty; constant-time compare (SEC-007).
    if not settings.cron_secret:
        raise unauthorized("Missing or wrong CRON_SECRET.")
    expected = f"Bearer {settings.cron_secret}".encode("utf-8")
    provided = (authorization or "").encode("utf-8")
    if not secrets.compare_digest(provided, expected):
        raise unauthorized("Missing or wrong CRON_SECRET.")


@router.get("/internal/daily-snapshot", dependencies=[Depends(verify_cron_secret)])
def run_daily_snapshot(db: Session = Depends(get_session)) -> dict[str, int]:
    today = date.today()
    goals = db.scalars(select(Goal).where(Goal.status == GoalStatus.ACTIVE)).all()

    count = 0
    for goal in goals:
        recalc_goal(db, goal, today)
        count += 1
    db.commit()

    return {"snapshots_written": count}
