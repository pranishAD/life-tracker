from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal
from typing import TYPE_CHECKING, Optional

from sqlalchemy import CheckConstraint, Date, ForeignKey, Index, Numeric, SmallInteger, Text, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, CreatedAtMixin

if TYPE_CHECKING:
    from .goal import Goal


class CheckIn(CreatedAtMixin, Base):
    __tablename__ = "check_ins"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    goal_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("goals.id", ondelete="CASCADE"), nullable=False
    )
    value: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2), nullable=True)
    note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Required by api-contract.yaml (CheckInCreateRequest.required includes
    # effort_rating) even though the master-plan prose calls it optional for
    # habit goals — the OpenAPI contract wins (section 5 note in master-plan
    # says db-architect finalises types; NOT NULL matches the contract).
    effort_rating: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    logged_for: Mapped[date] = mapped_column(Date, nullable=False)

    goal: Mapped["Goal"] = relationship(back_populates="check_ins")

    __table_args__ = (
        # Required index (master-plan section 5): check-in history and every
        # scoring-window query (pace/consistency/momentum/effort, all of
        # which scan check-ins by goal + date range) hit this.
        Index("ix_check_ins_goal_id_logged_for", "goal_id", "logged_for"),
        CheckConstraint("effort_rating BETWEEN 1 AND 5", name="ck_check_ins_effort_rating_range"),
    )

    def __repr__(self) -> str:  # pragma: no cover
        return f"CheckIn(id={self.id!r}, goal_id={self.goal_id!r}, logged_for={self.logged_for!r})"
