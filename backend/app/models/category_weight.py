from __future__ import annotations

import uuid
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, ForeignKey, Numeric, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, TimestampMixin
from .enums import Category, category_enum

if TYPE_CHECKING:
    from .user import User


class CategoryWeight(TimestampMixin, Base):
    """One row per (user, category) the user has an explicit weight for.

    A user with NO rows here uses equal weights for every category (API
    contract: "default equal if unset") — that default is applied by the
    service layer reading this table, not stored in it. PUT
    /settings/category-weights should upsert rows for the categories given
    (insert new, update existing via the composite PK).
    """

    __tablename__ = "category_weights"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    category: Mapped[Category] = mapped_column(category_enum, primary_key=True)
    weight: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False, server_default=text("1"))

    user: Mapped["User"] = relationship(back_populates="category_weights")

    __table_args__ = (CheckConstraint("weight > 0", name="ck_category_weights_weight_positive"),)

    def __repr__(self) -> str:  # pragma: no cover
        return f"CategoryWeight(user_id={self.user_id!r}, category={self.category!r}, weight={self.weight!r})"
