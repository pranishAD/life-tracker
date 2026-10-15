"""Pydantic v2 schemas for the `dashboard` tag of docs/api-contract.yaml."""

from __future__ import annotations

import uuid
from datetime import date
from typing import Optional

from pydantic import BaseModel

from app.models import Category
from app.schemas.scoring import Grade


class CategoryScoreOut(BaseModel):
    category: Category
    score: Optional[int] = None
    has_active_goals: bool


class AttentionGoalOut(BaseModel):
    goal_id: uuid.UUID
    title: str
    score: Optional[int] = None
    reason: str


class TrendPointOut(BaseModel):
    date: date
    score: Optional[int] = None


class DashboardOut(BaseModel):
    overall_score: Optional[int] = None
    overall_grade: Grade
    category_scores: list[CategoryScoreOut]
    current_streak_days: int
    best_streak_days: int
    trend: list[TrendPointOut]
    attention: list[AttentionGoalOut]
