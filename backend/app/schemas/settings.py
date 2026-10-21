"""Pydantic v2 schemas for the `settings` tag of docs/api-contract.yaml.

Category weight bounds (> 0 and < 1000, no NaN/Infinity) match the
contract's CategoryWeights schema, the DB's CHECK (weight > 0) and its
Numeric(5,2) column -- see app/schemas/common.py `Weight` (SEC-006).
Since 1.1.0 rows are keyed by the user's category_id.
"""

from __future__ import annotations

import uuid

from pydantic import BaseModel

from app.schemas.common import Weight


class CategoryWeightItem(BaseModel):
    category_id: uuid.UUID
    weight: Weight


class CategoryWeightsOut(BaseModel):
    weights: list[CategoryWeightItem]


class CategoryWeightsUpdateRequest(BaseModel):
    weights: list[CategoryWeightItem]
