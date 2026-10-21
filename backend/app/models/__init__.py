"""SQLAlchemy 2.0 ORM models for Life Tracker.

Import surface for the rest of the backend, e.g.:

    from app.models import Base, User, Category, Goal, Milestone, CheckIn, ScoreSnapshot, CategoryWeight, JournalEntry
    from app.models import GoalType, GoalStatus, IdentityColor, NumericDirection, FrequencyType
    from app.models import DEFAULT_CATEGORIES

`Category` is the per-user categories table model (since migration 0003);
the old fixed Category enum no longer exists.

`Base.metadata` is what `backend/db/migrations/env.py` uses as
`target_metadata` for Alembic autogenerate diffing.
"""

from .base import Base, CreatedAtMixin, TimestampMixin
from .category import DEFAULT_CATEGORIES, DEFAULT_KEYS, Category, DefaultCategory
from .category_weight import CategoryWeight
from .check_in import CheckIn
from .enums import FrequencyType, GoalStatus, GoalType, IdentityColor, NumericDirection
from .goal import Goal
from .journal_entry import JournalEntry
from .milestone import Milestone
from .score_snapshot import ScoreSnapshot
from .user import User

__all__ = [
    "Base",
    "TimestampMixin",
    "CreatedAtMixin",
    "GoalType",
    "GoalStatus",
    "IdentityColor",
    "NumericDirection",
    "FrequencyType",
    "DEFAULT_CATEGORIES",
    "DEFAULT_KEYS",
    "DefaultCategory",
    "User",
    "Category",
    "Goal",
    "Milestone",
    "CheckIn",
    "ScoreSnapshot",
    "CategoryWeight",
    "JournalEntry",
]
