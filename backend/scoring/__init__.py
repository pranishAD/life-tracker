"""Life Tracker scoring engine: pure functions, no DB/FastAPI/IO.

See backend/scoring/README.md for the full public API, a worked example, and
the "Interpretations" section documenting rules chosen where
docs/master-plan.md section 4 was ambiguous.
"""

from .engine import category_score, goal_score, overall_score, score_goal
from .formulas import (
    best_streak,
    consistency,
    current_streak,
    effort,
    grade,
    is_calibrating,
    is_scorable_status,
    momentum,
    pace,
)
from .types import (
    CategoryScoreInput,
    CheckIn,
    Goal,
    GoalScore,
    GoalStatus,
    GoalType,
    Grade,
    Milestone,
    ScoreBreakdown,
    WeightedScore,
)

__all__ = [
    # engine
    "score_goal",
    "goal_score",
    "category_score",
    "overall_score",
    # formulas
    "pace",
    "consistency",
    "momentum",
    "effort",
    "grade",
    "is_calibrating",
    "is_scorable_status",
    "current_streak",
    "best_streak",
    # types
    "Goal",
    "GoalType",
    "GoalStatus",
    "CheckIn",
    "Milestone",
    "ScoreBreakdown",
    "GoalScore",
    "Grade",
    "WeightedScore",
    "CategoryScoreInput",
]
