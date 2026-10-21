"""Per-user categories (api-contract 1.1.0 `categories` tag): seeding the 4
defaults, ownership-scoped lookups, goal counts and sort_order upkeep.

Shared by routers/auth.py (seed on register), routers/categories.py,
routers/goals.py (INVALID_CATEGORY), routers/settings.py and
services/dashboard_service.py (every category in sort_order).
"""

from __future__ import annotations

import uuid
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.errors import AppError, conflict, not_found
from app.models import DEFAULT_CATEGORIES, Category, Goal

NAME_LOWER_INDEX = "ix_categories_user_id_name_lower"


def seed_default_categories(db: Session, user_id: uuid.UUID) -> list[Category]:
    """Add (not commit) the 4 default categories for a new user, so the caller
    commits them in the same transaction as the user row."""
    rows = [Category(user_id=user_id, **d._asdict()) for d in DEFAULT_CATEGORIES]
    db.add_all(rows)
    return rows


def ordered_categories(db: Session, user_id: uuid.UUID) -> list[Category]:
    """The user's categories in display order. sort_order isn't unique in the
    DB, so ties fall back to created_at then id (models/category.py)."""
    return list(
        db.scalars(
            select(Category)
            .where(Category.user_id == user_id)
            .order_by(Category.sort_order, Category.created_at, Category.id)
        ).all()
    )


def goal_counts(db: Session, user_id: uuid.UUID) -> dict[uuid.UUID, int]:
    """Goals per category, any status (archived included)."""
    rows = db.execute(
        select(Goal.category_id, func.count(Goal.id))
        .where(Goal.user_id == user_id)
        .group_by(Goal.category_id)
    ).all()
    return {category_id: count for category_id, count in rows}


def get_owned_category(db: Session, user_id: uuid.UUID, category_id: uuid.UUID) -> Category:
    category = db.scalar(
        select(Category).where(Category.id == category_id, Category.user_id == user_id)
    )
    if category is None:
        raise not_found("Category not found.")
    return category


def find_owned_category(
    db: Session, user_id: uuid.UUID, category_id: Optional[uuid.UUID]
) -> Optional[Category]:
    if category_id is None:
        return None
    return db.scalar(
        select(Category).where(Category.id == category_id, Category.user_id == user_id)
    )


def invalid_category() -> AppError:
    return AppError(422, "INVALID_CATEGORY", "category_id is not one of your categories.")


def require_owned_category_for_goal(
    db: Session, user_id: uuid.UUID, category_id: uuid.UUID
) -> Category:
    """For goal create/patch: another user's / unknown category -> 422
    INVALID_CATEGORY (a body field, not the resource in the path)."""
    category = find_owned_category(db, user_id, category_id)
    if category is None:
        raise invalid_category()
    return category


def name_taken() -> AppError:
    return conflict("CATEGORY_NAME_TAKEN", "You already have a category with this name.")


def is_name_taken(
    db: Session, user_id: uuid.UUID, name: str, exclude_id: Optional[uuid.UUID] = None
) -> bool:
    # lower() on both sides in SQL, so the comparison uses exactly the same
    # case folding as the unique index ix_categories_user_id_name_lower.
    stmt = select(Category.id).where(
        Category.user_id == user_id, func.lower(Category.name) == func.lower(name)
    )
    if exclude_id is not None:
        stmt = stmt.where(Category.id != exclude_id)
    return db.scalar(stmt.limit(1)) is not None


def is_name_index_violation(exc: IntegrityError) -> bool:
    """True if the IntegrityError is the case-insensitive unique name index
    (two concurrent creates/renames both passing `is_name_taken`)."""
    diag = getattr(getattr(exc, "orig", None), "diag", None)
    constraint = getattr(diag, "constraint_name", None)
    if constraint:
        return constraint == NAME_LOWER_INDEX
    return NAME_LOWER_INDEX in str(exc)


def renumber(categories: list[Category]) -> None:
    """Rewrite sort_order to 0..n-1 in the given order."""
    for index, category in enumerate(categories):
        if category.sort_order != index:
            category.sort_order = index


__all__ = [
    "seed_default_categories",
    "ordered_categories",
    "goal_counts",
    "get_owned_category",
    "find_owned_category",
    "invalid_category",
    "require_owned_category_for_goal",
    "name_taken",
    "is_name_taken",
    "is_name_index_violation",
    "renumber",
]
