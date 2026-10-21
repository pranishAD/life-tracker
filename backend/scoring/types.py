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


class FrequencyType(str, Enum):
    """Habit check-in schedule (api-contract FrequencyType).

    - DAILY: every day, i.e. 7 per week (frequency_per_week is ignored).
    - PER_WEEK: frequency_per_week times a week, any days (legacy behaviour).
    - WEEKDAYS: only the ISO weekdays listed in `Goal.weekdays`; unscheduled
      days are never expected (frequency_per_week is ignored).

    `Goal.frequency_type = None` means "legacy" and behaves exactly like PER_WEEK.
    See README "Interpretations" 2 and 9.
    """

    DAILY = "daily"
    PER_WEEK = "per_week"
    WEEKDAYS = "weekdays"


@dataclass(frozen=True)
class Goal:
    """Everything the scoring engine needs to know about a goal.

    `created_at` and `start_date` are plain `date` values (the caller converts any
    datetime to a date before calling in). `target_value`/`current_value` are used
    by numeric goals, `frequency_per_week` by habit goals (and optionally as a
    fallback expectation for numeric/milestone goals, see README "Interpretations").

    Goal-customisation fields (all optional; their defaults reproduce the
    pre-customisation behaviour exactly):
    - `start_value`: numeric goals' starting point. None is treated as 0.
      Progress = (current - start) / (target - start), so a target below the
      start (a "decrease" goal) works by sign; no direction field is needed.
    - `frequency_type`: see `FrequencyType`. None = legacy (PER_WEEK).
    - `weekdays`: ISO weekdays (1=Mon..7=Sun), only used when
      frequency_type is WEEKDAYS.
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
    start_value: Optional[float] = None
    frequency_type: Optional[FrequencyType] = None
    weekdays: Optional[tuple[int, ...]] = None


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
    "FrequencyType",
    "Goal",
    "CheckIn",
    "Milestone",
    "ScoreBreakdown",
    "GoalScore",
    "Grade",
    "WeightedScore",
    "CategoryScoreInput",
]
