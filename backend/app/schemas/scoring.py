"""Pydantic v2 schemas for the `scoring` tag of docs/api-contract.yaml
(GoalScore, ScoreSnapshot).
"""

from __future__ import annotations

import uuid
from datetime import date
from typing import Literal, Optional

from pydantic import BaseModel

Grade = Literal["S", "A", "B", "C", "D", "Calibrating"]


class GoalScoreOut(BaseModel):
    goal_id: uuid.UUID
    pace: float
    consistency: float
    momentum: float
    effort: float
    total: Optional[int] = None
    grade: Grade
    is_frozen: bool


class ScoreSnapshotOut(BaseModel):
    snapshot_date: date
    pace: float
    consistency: float
    momentum: float
    effort: float
    total: Optional[int] = None
