from __future__ import annotations

import uuid
from typing import TYPE_CHECKING, NamedTuple, Optional

from sqlalchemy import CheckConstraint, ForeignKey, Index, Integer, String, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, TimestampMixin
from .enums import IdentityColor, identity_color_enum

if TYPE_CHECKING:
    from .category_weight import CategoryWeight
    from .goal import Goal
    from .user import User


class DefaultCategory(NamedTuple):
    default_key: str
    name: str
    emoji: str
    color: IdentityColor
    sort_order: int


# The 4 categories every user gets. backend-dev: insert these on register,
# e.g.
#     session.add_all(Category(user_id=user.id, **d._asdict()) for d in DEFAULT_CATEGORIES)
# Migration 0003 keeps its own frozen copy for backfilling existing users.
DEFAULT_CATEGORIES: tuple[DefaultCategory, ...] = (
    DefaultCategory("fitness", "Fitness", "\U0001F3C3", IdentityColor.TEAL, 0),  # runner
    DefaultCategory("study", "Study", "\U0001F4DA", IdentityColor.VIOLET, 1),  # books
    DefaultCategory("career", "Career", "\U0001F4BC", IdentityColor.INDIGO, 2),  # briefcase
    DefaultCategory("custom", "Custom", "✨", IdentityColor.SLATE, 3),  # sparkles
)

DEFAULT_KEYS: tuple[str, ...] = tuple(d.default_key for d in DEFAULT_CATEGORIES)


class Category(TimestampMixin, Base):
    """A user's goal category (replaces the fixed category_enum since 0003).

    `default_key` is non-NULL only for the 4 seeded defaults (value = the old
    enum value: fitness/study/career/custom). It's the stable identity of a
    default category even after the user renames it, and is what the API's
    `is_default` (renamable, never deletable) is derived from.
    """

    __tablename__ = "categories"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(24), nullable=False)
    emoji: Mapped[str] = mapped_column(String(16), nullable=False)
    color: Mapped[IdentityColor] = mapped_column(identity_color_enum, nullable=False)
    # 0-based display order. Deliberately NOT unique per user: a reorder
    # (PATCH /categories/order) rewrites every row, and a UNIQUE would need
    # to be DEFERRABLE to survive the intermediate states. The API owns
    # "contiguous 0..n-1"; ties are broken by created_at when reading.
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False)
    default_key: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)

    user: Mapped["User"] = relationship(back_populates="categories")
    # viewonly: goals are moved between categories by setting
    # Goal.category_id / Goal.category, never through this collection.
    # Deleting a category that still has goals is blocked by the DB (FK is
    # ON DELETE RESTRICT), so the API must move them first.
    goals: Mapped[list["Goal"]] = relationship(
        primaryjoin="and_(Category.user_id == foreign(Goal.user_id), "
        "Category.id == foreign(Goal.category_id))",
        viewonly=True,
    )
    # viewonly too: the DB's ON DELETE CASCADE removes a category's weight
    # row when the category is deleted; write weights via CategoryWeight.
    weights: Mapped[list["CategoryWeight"]] = relationship(
        primaryjoin="and_(Category.user_id == foreign(CategoryWeight.user_id), "
        "Category.id == foreign(CategoryWeight.category_id))",
        viewonly=True,
    )

    @property
    def is_default(self) -> bool:
        return self.default_key is not None

    __table_args__ = (
        # Target for the composite FKs from goals and category_weights
        # (user_id, category_id) -> categories (user_id, id). `id` alone is
        # already unique, so this is logically redundant, but a FK must
        # reference a unique constraint covering exactly the referenced
        # columns. Including user_id is what makes "a goal can only use its
        # own user's category" a DB-enforced fact rather than an API rule.
        UniqueConstraint("user_id", "id", name="uq_categories_user_id_id"),
        # At most one row per default key per user. NULLs are distinct in a
        # Postgres UNIQUE, so any number of custom (NULL-key) categories.
        UniqueConstraint("user_id", "default_key", name="uq_categories_user_id_default_key"),
        # Case-insensitive unique name per user (409 CATEGORY_NAME_TAKEN).
        Index("ix_categories_user_id_name_lower", "user_id", text("lower(name)"), unique=True),
        # List/picker query: WHERE user_id = ? ORDER BY sort_order.
        Index("ix_categories_user_id_sort_order", "user_id", "sort_order"),
        CheckConstraint("char_length(emoji) BETWEEN 1 AND 16", name="ck_categories_emoji_length"),
        CheckConstraint(
            "default_key IS NULL OR default_key IN ('fitness', 'study', 'career', 'custom')",
            name="ck_categories_default_key_values",
        ),
    )

    def __repr__(self) -> str:  # pragma: no cover
        return f"Category(id={self.id!r}, name={self.name!r}, default_key={self.default_key!r})"
