"""GET/PUT /settings/category-weights (docs/api-contract.yaml `settings`
tag, US-18).
"""

from __future__ import annotations

from decimal import Decimal

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.deps import get_current_user
from app.models import CategoryWeight, User
from app.schemas.settings import CategoryWeightsOut, CategoryWeightsUpdateRequest
from app.services.dashboard_service import get_category_weights_map
from db.session import get_session

router = APIRouter(tags=["settings"])


def _to_out(weights_map: dict) -> CategoryWeightsOut:
    return CategoryWeightsOut(
        weights=[{"category": category, "weight": weight} for category, weight in weights_map.items()]
    )


@router.get("/settings/category-weights", response_model=CategoryWeightsOut)
def get_category_weights(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
) -> CategoryWeightsOut:
    weights_map = get_category_weights_map(db, current_user.id)
    return _to_out(weights_map)


@router.put("/settings/category-weights", response_model=CategoryWeightsOut)
def update_category_weights(
    payload: CategoryWeightsUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
) -> CategoryWeightsOut:
    # Upsert only the categories given (app/models/category_weight.py
    # docstring): categories not included keep their previous value (or the
    # default-equal fallback if never set).
    existing = {
        row.category: row
        for row in db.scalars(
            select(CategoryWeight).where(CategoryWeight.user_id == current_user.id)
        ).all()
    }

    for item in payload.weights:
        row = existing.get(item.category)
        if row is None:
            row = CategoryWeight(user_id=current_user.id, category=item.category, weight=Decimal(str(item.weight)))
            db.add(row)
        else:
            row.weight = Decimal(str(item.weight))

    db.commit()

    weights_map = get_category_weights_map(db, current_user.id)
    return _to_out(weights_map)
