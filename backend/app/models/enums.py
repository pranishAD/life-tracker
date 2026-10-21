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


class IdentityColor(str, enum.Enum):
    """design/tokens.json colors.identity. Tints only, never grades."""

    SLATE = "slate"
    VIOLET = "violet"
    PURPLE = "purple"
    PINK = "pink"
    ROSE = "rose"
    SAND = "sand"
    LIME = "lime"
    TEAL = "teal"
    CYAN = "cyan"
    INDIGO = "indigo"


class NumericDirection(str, enum.Enum):
    INCREASE = "increase"
    DECREASE = "decrease"


class FrequencyType(str, enum.Enum):
    DAILY = "daily"
    PER_WEEK = "per_week"
    WEEKDAYS = "weekdays"


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
# below. Imported by app/models/goal.py and app/models/category.py
# (same name -> SQLAlchemy only emits one `CREATE TYPE` per name per
# MetaData). Each Alembic migration defines its OWN literal copies of
# these (see migration docstrings) rather than importing them, so the
# migrations stay frozen snapshots even if these enums change later.
#
# The old fixed `Category` enum / `category_enum` type is gone since
# migration 0003: categories are now per-user rows (app/models/category.py).
identity_color_enum = PgEnum(
    IdentityColor, name="identity_color_enum", values_callable=_values, native_enum=True
)
numeric_direction_enum = PgEnum(
    NumericDirection, name="numeric_direction_enum", values_callable=_values, native_enum=True
)
frequency_type_enum = PgEnum(
    FrequencyType, name="frequency_type_enum", values_callable=_values, native_enum=True
)
goal_type_enum = PgEnum(
    GoalType, name="goal_type_enum", values_callable=_values, native_enum=True
)
goal_status_enum = PgEnum(
    GoalStatus, name="goal_status_enum", values_callable=_values, native_enum=True
)

__all__ = [
    "IdentityColor",
    "NumericDirection",
    "FrequencyType",
    "GoalType",
    "GoalStatus",
    "identity_color_enum",
    "numeric_direction_enum",
    "frequency_type_enum",
    "goal_type_enum",
    "goal_status_enum",
]
