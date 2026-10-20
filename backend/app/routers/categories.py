"""GET/POST /categories, PATCH /categories/order, PATCH/DELETE
/categories/{categoryId} (docs/api-contract.yaml 1.1.0 `categories` tag,
screens 12 / 12b).

Another user's (or a missing) category in the path is always 404. Known
race, accepted: two concurrent creates can both pass the 12-category count
check and leave the user with 13 (there is no DB constraint for the limit).
The equivalent name race IS caught: the unique index on lower(name) fails
the second insert, which is mapped to 409 CATEGORY_NAME_TAKEN.
"""

from __future__ import annotations

import uuid
from typing import Optional

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.deps import get_current_user
from app.errors import AppError, conflict, validation_error
from app.models import Category, Goal, User
from app.schemas.categories import (
    CategoryCreateRequest,
    CategoryOrderRequest,
    CategoryOut,
    CategoryUpdateRequest,
)
from app.schemas.common import MAX_CATEGORIES_PER_USER
from app.services.categories import (
    get_owned_category,
    goal_counts,
    is_name_index_violation,
    is_name_taken,
    name_taken,
    ordered_categories,
    renumber,
)
from db.session import get_session

router = APIRouter(tags=["categories"])


def _to_out(category: Category, counts: dict[uuid.UUID, int]) -> CategoryOut:
    return CategoryOut(
        id=category.id,
        name=category.name,
        emoji=category.emoji,
        color=category.color,
        sort_order=category.sort_order,
        is_default=category.is_default,
        goal_count=counts.get(category.id, 0),
        created_at=category.created_at,
    )


def _list_out(db: Session, user_id: uuid.UUID) -> list[CategoryOut]:
    counts = goal_counts(db, user_id)
    return [_to_out(c, counts) for c in ordered_categories(db, user_id)]


def _commit_or_name_conflict(db: Session) -> None:
    try:
        db.flush()
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        if is_name_index_violation(exc):
            raise name_taken() from exc
        raise


@router.get("/categories", response_model=list[CategoryOut])
def list_categories(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
) -> list[CategoryOut]:
    return _list_out(db, current_user.id)


@router.post("/categories", response_model=CategoryOut, status_code=201)
def create_category(
    payload: CategoryCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
) -> CategoryOut:
    count, max_order = db.execute(
        select(func.count(Category.id), func.max(Category.sort_order)).where(
            Category.user_id == current_user.id
        )
    ).one()
    if count >= MAX_CATEGORIES_PER_USER:
        raise conflict(
            "CATEGORY_LIMIT_REACHED",
            f"You can have at most {MAX_CATEGORIES_PER_USER} categories.",
        )
    if is_name_taken(db, current_user.id, payload.name):
        raise name_taken()

    category = Category(
        user_id=current_user.id,
        name=payload.name,
        emoji=payload.emoji,
        color=payload.color,
        sort_order=(max_order + 1) if max_order is not None else 0,
    )
    db.add(category)
    _commit_or_name_conflict(db)
    db.refresh(category)
    return _to_out(category, {})


# Registered before /categories/{categoryId} so "order" is never parsed as an id.
@router.patch("/categories/order", response_model=list[CategoryOut])
def reorder_categories(
    payload: CategoryOrderRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
) -> list[CategoryOut]:
    categories = ordered_categories(db, current_user.id)
    by_id = {c.id: c for c in categories}
    ids = payload.category_ids
    if len(ids) != len(set(ids)) or set(ids) != set(by_id):
        raise validation_error(
            "category_ids must list every one of your categories exactly once."
        )

    renumber([by_id[i] for i in ids])
    db.commit()
    return _list_out(db, current_user.id)


@router.patch("/categories/{categoryId}", response_model=CategoryOut)
def update_category(
    categoryId: uuid.UUID,
    payload: CategoryUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
) -> CategoryOut:
    category = get_owned_category(db, current_user.id, categoryId)

    provided = payload.model_dump(exclude_unset=True)
    if not provided:
        raise validation_error("At least one field is required.")
    for field, value in provided.items():
        if value is None:
            raise validation_error(f"{field} cannot be null.")

    if "name" in provided:
        if is_name_taken(db, current_user.id, payload.name, exclude_id=category.id):
            raise name_taken()
        category.name = payload.name
    if "emoji" in provided:
        category.emoji = payload.emoji
    if "color" in provided:
        category.color = payload.color

    _commit_or_name_conflict(db)
    db.refresh(category)
    return _to_out(category, goal_counts(db, current_user.id))


def _invalid_move_target() -> AppError:
    return AppError(
        422, "INVALID_MOVE_TARGET", "move_to must be another one of your categories."
    )


@router.delete("/categories/{categoryId}", status_code=204)
def delete_category(
    categoryId: uuid.UUID,
    # Parsed by hand (not uuid.UUID) so a malformed id is INVALID_MOVE_TARGET
    # like any other bad target, and is ignored for an empty category.
    move_to: Optional[str] = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
) -> Response:
    category = get_owned_category(db, current_user.id, categoryId)
    if category.is_default:
        raise conflict("CATEGORY_IS_DEFAULT", "Default categories can't be deleted.")

    goal_count = db.scalar(
        select(func.count(Goal.id)).where(
            Goal.user_id == current_user.id, Goal.category_id == category.id
        )
    )
    if goal_count:
        if move_to is None:
            raise conflict(
                "CATEGORY_HAS_GOALS",
                "This category has goals. Choose a category to move them to (move_to).",
            )
        try:
            target_id = uuid.UUID(move_to)
        except ValueError as exc:
            raise _invalid_move_target() from exc
        if target_id == category.id:
            raise _invalid_move_target()
        target = db.scalar(
            select(Category).where(Category.id == target_id, Category.user_id == current_user.id)
        )
        if target is None:
            raise _invalid_move_target()

        # Every goal, any status (archived too), moves before the delete;
        # the goals FK is ON DELETE RESTRICT, so a missed goal would fail it.
        db.execute(
            update(Goal)
            .where(Goal.user_id == current_user.id, Goal.category_id == category.id)
            .values(category_id=target.id)
            .execution_options(synchronize_session="fetch")
        )

    # The category's category_weights row goes with it (FK ON DELETE CASCADE).
    db.delete(category)
    db.flush()
    renumber(ordered_categories(db, current_user.id))
    db.commit()
    return Response(status_code=204)
