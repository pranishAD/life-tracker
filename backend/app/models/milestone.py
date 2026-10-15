from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Boolean, CheckConstraint, Date, DateTime, ForeignKey, Index, String, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, TimestampMixin

if TYPE_CHECKING:
    from .goal import Goal


class Milestone(TimestampMixin, Base):
    __tablename__ = "milestones"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    goal_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("goals.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    due_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    is_done: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
    # Timestamptz (not date): scoring engine's momentum windows compare
    # done_at against 7-day date windows (formulas.py `_window_activity`
    # does `window_start <= m.done_at <= window_end` after backend-dev
    # converts to `.date()` per scoring README Interpretation #7), so the
    # precise moment is kept here and narrowed to a date only at the
    # scoring-engine call site.
    done_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    goal: Mapped["Goal"] = relationship(back_populates="milestones")

    __table_args__ = (
        Index("ix_milestones_goal_id", "goal_id"),
        # A milestone marked done must record when. Deliberately one-directional
        # (un-marking is_done back to False does NOT require the API to null
        # out done_at) so "completed then reopened" history isn't destroyed by
        # the constraint; if backend-dev wants done_at cleared on reopen,
        # that's a service-layer choice, not a DB one.
        CheckConstraint("NOT is_done OR done_at IS NOT NULL", name="ck_milestones_done_requires_done_at"),
    )

    def __repr__(self) -> str:  # pragma: no cover
        return f"Milestone(id={self.id!r}, title={self.title!r}, is_done={self.is_done!r})"
