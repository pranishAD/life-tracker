"""Pydantic v2 schemas for the `reviews` tag of docs/api-contract.yaml."""

from __future__ import annotations

import uuid
from datetime import date
from typing import Optional

from pydantic import BaseModel


class ReviewGoalOut(BaseModel):
    goal_id: uuid.UUID
    title: str
    score: int


class WeeklyReviewOut(BaseModel):
    week_start: date
    has_enough_history: bool
    overall_score: Optional[int] = None
    previous_week_score: Optional[int] = None
    score_change: Optional[int] = None
    best_goal: Optional[ReviewGoalOut] = None
    slipping_goal: Optional[ReviewGoalOut] = None
