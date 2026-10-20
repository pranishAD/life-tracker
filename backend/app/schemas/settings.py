"""Pydantic v2 schemas for the `settings` tag of docs/api-contract.yaml.

Category weight bounds (> 0 and < 1000, no NaN/Infinity) match the
contract's CategoryWeights schema, the DB's CHECK (weight > 0) and its
Numeric(5,2) column -- see app/schemas/common.py `Weight` (SEC-006).
"""

from __future__ import annotations

from pydantic import BaseModel

from app.models import Category
from app.schemas.common import Weight


class CategoryWeightItem(BaseModel):
    category: Category
    weight: Weight


class CategoryWeightsOut(BaseModel):
    weights: list[CategoryWeightItem]


class CategoryWeightsUpdateRequest(BaseModel):
    weights: list[CategoryWeightItem]
