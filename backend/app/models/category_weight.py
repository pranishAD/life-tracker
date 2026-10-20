from __future__ import annotations

import uuid
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, ForeignKey, ForeignKeyConstraint, Numeric, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, TimestampMixin

if TYPE_CHECKING:
    from .category import Category
    from .user import User


class CategoryWeight(TimestampMixin, Base):
    """One row per (user, category) the user has an explicit weight for.

    A user with NO row for a category uses weight 1 for it (API contract:
    GET returns every category, weight 1 where none is stored) -- that
    default is applied by the service layer, not stored here. PUT
    /settings/category-weights upserts rows via the composite PK.

    Since 0003 the category is a per-user row: composite FK (user_id,
    category_id) -> categories (user_id, id) ON DELETE CASCADE, so a weight
    can only reference the same user's category and disappears with it.
    """

    __tablename__ = "category_weights"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    category_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    weight: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False, server_default=text("1"))

    user: Mapped["User"] = relationship(back_populates="category_weights")
    # Join on both columns, but only category_id is "foreign" for the ORM:
    # user_id is owned by `user` above. Setting `.category = c` copies c.id
    # into category_id; user_id must match c.user_id (the composite FK
    # rejects it otherwise).
    category: Mapped["Category"] = relationship(
        primaryjoin="and_(CategoryWeight.user_id == Category.user_id, "
        "foreign(CategoryWeight.category_id) == Category.id)",
    )

    __table_args__ = (
        ForeignKeyConstraint(
            ["user_id", "category_id"],
            ["categories.user_id", "categories.id"],
            ondelete="CASCADE",
            name="fk_category_weights_user_id_category_id_categories",
        ),
        CheckConstraint("weight > 0", name="ck_category_weights_weight_positive"),
    )

    def __repr__(self) -> str:  # pragma: no cover
        return (
            f"CategoryWeight(user_id={self.user_id!r}, category_id={self.category_id!r}, "
            f"weight={self.weight!r})"
        )
