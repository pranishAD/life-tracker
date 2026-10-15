"""Python enums + their PostgreSQL `ENUM` type counterparts.

These are intentionally separate from `backend/scoring/types.py`'s
`GoalType`/`GoalStatus` — the scoring engine is pure Python with zero
knowledge of SQLAlchemy/Postgres by design (see scoring/README.md). Both are
`str` subclasses with the same string values ("numeric"/"habit"/"milestone",
"active"/"completed"/"archived"), so a model enum member compares equal to
its scoring-engine counterpart (str.__eq__ compares by value), and
`goal.type.value` always gives you the plain string either way. See the
handoff note for how backend-dev should bridge the two.
"""

from __future__ import annotations

import enum

from sqlalchemy import Enum as PgEnum


class Category(str, enum.Enum):
    FITNESS = "fitness"
    STUDY = "study"
    CAREER = "career"
    CUSTOM = "custom"


class GoalType(str, enum.Enum):
    NUMERIC = "numeric"
    HABIT = "habit"
    MILESTONE = "milestone"


class GoalStatus(str, enum.Enum):
    ACTIVE = "active"
    COMPLETED = "completed"
    ARCHIVED = "archived"


def _values(e: type[enum.Enum]) -> list[str]:
    return [member.value for member in e]


# Single source of truth for the Postgres ENUM types backing the columns
# below. Imported by app/models/goal.py and app/models/category_weight.py
# (same name -> SQLAlchemy only emits one `CREATE TYPE` per name per
# MetaData). The initial Alembic migration defines its OWN literal copies of
# these (see migration docstring) rather than importing them, so the
# migration stays a frozen snapshot even if these enums change later.
category_enum = PgEnum(
    Category, name="category_enum", values_callable=_values, native_enum=True
)
goal_type_enum = PgEnum(
    GoalType, name="goal_type_enum", values_callable=_values, native_enum=True
)
goal_status_enum = PgEnum(
    GoalStatus, name="goal_status_enum", values_callable=_values, native_enum=True
)

__all__ = [
    "Category",
    "GoalType",
    "GoalStatus",
    "category_enum",
    "goal_type_enum",
    "goal_status_enum",
]
