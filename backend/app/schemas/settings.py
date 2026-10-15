"""Pydantic v2 schemas for the `settings` tag of docs/api-contract.yaml.

Note: api-contract.yaml's CategoryWeights.weights[].weight declares
`minimum: 0`, but the DB's category_weights.weight column has
`CHECK (weight > 0)` (see app/models/category_weight.py) -- 0 would be
accepted by the contract's schema but rejected by the database. We enforce
`gt=0` here (stricter than the documented `minimum: 0`) so a bad request
fails with a clean 422 instead of a 500 from the DB constraint. Flagged in
the handoff note as a "Proposed changes" item rather than silently
reinterpreting the contract.
"""

from __future__ import annotations

from pydantic import BaseModel, Field

from app.models import Category


class CategoryWeightItem(BaseModel):
    category: Category
    weight: float = Field(gt=0)


class CategoryWeightsOut(BaseModel):
    weights: list[CategoryWeightItem]


class CategoryWeightsUpdateRequest(BaseModel):
    weights: list[CategoryWeightItem]
