"""Pydantic v2 schemas for the `categories` tag of docs/api-contract.yaml
(CategoryRef, Category, CategoryCreateRequest, CategoryUpdateRequest,
CategoryOrderRequest).
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from app.models import IdentityColor
from app.schemas.common import MAX_CATEGORIES_PER_USER, CategoryName, Emoji


class CategoryRef(BaseModel):
    """The category fields embedded in a Goal and in dashboard category scores."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    emoji: str
    color: IdentityColor


class CategoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    emoji: str
    color: IdentityColor
    sort_order: int
    is_default: bool
    goal_count: int
    created_at: datetime


class CategoryCreateRequest(BaseModel):
    name: CategoryName
    emoji: Emoji
    color: IdentityColor


class CategoryUpdateRequest(BaseModel):
    # Not nullable in the contract: an explicit null is rejected by the
    # router (see routers/categories.py), "absent" means "leave as is".
    name: Optional[CategoryName] = None
    emoji: Optional[Emoji] = None
    color: Optional[IdentityColor] = None


class CategoryOrderRequest(BaseModel):
    category_ids: list[uuid.UUID] = Field(min_length=1, max_length=MAX_CATEGORIES_PER_USER)
