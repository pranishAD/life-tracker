"""Pydantic v2 schemas for the `goals` tag of docs/api-contract.yaml (1.1.0).

Field-level bounds live here; the cross-field type rules (GoalCreateRequest's
description: numeric start/target/direction, habit schedules, which fields a
type may send, start_date <= deadline) live in app/services/goal_rules.py,
because PATCH must apply them to the *merged* goal, not just the request.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models import FrequencyType, GoalStatus, GoalType, IdentityColor, NumericDirection
from app.schemas.categories import CategoryRef
from app.schemas.common import (
    DESCRIPTION_MAX_LENGTH,
    MAX_STARTER_MILESTONES,
    TITLE_MAX_LENGTH,
    UNIT_MAX_LENGTH,
    BoundedDate,
    Emoji,
    FrequencyPerWeek,
    NonNegativeLargeNumber,
    Weekday,
    Weight,
    WhyText,
)
from app.schemas.milestones import MilestoneCreateRequest, MilestoneOut


class GoalOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    title: str
    description: Optional[str] = None
    category_id: uuid.UUID
    category: CategoryRef
    emoji: Optional[str] = None
    color: Optional[IdentityColor] = None
    type: GoalType
    start_value: Optional[float] = None
    target_value: Optional[float] = None
    current_value: Optional[float] = None
    unit: Optional[str] = None
    direction: Optional[NumericDirection] = None
    frequency_type: Optional[FrequencyType] = None
    frequency_per_week: Optional[int] = None
    weekdays: Optional[list[int]] = None
    why: Optional[str] = None
    check_in_count: int
    archived_at: Optional[datetime] = None
    start_date: date
    deadline: Optional[date] = None
    weight: float
    status: GoalStatus
    milestones: list[MilestoneOut] = Field(default_factory=list)
    created_at: datetime


def build_goal_out(goal: Any, check_in_count: int) -> GoalOut:
    """GoalOut from an ORM Goal + its check-in count (not a column)."""
    data = {name: getattr(goal, name) for name in GoalOut.model_fields if name != "check_in_count"}
    data["category"] = CategoryRef.model_validate(goal.category)
    data["milestones"] = [MilestoneOut.model_validate(m) for m in goal.milestones]
    data["check_in_count"] = check_in_count
    return GoalOut.model_validate(data)


def _reject_duplicate_weekdays(value: Optional[list[int]]) -> Optional[list[int]]:
    # Contract: uniqueItems -> duplicates are a 422, not silently deduped.
    if value is not None and len(set(value)) != len(value):
        raise ValueError("weekdays must not contain duplicates")
    return value


class GoalCreateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=TITLE_MAX_LENGTH)
    description: Optional[str] = Field(default=None, max_length=DESCRIPTION_MAX_LENGTH)
    category_id: uuid.UUID
    emoji: Optional[Emoji] = None
    color: Optional[IdentityColor] = None
    type: GoalType
    start_value: Optional[NonNegativeLargeNumber] = None
    target_value: Optional[NonNegativeLargeNumber] = None
    unit: Optional[str] = Field(default=None, max_length=UNIT_MAX_LENGTH)
    direction: Optional[NumericDirection] = None
    frequency_type: Optional[FrequencyType] = None
    frequency_per_week: Optional[FrequencyPerWeek] = None
    weekdays: Optional[list[Weekday]] = Field(default=None, min_length=1, max_length=7)
    why: Optional[WhyText] = None
    milestones: list[MilestoneCreateRequest] = Field(
        default_factory=list, max_length=MAX_STARTER_MILESTONES
    )
    start_date: BoundedDate
    deadline: Optional[BoundedDate] = None
    weight: Weight = 1.0

    _weekdays_unique = field_validator("weekdays")(_reject_duplicate_weekdays)


class GoalUpdateRequest(BaseModel):
    """Every field optional; absent = unchanged. Explicit null is only
    accepted for the contract's nullable fields (routers/goals.py rejects it
    for title/category_id/type/start_date/weight/status)."""

    title: Optional[str] = Field(default=None, min_length=1, max_length=TITLE_MAX_LENGTH)
    description: Optional[str] = Field(default=None, max_length=DESCRIPTION_MAX_LENGTH)
    category_id: Optional[uuid.UUID] = None
    emoji: Optional[Emoji] = None
    color: Optional[IdentityColor] = None
    type: Optional[GoalType] = None
    start_value: Optional[NonNegativeLargeNumber] = None
    target_value: Optional[NonNegativeLargeNumber] = None
    unit: Optional[str] = Field(default=None, max_length=UNIT_MAX_LENGTH)
    direction: Optional[NumericDirection] = None
    frequency_type: Optional[FrequencyType] = None
    frequency_per_week: Optional[FrequencyPerWeek] = None
    weekdays: Optional[list[Weekday]] = Field(default=None, min_length=1, max_length=7)
    why: Optional[WhyText] = None
    start_date: Optional[BoundedDate] = None
    deadline: Optional[BoundedDate] = None
    weight: Optional[Weight] = None
    status: Optional[GoalStatus] = None

    _weekdays_unique = field_validator("weekdays")(_reject_duplicate_weekdays)


NON_NULLABLE_UPDATE_FIELDS = ("title", "category_id", "type", "start_date", "weight", "status")
