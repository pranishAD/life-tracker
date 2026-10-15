"""SQLAlchemy 2.0 ORM models for Life Tracker.

Import surface for the rest of the backend, e.g.:

    from app.models import Base, User, Goal, Milestone, CheckIn, ScoreSnapshot, CategoryWeight
    from app.models import Category, GoalType, GoalStatus

`Base.metadata` is what `backend/db/migrations/env.py` uses as
`target_metadata` for Alembic autogenerate diffing.
"""

from .base import Base, CreatedAtMixin, TimestampMixin
from .category_weight import CategoryWeight
from .check_in import CheckIn
from .enums import Category, GoalStatus, GoalType
from .goal import Goal
from .milestone import Milestone
from .score_snapshot import ScoreSnapshot
from .user import User

__all__ = [
    "Base",
    "TimestampMixin",
    "CreatedAtMixin",
    "Category",
    "GoalType",
    "GoalStatus",
    "User",
    "Goal",
    "Milestone",
    "CheckIn",
    "ScoreSnapshot",
    "CategoryWeight",
]
