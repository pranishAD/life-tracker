from __future__ import annotations

import uuid
from typing import TYPE_CHECKING, Optional

from sqlalchemy import CheckConstraint, ForeignKey, Index, SmallInteger, String, Text, text
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, TimestampMixin

if TYPE_CHECKING:
    from .user import User


class JournalEntry(TimestampMixin, Base):
    """Free-form journal entry. Purely user-facing: NOT an input to scoring
    (backend/scoring never reads this table).

    `created_at` doubles as the entry's "written at" time (no separate
    entry_at column, by product decision), so the list/timeline query is
    `WHERE user_id = ? ORDER BY created_at DESC` -- served by the composite
    index below.
    """

    __tablename__ = "journal_entries"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    mood: Mapped[Optional[int]] = mapped_column(SmallInteger, nullable=True)
    # Tags live inline as text[] rather than a tags/entry_tags join table (by
    # product decision): a handful of short labels per entry, no tag-level
    # metadata, and "entries with tag X" can be answered with
    # `'gym' = ANY(tags)` / `tags @> ARRAY['gym']`. NOT NULL with an empty
    # array default so the API never has to distinguish NULL from [].
    # If tag filtering ever gets hot, add a GIN index on `tags` in a new
    # migration -- not needed at v1 data volumes.
    tags: Mapped[list[str]] = mapped_column(
        ARRAY(Text), nullable=False, server_default=text("'{}'")
    )

    user: Mapped["User"] = relationship(back_populates="journal_entries")

    __table_args__ = (
        # Journal list/timeline query: one user's entries, newest first.
        # A btree on (user_id, created_at) is scanned backward for DESC order.
        Index("ix_journal_entries_user_id_created_at", "user_id", "created_at"),
        CheckConstraint(
            "mood IS NULL OR mood BETWEEN 1 AND 5", name="ck_journal_entries_mood_range"
        ),
    )

    def __repr__(self) -> str:  # pragma: no cover
        return f"JournalEntry(id={self.id!r}, user_id={self.user_id!r}, title={self.title!r})"
