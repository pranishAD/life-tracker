from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import TYPE_CHECKING, Optional

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    Numeric,
    SmallInteger,
    String,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, TimestampMixin
from .enums import (
    FrequencyType,
    GoalStatus,
    GoalType,
    IdentityColor,
    NumericDirection,
    frequency_type_enum,
    goal_status_enum,
    goal_type_enum,
    identity_color_enum,
    numeric_direction_enum,
)

if TYPE_CHECKING:
    from .category import Category
    from .check_in import CheckIn
    from .milestone import Milestone
    from .score_snapshot import ScoreSnapshot
    from .user import User


class Goal(TimestampMixin, Base):
    __tablename__ = "goals"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Composite FK (user_id, category_id) -> categories (user_id, id), see
    # __table_args__: the DB guarantees the category belongs to the same user.
    category_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    # Identity overrides: NULL = use the category's emoji / colour.
    emoji: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)
    color: Mapped[Optional[IdentityColor]] = mapped_column(identity_color_enum, nullable=True)
    type: Mapped[GoalType] = mapped_column(goal_type_enum, nullable=False)

    # Numeric goals. `current_value` is the latest absolute reading (e.g. the
    # heaviest lift logged so far), not a running sum of check-in deltas —
    # see backend/scoring/README.md "Interpretations" #1/#3. backend-dev:
    # set this to start_value (default 0) at goal creation for numeric goals (API contract says
    # "0 until first check-in"); the DB leaves it NULL by default so
    # habit/milestone goals, which don't use it, aren't given a misleading 0.
    #
    # Since 0003: progress = (current - start) / (target - start), clamped
    # 0..1. `direction` is stored (not derived) because the API lets the user
    # send it, but the DB checks it agrees with start vs target. Goals created
    # before 0003 were backfilled with start_value 0 / increase, which makes
    # the new formula identical to the old current / target.
    start_value: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2), nullable=True)
    target_value: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2), nullable=True)
    current_value: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2), nullable=True)
    unit: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    direction: Mapped[Optional[NumericDirection]] = mapped_column(
        numeric_direction_enum, nullable=True
    )

    # Habit goals (also usable as a consistency/pace fallback expectation for
    # numeric/milestone goals — scoring engine Interpretation #1/#2 — so this
    # is intentionally NOT constrained to `type = 'habit'` only).
    frequency_per_week: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    # Habit schedule (since 0003). frequency_per_week stays the single number
    # scoring reads; for daily it must be 7 and for weekdays it must equal
    # cardinality(weekdays) (ck_goals_frequency_per_week_matches_schedule).
    frequency_type: Mapped[Optional[FrequencyType]] = mapped_column(
        frequency_type_enum, nullable=True
    )
    # ISO weekdays 1 = Mon .. 7 = Sun. smallint[] rather than a 7-bit mask:
    # readable in psql, maps straight to the API's JSON array, and
    # `3 = ANY(weekdays)` is as cheap as a bit test at this size. The DB
    # checks range/cardinality; sorted + no duplicates is the API's job (a
    # CHECK can't contain the subquery that would need).
    weekdays: Mapped[Optional[list[int]]] = mapped_column(ARRAY(SmallInteger), nullable=True)
    why: Mapped[Optional[str]] = mapped_column(String(140), nullable=True)

    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    deadline: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    weight: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False, server_default=text("1"))
    status: Mapped[GoalStatus] = mapped_column(
        goal_status_enum, nullable=False, server_default=text("'active'::goal_status_enum")
    )
    # Non-NULL exactly when status = 'archived' (ck_goals_archived_at_matches_status):
    # set it when archiving, clear it when un-archiving.
    archived_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    user: Mapped["User"] = relationship(back_populates="goals")
    # Join on both FK columns, but only category_id is ORM-"foreign":
    # user_id is owned by `user`. So `goal.category = c` sets category_id =
    # c.id and never rewrites user_id (the composite FK rejects a category
    # of another user).
    category: Mapped["Category"] = relationship(
        primaryjoin="and_(Goal.user_id == Category.user_id, "
        "foreign(Goal.category_id) == Category.id)",
    )
    milestones: Mapped[list["Milestone"]] = relationship(
        back_populates="goal",
        cascade="all, delete-orphan",
        passive_deletes=True,
        # NULLS LAST is Postgres's default for ASC, written out so it's
        # explicit; created_at then id keep subtasks with no due date (and
        # several created in one request) in insertion order. backend-dev:
        # insert starter subtasks with created_at = clock_timestamp() (now()
        # is constant inside a transaction, so they would all tie).
        order_by="(Milestone.due_date.asc().nulls_last(), Milestone.created_at, Milestone.id)",
    )
    check_ins: Mapped[list["CheckIn"]] = relationship(
        back_populates="goal", cascade="all, delete-orphan", passive_deletes=True
    )
    score_snapshots: Mapped[list["ScoreSnapshot"]] = relationship(
        back_populates="goal", cascade="all, delete-orphan", passive_deletes=True
    )

    __table_args__ = (
        # Required index (master-plan section 5): goals list filtered by
        # user + status is the dashboard/goals-list query shape.
        Index("ix_goals_user_id_status", "user_id", "status"),
        # Goals-by-category filter AND the index the composite FK check uses
        # when a category is deleted (Postgres does not index the
        # referencing side of a FK automatically).
        Index("ix_goals_user_id_category_id", "user_id", "category_id"),
        # RESTRICT: deleting a category that still has goals fails; the API
        # moves the goals first. Deleting a user still works (both cascades
        # run in one statement; verified on PG16).
        ForeignKeyConstraint(
            ["user_id", "category_id"],
            ["categories.user_id", "categories.id"],
            ondelete="RESTRICT",
            name="fk_goals_user_id_category_id_categories",
        ),
        CheckConstraint("weight > 0", name="ck_goals_weight_positive"),
        # Relaxed in 0003 from > 0: a decrease goal may target 0.
        CheckConstraint(
            "target_value IS NULL OR target_value >= 0", name="ck_goals_target_value_non_negative"
        ),
        CheckConstraint(
            "frequency_per_week IS NULL OR frequency_per_week > 0",
            name="ck_goals_frequency_per_week_positive",
        ),
        # Type-matching constraints (deliverable #4): a numeric goal without a
        # target, or a habit goal without a frequency, can never be scored
        # meaningfully (scoring engine's `_progress_amounts`/`consistency`
        # fall back to "no target" behaviour, which is a silent product bug,
        # not a valid state). frequency_per_week / target_value / unit have
        # no symmetric "must be NULL for other types" rule: frequency_per_week
        # is a documented pace/consistency fallback on any type, and nothing
        # requires target_value/unit to be NULL elsewhere. (The 0003 fields
        # start_value/direction/frequency_type/weekdays DO get symmetric
        # rules below -- they mean nothing outside their own type.) Milestone goals "need milestones"
        # is a cross-table rule (at least one row in `milestones`) that a
        # single-table CHECK can't express; enforcing it would need a
        # trigger, which felt like overkill for v1 — left to the API layer.
        CheckConstraint(
            "type <> 'numeric' OR target_value IS NOT NULL",
            name="ck_goals_numeric_requires_target_value",
        ),
        CheckConstraint(
            "type <> 'habit' OR frequency_per_week IS NOT NULL",
            name="ck_goals_habit_requires_frequency_per_week",
        ),
        # --- 0003 goal customisation (same list as the migration) ---------
        CheckConstraint(
            "emoji IS NULL OR char_length(emoji) BETWEEN 1 AND 16", name="ck_goals_emoji_length"
        ),
        CheckConstraint(
            "type <> 'numeric' OR (start_value IS NOT NULL AND direction IS NOT NULL)",
            name="ck_goals_numeric_requires_start_and_direction",
        ),
        # Symmetric rule, matching the contract ("non-numeric goals must not
        # send start_value/direction"). Unlike frequency_per_week, these have
        # no meaning outside numeric goals. If the type changes away from
        # numeric (allowed while there are no check-ins), null them.
        CheckConstraint(
            "type = 'numeric' OR (start_value IS NULL AND direction IS NULL)",
            name="ck_goals_start_direction_only_numeric",
        ),
        CheckConstraint(
            "start_value IS NULL OR start_value >= 0", name="ck_goals_start_value_non_negative"
        ),
        CheckConstraint(
            "type <> 'numeric' OR start_value <> target_value",
            name="ck_goals_numeric_start_differs_from_target",
        ),
        CheckConstraint(
            "direction IS NULL"
            " OR (direction = 'increase' AND target_value > start_value)"
            " OR (direction = 'decrease' AND target_value < start_value)",
            name="ck_goals_direction_matches_values",
        ),
        CheckConstraint(
            "type <> 'habit' OR frequency_type IS NOT NULL",
            name="ck_goals_habit_requires_frequency_type",
        ),
        CheckConstraint(
            "type = 'habit' OR frequency_type IS NULL", name="ck_goals_frequency_type_only_habit"
        ),
        # COALESCE: with frequency_type NULL a bare `=` yields NULL, and a
        # NULL CHECK passes -- that would let a non-habit carry weekdays.
        CheckConstraint(
            "COALESCE(frequency_type = 'weekdays', false) = (weekdays IS NOT NULL)",
            name="ck_goals_weekdays_iff_frequency_type_weekdays",
        ),
        CheckConstraint(
            "weekdays IS NULL OR ("
            "array_ndims(weekdays) = 1"
            " AND cardinality(weekdays) BETWEEN 1 AND 7"
            " AND weekdays <@ ARRAY[1,2,3,4,5,6,7]::smallint[])",
            name="ck_goals_weekdays_values",
        ),
        CheckConstraint(
            "frequency_type IS NULL OR frequency_type = 'per_week'"
            " OR (frequency_type = 'daily' AND frequency_per_week = 7)"
            " OR (frequency_type = 'weekdays' AND frequency_per_week = cardinality(weekdays))",
            name="ck_goals_frequency_per_week_matches_schedule",
        ),
        CheckConstraint("why IS NULL OR char_length(why) <= 140", name="ck_goals_why_length"),
        CheckConstraint(
            "(status = 'archived') = (archived_at IS NOT NULL)",
            name="ck_goals_archived_at_matches_status",
        ),
    )

    def __repr__(self) -> str:  # pragma: no cover
        return f"Goal(id={self.id!r}, title={self.title!r}, type={self.type!r})"
