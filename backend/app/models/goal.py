from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal
from typing import TYPE_CHECKING, Optional

from sqlalchemy import CheckConstraint, Date, ForeignKey, Index, Integer, Numeric, String, Text, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, TimestampMixin
from .enums import Category, GoalStatus, GoalType, category_enum, goal_status_enum, goal_type_enum

if TYPE_CHECKING:
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
    category: Mapped[Category] = mapped_column(category_enum, nullable=False)
    type: Mapped[GoalType] = mapped_column(goal_type_enum, nullable=False)

    # Numeric goals. `current_value` is the latest absolute reading (e.g. the
    # heaviest lift logged so far), not a running sum of check-in deltas —
    # see backend/scoring/README.md "Interpretations" #1/#3. backend-dev:
    # set this to 0 at goal creation for numeric goals (API contract says
    # "0 until first check-in"); the DB leaves it NULL by default so
    # habit/milestone goals, which don't use it, aren't given a misleading 0.
    target_value: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2), nullable=True)
    current_value: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2), nullable=True)
    unit: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)

    # Habit goals (also usable as a consistency/pace fallback expectation for
    # numeric/milestone goals — scoring engine Interpretation #1/#2 — so this
    # is intentionally NOT constrained to `type = 'habit'` only).
    frequency_per_week: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    deadline: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    weight: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False, server_default=text("1"))
    status: Mapped[GoalStatus] = mapped_column(
        goal_status_enum, nullable=False, server_default=text("'active'::goal_status_enum")
    )

    user: Mapped["User"] = relationship(back_populates="goals")
    milestones: Mapped[list["Milestone"]] = relationship(
        back_populates="goal",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="Milestone.due_date",
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
        CheckConstraint("weight > 0", name="ck_goals_weight_positive"),
        CheckConstraint("target_value IS NULL OR target_value > 0", name="ck_goals_target_value_positive"),
        CheckConstraint(
            "frequency_per_week IS NULL OR frequency_per_week > 0",
            name="ck_goals_frequency_per_week_positive",
        ),
        # Type-matching constraints (deliverable #4): a numeric goal without a
        # target, or a habit goal without a frequency, can never be scored
        # meaningfully (scoring engine's `_progress_amounts`/`consistency`
        # fall back to "no target" behaviour, which is a silent product bug,
        # not a valid state). Deliberately NOT adding the symmetric "must be
        # NULL for other types" constraints: frequency_per_week is allowed on
        # any type (it's a documented pace/consistency fallback), and nothing
        # in the schema or scoring engine requires target_value/unit to be
        # NULL for habit/milestone goals. Milestone goals "need milestones"
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
    )

    def __repr__(self) -> str:  # pragma: no cover
        return f"Goal(id={self.id!r}, title={self.title!r}, type={self.type!r})"
