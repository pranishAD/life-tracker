from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import Index, String, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, TimestampMixin

if TYPE_CHECKING:
    from .category import Category
    from .category_weight import CategoryWeight
    from .goal import Goal
    from .journal_entry import JournalEntry


class User(TimestampMixin, Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    # Case preserved as typed; uniqueness is enforced case-insensitively by
    # the functional index below (not by a plain UNIQUE on this column).
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)

    goals: Mapped[list["Goal"]] = relationship(
        back_populates="user", cascade="all, delete-orphan", passive_deletes=True
    )
    categories: Mapped[list["Category"]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="(Category.sort_order, Category.created_at)",
    )
    category_weights: Mapped[list["CategoryWeight"]] = relationship(
        back_populates="user", cascade="all, delete-orphan", passive_deletes=True
    )
    journal_entries: Mapped[list["JournalEntry"]] = relationship(
        back_populates="user", cascade="all, delete-orphan", passive_deletes=True
    )

    __table_args__ = (
        # Case-insensitive unique email (US-01 EC: "email already registered"
        # should also catch Foo@x.com vs foo@x.com). A functional unique
        # index on lower(email) rather than the `citext` extension: same
        # guarantee, no extra extension to install/manage, and the column
        # stays plain `text` so backend-dev doesn't need anything special to
        # read/write it. Login lookups should filter by
        # `func.lower(User.email) == email.lower()` to hit this index.
        Index("ix_users_email_lower", text("lower(email)"), unique=True),
    )

    def __repr__(self) -> str:  # pragma: no cover
        return f"User(id={self.id!r}, email={self.email!r})"
