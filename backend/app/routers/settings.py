"""GET/PUT /settings/category-weights (docs/api-contract.yaml `settings`
tag, US-18). Keyed by category_id since 1.1.0.
"""

from __future__ import annotations

import uuid
from decimal import Decimal

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.deps import get_current_user
from app.models import CategoryWeight, User
from app.schemas.settings import CategoryWeightsOut, CategoryWeightsUpdateRequest
from app.services.categories import invalid_category, ordered_categories
from app.services.dashboard_service import get_category_weights_map
from db.session import get_session

router = APIRouter(tags=["settings"])


def _to_out(weights_map: dict[uuid.UUID, float]) -> CategoryWeightsOut:
    # get_category_weights_map is already in sort_order, every category listed.
    return CategoryWeightsOut(
        weights=[{"category_id": cid, "weight": weight} for cid, weight in weights_map.items()]
    )


@router.get("/settings/category-weights", response_model=CategoryWeightsOut)
def get_category_weights(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
) -> CategoryWeightsOut:
    return _to_out(get_category_weights_map(db, current_user.id))


@router.put("/settings/category-weights", response_model=CategoryWeightsOut)
def update_category_weights(
    payload: CategoryWeightsUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
) -> CategoryWeightsOut:
    # Validate every id before writing anything: a foreign / unknown id is
    # 422 INVALID_CATEGORY and nothing is saved.
    own_ids = {c.id for c in ordered_categories(db, current_user.id)}
    for item in payload.weights:
        if item.category_id not in own_ids:
            raise invalid_category()

    # Upsert only the categories given: others keep their previous value
    # (or the default 1 if never set).
    existing = {
        row.category_id: row
        for row in db.scalars(
            select(CategoryWeight).where(CategoryWeight.user_id == current_user.id)
        ).all()
    }
    for item in payload.weights:
        row = existing.get(item.category_id)
        if row is None:
            row = CategoryWeight(
                user_id=current_user.id,
                category_id=item.category_id,
                weight=Decimal(str(item.weight)),
            )
            db.add(row)
            existing[item.category_id] = row
        else:
            row.weight = Decimal(str(item.weight))

    db.commit()
    return _to_out(get_category_weights_map(db, current_user.id))
