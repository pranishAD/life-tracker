"""Plain data types used by the scoring engine.

These are deliberately independent of the SQLAlchemy models in backend/app/models/.
The scoring engine only ever sees plain data (dataclasses), never ORM objects or
database sessions, so it stays pure and trivially testable.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from enum import Enum
from typing import Optional


class GoalType(str, Enum):
    NUMERIC = "numeric"
    HABIT = "habit"
    MILESTONE = "milestone"


class GoalStatus(str, Enum):
    ACTIVE = "active"
    COMPLETED = "completed"
    ARCHIVED = "archived"


@dataclass(frozen=True)
class Goal:
    """Everything the scoring engine needs to know about a goal.

    `created_at` and `start_date` are plain `date` values (the caller converts any
    datetime to a date before calling in). `target_value`/`current_value` are used
    by numeric goals, `frequency_per_week` by habit goals (and optionally as a
    fallback expectation for numeric/milestone goals, see README "Interpretations").
    """

    type: GoalType
    status: GoalStatus
    start_date: date
    created_at: date
    target_value: Optional[float] = None
    current_value: Optional[float] = None
    frequency_per_week: Optional[float] = None
    deadline: Optional[date] = None
    weight: float = 1.0


@dataclass(frozen=True)
class CheckIn:
    logged_for: date
    effort_rating: Optional[int] = None  # 1-5
    value: Optional[float] = None


@dataclass(frozen=True)
class Milestone:
    is_done: bool
    done_at: Optional[date] = None


@dataclass(frozen=True)
class ScoreBreakdown:
    """The four factors, each already in [0.0, 1.0]."""

    pace: float
    consistency: float
    momentum: float
    effort: float


@dataclass(frozen=True)
class GoalScore:
    """Result of scoring a single goal."""

    breakdown: ScoreBreakdown
    total: int  # 0-100
    grade: str  # "S" | "A" | "B" | "C" | "D" | "Calibrating"
    grade_label: str  # "Locked In" | "Strong" | "On Track" | "Slipping" | "Off Track" | "Calibrating"
    current_streak: int
    best_streak: int


@dataclass(frozen=True)
class Grade:
    letter: str
    label: str


@dataclass(frozen=True)
class WeightedScore:
    """A single goal's score + weight, for folding into a category score."""

    score: int
    weight: float = 1.0


@dataclass(frozen=True)
class CategoryScoreInput:
    """A single category's score + weight, for folding into the overall score.

    `score` is `None` when the category has no eligible (active/completed) goals;
    `overall_score` excludes it entirely rather than treating it as 0.
    """

    category: str
    score: Optional[int]
    weight: float = 1.0


__all__ = [
    "GoalType",
    "GoalStatus",
    "Goal",
    "CheckIn",
    "Milestone",
    "ScoreBreakdown",
    "GoalScore",
    "Grade",
    "WeightedScore",
    "CategoryScoreInput",
]
