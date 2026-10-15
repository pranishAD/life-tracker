from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal
from typing import TYPE_CHECKING, Optional

from sqlalchemy import CheckConstraint, Date, ForeignKey, Integer, Numeric, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, CreatedAtMixin

if TYPE_CHECKING:
    from .goal import Goal


class ScoreSnapshot(CreatedAtMixin, Base):
    __tablename__ = "score_snapshots"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    goal_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("goals.id", ondelete="CASCADE"), nullable=False
    )
    snapshot_date: Mapped[date] = mapped_column(Date, nullable=False)

    # The four factors, each in [0, 1] -- Numeric(5,4) gives exact 4-decimal
    # storage (0.0000-1.0000) instead of float's binary-rounding surprises,
    # which matters here because GET /goals/{id}/score-history echoes these
    # back verbatim for the trend chart.
    pace: Mapped[Decimal] = mapped_column(Numeric(5, 4), nullable=False)
    consistency: Mapped[Decimal] = mapped_column(Numeric(5, 4), nullable=False)
    momentum: Mapped[Decimal] = mapped_column(Numeric(5, 4), nullable=False)
    effort: Mapped[Decimal] = mapped_column(Numeric(5, 4), nullable=False)

    # Nullable per api-contract.yaml ScoreSnapshot.total ("null while grade is
    # Calibrating"). backend/scoring/engine.score_goal always returns a
    # numeric `total` even for Calibrating goals (grade is a separate field);
    # it's a backend-dev service-layer choice whether to persist NULL for
    # calibrating-day snapshots or store the computed int and just not show
    # it as a "grade". backend/db/seed.py demonstrates storing NULL on
    # Calibrating days as one reasonable convention.
    total: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    goal: Mapped["Goal"] = relationship(back_populates="score_snapshots")

    __table_args__ = (
        # Required unique constraint (master-plan section 5): also backs the
        # required score_snapshots(goal_id, snapshot_date) index (a UNIQUE
        # constraint in Postgres is implemented as a unique index), so no
        # separate index is created.
        UniqueConstraint("goal_id", "snapshot_date", name="uq_score_snapshots_goal_id_snapshot_date"),
        CheckConstraint("pace BETWEEN 0 AND 1", name="ck_score_snapshots_pace_range"),
        CheckConstraint("consistency BETWEEN 0 AND 1", name="ck_score_snapshots_consistency_range"),
        CheckConstraint("momentum BETWEEN 0 AND 1", name="ck_score_snapshots_momentum_range"),
        CheckConstraint("effort BETWEEN 0 AND 1", name="ck_score_snapshots_effort_range"),
        CheckConstraint("total IS NULL OR total BETWEEN 0 AND 100", name="ck_score_snapshots_total_range"),
    )

    def __repr__(self) -> str:  # pragma: no cover
        return f"ScoreSnapshot(goal_id={self.goal_id!r}, snapshot_date={self.snapshot_date!r}, total={self.total!r})"
