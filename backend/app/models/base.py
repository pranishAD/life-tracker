"""Shared declarative base + timestamp mixin for all ORM models.

Every table gets `created_at` (server-side `now()`). Tables whose rows are
edited after creation (users, goals, milestones, category_weights,
journal_entries) also get
`updated_at`, maintained by the DB on every UPDATE. Append-only tables
(check_ins, score_snapshots) only need `created_at` — there's no API route
that edits a check-in or a snapshot in place, so `updated_at` would never
change and would just be dead weight.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    """Declarative base shared by every model. `Base.metadata` is what
    Alembic's `env.py` uses as `target_metadata`.
    """


class TimestampMixin:
    """`created_at` / `updated_at`, both timestamptz, both server-managed."""

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class CreatedAtMixin:
    """Just `created_at`, for append-only tables (check_ins, score_snapshots)."""

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
